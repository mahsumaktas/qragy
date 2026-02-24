"use strict";

/**
 * Adaptive Chat Pipeline
 *
 * Orchestrates FAST/STANDARD/DEEP routing based on query analysis.
 * Single entry point: process(input) -> { reply, route, analysis, citations, ragResults, finishReason }
 *
 * Routes:
 *   FAST     -> no retrieval, direct LLM (greetings, chitchat)
 *   STANDARD -> hybridSearch + rerank + LLM
 *   DEEP     -> hybridSearch + rerank + CRAG evaluate + retry if insufficient + LLM
 *
 * Factory pattern: createChatPipeline(deps)
 */

function createChatPipeline(deps) {
  const {
    queryAnalyzer,
    searchEngine,
    reranker,
    cragEvaluator,
    memoryEngine,
    reflexion,
    graphQuery,
    qualityScorer,
    promptBuilder,
    callLLM,
    getProviderConfig,
    logger = { info() {}, warn() {}, error() {} },
  } = deps;

  /**
   * STANDARD path: search + rerank.
   * @returns {{ ragResults: Array, citations: Array }}
   */
  async function standardPath(query, knowledgeBase, kbSize) {
    const searchResults = await searchEngine.hybridSearch(query, { knowledgeBase, kbSize });
    if (searchResults.length === 0) {
      logger.info("chatPipeline:STANDARD", "Arama sonucu yok", { query: query.slice(0, 100) });
      return { ragResults: [], citations: [] };
    }

    const reranked = await reranker.rerank(query, searchResults);

    // Filter low-relevance results (keep at least 1)
    const MIN_RERANK_SCORE = 0.3;
    const filtered = reranked.filter(r => (r._rerankScore || 0) >= MIN_RERANK_SCORE);
    const finalResults = filtered.length > 0 ? filtered : reranked.slice(0, 1);

    logger.info("chatPipeline:STANDARD", "RAG tamamlandi", {
      searchHits: searchResults.length,
      afterRerank: reranked.length,
      afterFilter: finalResults.length,
      topScore: finalResults[0]?._rerankScore?.toFixed(3) || "N/A",
      topQ: (finalResults[0]?.question || "").slice(0, 80),
    });

    const citations = searchEngine.formatCitations(finalResults);
    return { ragResults: finalResults, citations };
  }

  /**
   * DEEP path: search + rerank + CRAG evaluate + retry on insufficient.
   * Max retries: cragEvaluator.MAX_REWRITE_ATTEMPTS
   * @returns {{ ragResults: Array, citations: Array }}
   */
  async function deepPath(query, knowledgeBase, kbSize) {
    let currentQuery = query;
    const maxRetries = cragEvaluator.MAX_REWRITE_ATTEMPTS;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const searchResults = await searchEngine.hybridSearch(currentQuery, { knowledgeBase, kbSize });

      if (searchResults.length === 0 && attempt < maxRetries) {
        const rewritten = await cragEvaluator.suggestRewrite(currentQuery);
        logger.info("chatPipeline:DEEP", "Sonuc yok, sorgu yeniden yazildi", { attempt, original: currentQuery.slice(0, 80), rewritten: rewritten.slice(0, 80) });
        currentQuery = rewritten;
        continue;
      }

      if (searchResults.length === 0) {
        logger.info("chatPipeline:DEEP", "Tum denemelerde sonuc yok", { attempts: attempt + 1 });
        return { ragResults: [], citations: [] };
      }

      const reranked = await reranker.rerank(currentQuery, searchResults);
      const evaluation = await cragEvaluator.evaluate(currentQuery, reranked);

      logger.info("chatPipeline:DEEP", "CRAG degerlendirme", {
        attempt,
        searchHits: searchResults.length,
        relevant: evaluation.relevant?.length || 0,
        partial: evaluation.partial?.length || 0,
        insufficient: !!evaluation.insufficient,
      });

      if (!evaluation.insufficient || attempt === maxRetries) {
        const usableResults = [...evaluation.relevant, ...evaluation.partial];
        const finalResults = usableResults.length > 0 ? usableResults : reranked;
        const citations = searchEngine.formatCitations(finalResults);
        return { ragResults: finalResults, citations };
      }

      const rewritten = await cragEvaluator.suggestRewrite(currentQuery);
      logger.info("chatPipeline:DEEP", "Yetersiz, sorgu yeniden yaziliyor", { rewritten: rewritten.slice(0, 80) });
      currentQuery = rewritten;
    }

    return { ragResults: [], citations: [] };
  }

  /**
   * Main pipeline entry point.
   *
   * @param {Object} input
   * @param {string} input.userMessage
   * @param {Array}  input.chatHistory
   * @param {string} input.sessionId
   * @param {string} input.userId
   * @param {Array}  input.knowledgeBase
   * @param {number} input.kbSize
   * @param {Object} input.memory
   * @param {Object} input.conversationContext
   * @param {Object} input.options
   * @returns {Promise<{ reply, route, analysis, citations, ragResults, finishReason }>}
   */
  async function process(input) {
    const {
      userMessage,
      chatHistory = [],
      sessionId,
      userId,
      knowledgeBase = [],
      kbSize,
      memory,
      conversationContext,
      options = {},
    } = input;

    // 1. Query analysis — route, standaloneQuery, etc.
    const analysis = await queryAnalyzer.analyze(userMessage, chatHistory);
    const { route, standaloneQuery } = analysis;

    logger.info("chatPipeline", "Sorgu analizi", {
      sessionId,
      route,
      intent: analysis.intent,
      complexity: analysis.complexity,
      userMsg: userMessage.slice(0, 100),
      standalone: standaloneQuery !== userMessage ? standaloneQuery.slice(0, 100) : "(ayni)",
      historyLen: chatHistory.length,
      subQueries: analysis.subQueries?.length || 0,
    });

    // 2. Load memory context
    const memoryContext = await memoryEngine.loadContext(userId, standaloneQuery, analysis);

    logger.info("chatPipeline", "Memory context yuklendi", {
      sessionId,
      coreLen: memoryContext.coreMemory ? memoryContext.coreMemory.length : 0,
      recallLen: memoryContext.recallMemory ? memoryContext.recallMemory.length : 0,
    });

    // 3. Route-based retrieval
    let ragResults = [];
    let citations = [];

    if (route === "FAST") {
      logger.info("chatPipeline", "FAST route — retrieval atlanildi", { sessionId });
    } else if (route === "DEEP") {
      // Process subQueries in parallel if available
      const subQueries = Array.isArray(analysis.subQueries) && analysis.subQueries.length > 0
        ? analysis.subQueries
        : null;

      if (subQueries) {
        logger.info("chatPipeline:DEEP", "Sub-query paralel arama", {
          sessionId,
          mainQuery: standaloneQuery.slice(0, 80),
          subQueryCount: subQueries.length,
          subQueries: subQueries.map(q => q.slice(0, 60)),
        });

        const allSearches = await Promise.all(
          [standaloneQuery, ...subQueries].map(q =>
            searchEngine.hybridSearch(q, { knowledgeBase, kbSize })
          )
        );

        // Deduplicate by question text, keep highest rrfScore
        const seen = new Map();
        for (const results of allSearches) {
          for (const r of results) {
            const key = (r.question || r.text || "").trim().toLowerCase();
            if (!key) continue;
            const existing = seen.get(key);
            if (!existing || (r.rrfScore || 0) > (existing.rrfScore || 0)) {
              seen.set(key, r);
            }
          }
        }
        const mergedResults = [...seen.values()];

        logger.info("chatPipeline:DEEP", "Sub-query merge sonucu", {
          sessionId,
          perQueryHits: allSearches.map(r => r.length),
          totalBeforeDedup: allSearches.reduce((s, r) => s + r.length, 0),
          afterDedup: mergedResults.length,
        });

        if (mergedResults.length > 0) {
          const reranked = await reranker.rerank(standaloneQuery, mergedResults);
          const evaluation = await cragEvaluator.evaluate(standaloneQuery, reranked);
          const usableResults = [...evaluation.relevant, ...evaluation.partial];
          ragResults = usableResults.length > 0 ? usableResults : reranked;
          citations = searchEngine.formatCitations(ragResults);
        }
      } else {
        const deepResult = await deepPath(standaloneQuery, knowledgeBase, kbSize);
        ragResults = deepResult.ragResults;
        citations = deepResult.citations;
      }
    } else {
      // STANDARD (default)
      const standardResult = await standardPath(standaloneQuery, knowledgeBase, kbSize);
      ragResults = standardResult.ragResults;
      citations = standardResult.citations;
    }

    // 4. Additional context
    const reflexionWarnings = await reflexion.getWarnings(analysis.intent, { standaloneQuery });

    let graphContext = "";
    if (analysis.requiresGraph) {
      graphContext = await graphQuery.formatForPrompt(standaloneQuery);
    }

    // 5. Build system prompt
    const promptOptions = {
      ...options,
      coreMemoryText: memoryContext.coreMemory,
      recallMemoryText: memoryContext.recallMemory,
      reflexionWarnings,
      graphContext,
    };

    const systemPrompt = promptBuilder.buildSystemPrompt(
      memory,
      conversationContext,
      ragResults,
      promptOptions,
    );

    // 6. Replace last user message with standaloneQuery (resolve pronouns)
    let llmHistory = chatHistory;
    if (standaloneQuery && standaloneQuery !== userMessage && chatHistory.length > 0) {
      llmHistory = chatHistory.slice();
      for (let i = llmHistory.length - 1; i >= 0; i--) {
        if (llmHistory[i].role === "user") {
          llmHistory[i] = { ...llmHistory[i], parts: [{ text: standaloneQuery }] };
          break;
        }
      }
    }

    // 7. Call LLM
    const cfg = getProviderConfig();
    const maxTokens = cfg.maxOutputTokens || 2048;

    logger.info("chatPipeline", "LLM cagrisi", {
      sessionId,
      model: cfg.model,
      provider: cfg.provider,
      maxTokens,
      promptLen: systemPrompt.length,
      ragCount: ragResults.length,
      historyMsgs: llmHistory.length,
    });

    const llmResult = await callLLM(llmHistory, systemPrompt, maxTokens, cfg);

    let { reply } = llmResult;
    const { finishReason } = llmResult;

    logger.info("chatPipeline", "LLM cevabi", {
      sessionId,
      finishReason,
      replyLen: reply.length,
      replyPreview: reply.slice(0, 150),
    });

    // 8. Quality scoring — await so we can act on low quality
    try {
      const scoreResult = await qualityScorer.score({
        query: standaloneQuery,
        answer: reply,
        ragResults,
        sessionId,
      });

      if (scoreResult) {
        logger.info("chatPipeline", "Kalite skoru", {
          sessionId,
          faithfulness: scoreResult.faithfulness,
          relevancy: scoreResult.relevancy,
          confidence: scoreResult.confidence,
          isLowQuality: scoreResult.isLowQuality,
          ragResultCount: scoreResult.ragResultCount,
        });
      }

      if (scoreResult && scoreResult.isLowQuality) {
        reply += "\n\n(Bu cevap yetersiz olabilir. Detayli bilgi icin canli destek temsilcimize baglayabilirim.)";
      }
    } catch (err) {
      logger.warn("chatPipeline", "qualityScorer hatasi", err);
    }

    // 9. Fire-and-forget async post-processing
    Promise.resolve().then(() =>
      memoryEngine.updateAfterConversation(userId, sessionId, chatHistory, reply),
    ).catch((err) => {
      logger.warn("chatPipeline", "memoryEngine async hatasi", err);
    });

    // 10. Return result
    return {
      reply,
      route,
      analysis,
      citations,
      ragResults,
      finishReason,
    };
  }

  return { process };
}

module.exports = { createChatPipeline };

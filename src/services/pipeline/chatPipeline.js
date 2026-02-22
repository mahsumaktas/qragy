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
      return { ragResults: [], citations: [] };
    }

    const reranked = await reranker.rerank(query, searchResults);

    // Filter low-relevance results (keep at least 1)
    const MIN_RERANK_SCORE = 0.3;
    const filtered = reranked.filter(r => (r._rerankScore || 0) >= MIN_RERANK_SCORE);
    const finalResults = filtered.length > 0 ? filtered : reranked.slice(0, 1);

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
        currentQuery = await cragEvaluator.suggestRewrite(currentQuery);
        continue;
      }

      if (searchResults.length === 0) {
        return { ragResults: [], citations: [] };
      }

      const reranked = await reranker.rerank(currentQuery, searchResults);
      const evaluation = await cragEvaluator.evaluate(currentQuery, reranked);

      if (!evaluation.insufficient || attempt === maxRetries) {
        // Use relevant + partial results; fall back to all reranked if nothing classified
        const usableResults = [...evaluation.relevant, ...evaluation.partial];
        const finalResults = usableResults.length > 0 ? usableResults : reranked;
        const citations = searchEngine.formatCitations(finalResults);
        return { ragResults: finalResults, citations };
      }

      // Insufficient — rewrite query and retry
      currentQuery = await cragEvaluator.suggestRewrite(currentQuery);
    }

    // Should not reach here, but safety fallback
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

    // 2. Load memory context
    const memoryContext = await memoryEngine.loadContext(userId, standaloneQuery, analysis);

    // 3. Route-based retrieval
    let ragResults = [];
    let citations = [];

    if (route === "FAST") {
      // No retrieval
    } else if (route === "DEEP") {
      // Process subQueries in parallel if available
      const subQueries = Array.isArray(analysis.subQueries) && analysis.subQueries.length > 0
        ? analysis.subQueries
        : null;

      if (subQueries) {
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
    const llmResult = await callLLM(llmHistory, systemPrompt, maxTokens, cfg);

    let { reply, finishReason } = llmResult;

    // 8. Quality scoring — await so we can act on low quality
    try {
      const scoreResult = await qualityScorer.score({
        query: standaloneQuery,
        answer: reply,
        ragResults,
        sessionId,
      });

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

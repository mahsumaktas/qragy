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
    const citations = searchEngine.formatCitations(reranked);

    return { ragResults: reranked, citations };
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
      const deepResult = await deepPath(standaloneQuery, knowledgeBase, kbSize);
      ragResults = deepResult.ragResults;
      citations = deepResult.citations;
    } else {
      // STANDARD (default)
      const standardResult = await standardPath(standaloneQuery, knowledgeBase, kbSize);
      ragResults = standardResult.ragResults;
      citations = standardResult.citations;
    }

    // 4. Additional context
    const reflexionWarnings = await reflexion.getWarnings(analysis.intent);

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

    // 6. Call LLM
    const cfg = getProviderConfig();
    const maxTokens = cfg.maxOutputTokens || 2048;
    const llmResult = await callLLM(chatHistory, systemPrompt, maxTokens, cfg);

    const { reply, finishReason } = llmResult;

    // 7. Fire-and-forget async post-processing
    Promise.resolve().then(() =>
      qualityScorer.score({
        query: standaloneQuery,
        answer: reply,
        ragResults,
        sessionId,
      }),
    ).catch((err) => {
      logger.warn("chatPipeline", "qualityScorer async hatasi", err);
    });

    Promise.resolve().then(() =>
      memoryEngine.updateAfterConversation(userId, sessionId, chatHistory, reply),
    ).catch((err) => {
      logger.warn("chatPipeline", "memoryEngine async hatasi", err);
    });

    // 8. Return result
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

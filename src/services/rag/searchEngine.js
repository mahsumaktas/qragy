"use strict";

/**
 * Unified Search Engine
 *
 * Merges best of rag.js (phraseMatch, normalizeForMatching, adaptive topK)
 * with knowledge.js (factory pattern, vector search).
 *
 * No CSV disk reads — knowledgeBase array passed in via options.
 * Factory pattern: createSearchEngine(deps)
 */

const {
  buildNormalizedQuery,
  hasPhraseMatch,
  isStrongTextMatchScore,
  scoreKnowledgeTextMatch,
} = require("../../utils/knowledgeGuardrail.js");

function createSearchEngine(deps) {
  const {
    embedText,
    knowledgeTable,
    ragDistanceThreshold = 0.6,
    logger = { warn: () => {}, info: () => {} },
  } = deps || {};

  /**
   * Adaptive topK based on knowledge base size.
   * Small KB (<50): 3, Medium (<500): 5, Large (>=500): 7
   */
  function getAdaptiveTopK(kbSize) {
    if (kbSize < 50) return 3;
    if (kbSize < 500) return 5;
    return 7;
  }

  /**
   * Bigram phrase matching.
   * Returns true if any consecutive word pair from query appears in text.
   */
  function phraseMatch(query, text) {
    const { normalizedQuery } = buildNormalizedQuery(query);
    return hasPhraseMatch(normalizedQuery, String(text || ""));
  }

  /**
   * Full-text search with scoring: exact match (+15), phrase match (+8),
   * word-in-question (+3), word-in-answer (+1).
   * Uses normalizeForMatching for Turkish-aware comparison.
   */
  function fullTextSearch(knowledgeBase, query, topK = 3) {
    if (!knowledgeBase || !query) return [];
    const { queryWords } = buildNormalizedQuery(query);
    if (queryWords.length === 0) return [];

    const scored = [];
    for (const entry of knowledgeBase) {
      const score = scoreKnowledgeTextMatch(query, entry.question, entry.answer);
      if (isStrongTextMatchScore(score)) scored.push({ ...entry, _textScore: score });
    }

    return scored.sort((a, b) => b._textScore - a._textScore).slice(0, topK);
  }

  /**
   * Filter vector results by distance threshold.
   */
  function filterByRelevance(results, threshold) {
    const t = threshold !== null && threshold !== undefined ? threshold : ragDistanceThreshold;
    return results.filter((r) => {
      const d = r._distance;
      if (d === null || d === undefined) return true;
      return d <= t;
    });
  }

  /**
   * Reciprocal Rank Fusion — merges vector and text results.
   * Key uses question+answer to avoid collisions between different entries
   * with the same question prefix.
   */
  function reciprocalRankFusion(vectorResults, textResults, k = 60) {
    const scoreMap = new Map();
    const dataMap = new Map();

    const makeKey = (item) =>
      (item.question || "").slice(0, 80) + "|" + (item.answer || "").slice(0, 40);

    vectorResults.forEach((item, rank) => {
      const key = makeKey(item);
      scoreMap.set(key, (scoreMap.get(key) || 0) + 1 / (k + rank + 1));
      dataMap.set(key, item);
    });

    textResults.forEach((item, rank) => {
      const key = makeKey(item);
      scoreMap.set(key, (scoreMap.get(key) || 0) + 1 / (k + rank + 1));
      if (!dataMap.has(key)) dataMap.set(key, item);
    });

    return Array.from(scoreMap.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([, score], idx, arr) => ({
        ...dataMap.get(arr[idx][0]),
        rrfScore: score,
      }));
  }

  /**
   * Format results as citations with index, title, source, snippet.
   */
  function formatCitations(results) {
    if (!Array.isArray(results)) return [];
    return results.map((item, index) => ({
      index: index + 1,
      title: item.question || "",
      source: item.source || "Knowledge Base",
      snippet: (item.answer || "").slice(0, 200),
    }));
  }

  /**
   * Main hybrid search: vector + full-text + RRF fusion.
   * knowledgeBase array passed via options — no disk reads.
   *
   * @param {string} query - Search query
   * @param {Object} options
   * @param {Array} options.knowledgeBase - In-memory knowledge base entries
   * @param {number} options.kbSize - Knowledge base size (for adaptive topK)
   * @returns {Promise<Array>} Fused search results
   */
  async function hybridSearch(query, options = {}) {
    const { knowledgeBase = [], kbSize } = options;
    const effectiveSize = kbSize !== null && kbSize !== undefined ? kbSize : knowledgeBase.length;
    const topK = getAdaptiveTopK(effectiveSize);
    const fetchK = topK * 2;

    const textResults = fullTextSearch(knowledgeBase, query, fetchK);

    let vectorResults = [];
    // Resolve knowledgeTable — supports both direct table and getter function
    const resolvedTable = typeof knowledgeTable === "function" ? knowledgeTable() : knowledgeTable;
    if (resolvedTable && embedText) {
      try {
        const queryVector = await embedText(query);
        const raw = await resolvedTable
          .vectorSearch(queryVector)
          .limit(fetchK)
          .toArray();
        vectorResults = filterByRelevance(
          raw.map((r) => ({
            question: r.question,
            answer: r.answer,
            source: r.source || "",
            _distance: r._distance,
          }))
        );
      } catch (err) {
        logger.warn("searchEngine", "Vector search error, using text only", err);
      }
    }

    const maxFinal = Math.min(topK, 5);

    let fusionMethod = "none";
    let finalResults = [];
    if (vectorResults.length && textResults.length) {
      fusionMethod = "RRF";
      finalResults = reciprocalRankFusion(vectorResults, textResults).slice(0, maxFinal);
    } else if (vectorResults.length) {
      fusionMethod = "vector-only";
      finalResults = vectorResults.slice(0, maxFinal);
    } else if (textResults.length) {
      fusionMethod = "text-only";
      finalResults = textResults.slice(0, maxFinal);
    }

    logger.info("searchEngine", "Hybrid search completed", {
      query: query.slice(0, 80),
      vectorHits: vectorResults.length,
      textHits: textResults.length,
      fusionMethod,
      finalCount: finalResults.length,
      topRRF: finalResults[0] ? (finalResults[0].rrfScore || 0).toFixed(4) : "N/A",
      topQ: finalResults[0] ? (finalResults[0].question || "").slice(0, 60) : "N/A",
    });

    return finalResults;
  }

  return {
    hybridSearch,
    fullTextSearch,
    reciprocalRankFusion,
    filterByRelevance,
    getAdaptiveTopK,
    phraseMatch,
    formatCitations,
  };
}

module.exports = { createSearchEngine };

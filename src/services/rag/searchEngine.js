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

const { normalizeForMatching } = require("../../utils/sanitizer.js");

function createSearchEngine(deps) {
  const {
    embedText,
    knowledgeTable,
    ragDistanceThreshold = 0.8,
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
    const qWords = normalizeForMatching(query).split(" ").filter(Boolean);
    if (qWords.length < 2) return false;
    const normalizedText = normalizeForMatching(text);
    for (let i = 0; i < qWords.length - 1; i++) {
      const phrase = qWords[i] + " " + qWords[i + 1];
      if (normalizedText.includes(phrase)) return true;
    }
    return false;
  }

  /**
   * Full-text search with scoring: exact match (+15), phrase match (+8),
   * word-in-question (+3), word-in-answer (+1).
   * Uses normalizeForMatching for Turkish-aware comparison.
   */
  function fullTextSearch(knowledgeBase, query, topK = 3) {
    if (!knowledgeBase || !query) return [];
    const normalizedQuery = normalizeForMatching(query);
    const queryWords = normalizedQuery.split(" ").filter((w) => w.length > 1);
    if (queryWords.length === 0) return [];

    const scored = [];
    for (const entry of knowledgeBase) {
      let score = 0;
      const nQuestion = normalizeForMatching(entry.question || "");
      const nAnswer = normalizeForMatching(entry.answer || "");

      if (nQuestion === normalizedQuery) score += 15;
      if (phraseMatch(query, entry.question || "")) score += 8;

      for (const word of queryWords) {
        if (nQuestion.includes(word)) score += 3;
        if (nAnswer.includes(word)) score += 1;
      }

      if (score > 0) scored.push({ ...entry, _textScore: score });
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
      source: item.source || "Bilgi Tabani",
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
        logger.warn("searchEngine", "Vector arama hatasi, sadece text kullaniliyor", err);
      }
    }

    const maxFinal = Math.min(topK, 5);

    if (vectorResults.length && textResults.length) {
      return reciprocalRankFusion(vectorResults, textResults).slice(0, maxFinal);
    }
    if (vectorResults.length) return vectorResults.slice(0, maxFinal);
    if (textResults.length) return textResults.slice(0, maxFinal);
    return [];
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

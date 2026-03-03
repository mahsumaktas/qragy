"use strict";

/**
 * RAGAS-inspired Quality Scorer
 *
 * Scores RAG answer quality: faithfulness, relevancy, confidence.
 * Evaluates faithfulness/relevancy with LLM, calculates confidence from ragResults.
 *
 * Factory pattern: createQualityScorer(deps)
 */

const LOW_QUALITY_THRESHOLD = 0.5;

const SCORE_SYSTEM_PROMPT = `You are a response quality evaluation assistant.
Examine the user question, the provided answer, and the source documents to calculate two metrics:

1. faithfulness (0-1): Is the answer faithful to the source documents? Are there hallucinations?
   - 1.0 = Completely based on sources
   - 0.0 = Does not match sources at all

2. relevancy (0-1): Does the answer address the user's question?
   - 1.0 = Fully addresses the question
   - 0.0 = No relevance to the question

Respond in JSON format. Write nothing else.
Format: {"faithfulness": 0.85, "relevancy": 0.9}`;

function createQualityScorer(deps) {
  const { callLLM, getProviderConfig, sqliteDb, logger } = deps;

  /**
   * Score RAG answer quality.
   * @param {Object} params
   * @param {string} params.query - User question
   * @param {string} params.answer - Bot answer
   * @param {Array} params.ragResults - RAG search results [{_rerankScore, answer, ...}]
   * @param {string} params.sessionId
   * @param {string} params.messageId
   * @returns {{ sessionId, messageId, faithfulness, relevancy, confidence, ragResultCount, avgRerankScore, isLowQuality }}
   */
  async function score({ query, answer, ragResults = [], sessionId, messageId }) {
    const ragResultCount = ragResults.length;

    // 1. Confidence: avg rerankScore * countFactor
    let avgRerankScore = 0;
    let confidence;

    if (ragResultCount === 0) {
      confidence = 0.1;
    } else {
      const scores = ragResults.map(r => r._rerankScore || 0);
      avgRerankScore = scores.reduce((sum, s) => sum + s, 0) / scores.length;
      const countFactor = Math.min(ragResultCount / 3, 1);
      confidence = avgRerankScore * countFactor;
    }

    // Round for cleanliness
    avgRerankScore = Math.round(avgRerankScore * 1000) / 1000;
    confidence = Math.round(confidence * 1000) / 1000;

    // 2. LLM faithfulness + relevancy
    let faithfulness = null;
    let relevancy = null;

    try {
      const contextText = ragResults
        .map((r, i) => `[${i + 1}] ${(r.answer || r.text || "").slice(0, 300)}`)
        .join("\n");

      const userMessage = [
        `Question: ${query}`,
        `Answer: ${answer}`,
        `\nSource Documents:\n${contextText || "(no sources)"}`,
      ].join("\n");

      const messages = [{ role: "user", parts: [{ text: userMessage }] }];
      const providerConfig = getProviderConfig();
      const response = await callLLM(messages, SCORE_SYSTEM_PROMPT, 256, providerConfig);

      const rawReply = (response.reply || "").trim();
      const cleaned = rawReply
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```$/i, "")
        .trim();

      const parsed = JSON.parse(cleaned);
      faithfulness = typeof parsed.faithfulness === "number" ? parsed.faithfulness : null;
      relevancy = typeof parsed.relevancy === "number" ? parsed.relevancy : null;
    } catch (err) {
      // 7. LLM failure: null scores, isLowQuality=false
      logger.warn("qualityScorer", "LLM scoring error, faithfulness/relevancy null", err);
    }

    // 4. isLowQuality: average of non-null scores < threshold
    let isLowQuality = false;
    const validScores = [faithfulness, relevancy, confidence].filter(s => s !== null && s !== undefined);

    if (validScores.length > 0 && faithfulness !== null) {
      const avg = validScores.reduce((sum, s) => sum + s, 0) / validScores.length;
      isLowQuality = avg < LOW_QUALITY_THRESHOLD;
    }

    const result = {
      sessionId,
      messageId,
      faithfulness,
      relevancy,
      confidence,
      ragResultCount,
      avgRerankScore,
      isLowQuality,
    };

    // 5. Best-effort SQLite save
    try {
      await sqliteDb.saveQualityScore({
        sessionId,
        messageId,
        faithfulness,
        relevancy,
        confidence,
        ragResultCount,
        avgRerankScore,
      });
    } catch (err) {
      logger.warn("qualityScorer", "SQLite save error", err);
    }

    return result;
  }

  function getRecentScores(sessionId, limit = 5) {
    try {
      return sqliteDb.getRecentQualityScores(sessionId, limit);
    } catch (err) {
      logger.warn("qualityScorer", "getRecentScores error", err);
      return [];
    }
  }

  function getConsecutiveLowCount(sessionId) {
    const recent = getRecentScores(sessionId, 5);
    let count = 0;
    for (const row of recent) {
      const scores = [row.faithfulness, row.relevancy, row.confidence].filter(s => s !== null);
      if (scores.length === 0) break;
      const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
      if (avg < LOW_QUALITY_THRESHOLD) count++;
      else break;
    }
    return count;
  }

  return { score, getRecentScores, getConsecutiveLowCount };
}

module.exports = { createQualityScorer, LOW_QUALITY_THRESHOLD };

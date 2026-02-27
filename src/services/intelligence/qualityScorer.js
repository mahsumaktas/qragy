"use strict";

/**
 * RAGAS-inspired Quality Scorer
 *
 * RAG cevap kalitesini olcer: faithfulness, relevancy, confidence.
 * LLM ile faithfulness/relevancy degerlendirir, ragResults'tan confidence hesaplar.
 *
 * Factory pattern: createQualityScorer(deps)
 */

const LOW_QUALITY_THRESHOLD = 0.5;

const SCORE_SYSTEM_PROMPT = `Sen bir cevap kalite degerlendirme asistanisin.
Kullanicinin sorusu, verilen cevap ve kaynak dokumanlari inceleyerek iki metrik hesapla:

1. faithfulness (0-1): Cevap kaynak dokumanlara sadik mi? Uydurma bilgi var mi?
   - 1.0 = Tamamen kaynaklara dayali
   - 0.0 = Kaynaklarla hic uyusmuyor

2. relevancy (0-1): Cevap kullanicinin sorusunu karsiliyor mu?
   - 1.0 = Soruyu tam karsilik veriyor
   - 0.0 = Soruyla hic alakasi yok

JSON formatinda cevap ver. Baska bir sey yazma.
Format: {"faithfulness": 0.85, "relevancy": 0.9}`;

function createQualityScorer(deps) {
  const { callLLM, getProviderConfig, sqliteDb, logger } = deps;

  /**
   * RAG cevap kalitesini skorla.
   * @param {Object} params
   * @param {string} params.query - Kullanici sorusu
   * @param {string} params.answer - Bot cevabi
   * @param {Array} params.ragResults - RAG arama sonuclari [{_rerankScore, answer, ...}]
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
        `Soru: ${query}`,
        `Cevap: ${answer}`,
        `\nKaynak Dokumanlar:\n${contextText || "(kaynak yok)"}`,
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
      logger.warn("qualityScorer", "LLM skor hatasi, faithfulness/relevancy null", err);
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
      logger.warn("qualityScorer", "SQLite kayit hatasi", err);
    }

    return result;
  }

  function getRecentScores(sessionId, limit = 5) {
    try {
      return sqliteDb.getRecentQualityScores(sessionId, limit);
    } catch (err) {
      logger.warn("qualityScorer", "getRecentScores hatasi", err);
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

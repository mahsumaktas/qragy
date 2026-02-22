"use strict";

/**
 * Corrective RAG (CRAG) Evaluator
 *
 * LLM tabanli sonuc degerlendirme ve sorgu yeniden yazma.
 * Her arama sonucunu RELEVANT / PARTIAL / IRRELEVANT olarak siniflandirir.
 * Yetersiz sonuclarda alternatif sorgu onerisi uretir.
 *
 * Factory pattern: createCragEvaluator(deps)
 */

const MAX_REWRITE_ATTEMPTS = 2;

const EVALUATE_SYSTEM_PROMPT = `Sen bir bilgi degerlendirme asistanisin. Kullanicinin sorusu ve arama sonuclari verilecek.
Her sonucu asagidaki kriterlerle degerlendir:
- RELEVANT: Soruyu dogrudan cevapliyor
- PARTIAL: Kismen ilgili ama tam cevap degil
- IRRELEVANT: Soruyla alakasiz

JSON formatinda cevap ver. Baska bir sey yazma.
Format: [{"index": 0, "verdict": "RELEVANT"}, ...]`;

const REWRITE_SYSTEM_PROMPT = `Sen bir arama sorgusu iyilestirme asistanisin.
Kullanicinin orijinal sorgusunu daha etkili bir arama sorgusuna donustur.
Sadece yeni sorguyu yaz, baska bir sey ekleme.
Turkce yaz.`;

function createCragEvaluator(deps) {
  const { callLLM, getProviderConfig, logger } = deps;

  /**
   * LLM ile arama sonuclarini degerlendir.
   * @param {string} query - Kullanici sorusu
   * @param {Array} results - Arama sonuclari [{question, answer, ...}]
   * @returns {{ relevant: Array, partial: Array, irrelevant: Array, insufficient: boolean }}
   */
  async function evaluate(query, results) {
    if (!Array.isArray(results) || results.length === 0) {
      return { relevant: [], partial: [], irrelevant: [], insufficient: true };
    }

    try {
      const resultsSummary = results.map((r, i) => ({
        index: i,
        question: r.question || "",
        answer: (r.answer || "").slice(0, 300),
      }));

      const userMessage = `Kullanici Sorusu: ${query}\n\nArama Sonuclari:\n${JSON.stringify(resultsSummary, null, 2)}`;

      const messages = [{ role: "user", parts: [{ text: userMessage }] }];
      const providerConfig = getProviderConfig();
      const response = await callLLM(messages, EVALUATE_SYSTEM_PROMPT, 1024, providerConfig);

      const rawReply = (response.reply || "").trim();
      // Strip ```json``` markers
      const cleaned = rawReply
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```$/i, "")
        .trim();

      const verdicts = JSON.parse(cleaned);

      const relevant = [];
      const partial = [];
      const irrelevant = [];

      for (const v of verdicts) {
        const idx = v.index;
        if (idx < 0 || idx >= results.length) continue;

        const result = results[idx];
        const verdict = (v.verdict || "").toUpperCase();

        if (verdict === "RELEVANT") {
          relevant.push(result);
        } else if (verdict === "PARTIAL") {
          partial.push(result);
        } else {
          irrelevant.push(result);
        }
      }

      const insufficient = relevant.length === 0 && partial.length === 0;
      return { relevant, partial, irrelevant, insufficient };
    } catch (err) {
      logger.warn("cragEvaluator", "LLM degerlendirme hatasi, tum sonuclar relevant kabul ediliyor", err);
      // Safe fallback: treat all results as relevant
      return { relevant: [...results], partial: [], irrelevant: [], insufficient: false };
    }
  }

  /**
   * Alternatif arama sorgusu onerisi uret.
   * @param {string} query - Orijinal sorgu
   * @param {Array} chatHistory - Sohbet gecmisi
   * @returns {string} Yeniden yazilmis sorgu
   */
  async function suggestRewrite(query, chatHistory = []) {
    try {
      let contextText = "";
      if (chatHistory.length > 0) {
        const recent = chatHistory.slice(-4);
        contextText = "\n\nSohbet Gecmisi:\n" + recent
          .map(m => `${m.role === "user" ? "Kullanici" : "Bot"}: ${m.content}`)
          .join("\n");
      }

      const userMessage = `Orijinal Sorgu: ${query}${contextText}\n\nIyilestirilmis Arama Sorgusu:`;
      const messages = [{ role: "user", parts: [{ text: userMessage }] }];
      const providerConfig = getProviderConfig();
      const response = await callLLM(messages, REWRITE_SYSTEM_PROMPT, 256, providerConfig);

      let rewritten = (response.reply || "").trim();
      // Strip quotes from LLM reply
      rewritten = rewritten.replace(/^["']+|["']+$/g, "");

      return rewritten || query;
    } catch (err) {
      logger.warn("cragEvaluator", "Sorgu yeniden yazma hatasi, orijinal sorgu kullaniliyor", err);
      return query;
    }
  }

  return {
    evaluate,
    suggestRewrite,
    MAX_REWRITE_ATTEMPTS,
  };
}

module.exports = { createCragEvaluator, MAX_REWRITE_ATTEMPTS };

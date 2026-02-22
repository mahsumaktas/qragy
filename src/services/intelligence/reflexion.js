"use strict";

/**
 * Reflexion Engine
 *
 * Negatif geri bildirimlerden ogrenme motoru.
 * Kullanici memnun kalmadiginda LLM ile analiz yapar,
 * hata turunu ve dogru bilgiyi kaydeder.
 * Sonraki cevaplarda gecmis hatalardan uyari uretir.
 *
 * Factory pattern: createReflexion(deps)
 */

const ANALYZE_SYSTEM_PROMPT = `Sen bir musteri destek kalite analiz asistanisin.
Kullanici verilen cevaptan memnun kalmadi. Soruyu, cevabi ve RAG baglam bilgisini inceleyerek hatanin kaynagini analiz et.

JSON formatinda cevap ver. Baska bir sey yazma.
Format:
{
  "topic": "konu baslik (2-3 kelime)",
  "errorType": "wrong_info|incomplete|irrelevant|tone_issue",
  "analysis": "1-2 cumlelik analiz",
  "correctInfo": "dogru bilgi veya oneri (bilinmiyorsa bos string)"
}`;

function createReflexion(deps) {
  const { callLLM, getProviderConfig, sqliteDb, logger } = deps;

  /**
   * Negatif geri bildirim sonrasi LLM ile analiz yap ve kaydet.
   * @param {object} params
   * @param {string} params.sessionId
   * @param {string} params.query - Kullanici sorusu
   * @param {string} params.answer - Verilen cevap
   * @param {Array} params.ragResults - RAG sonuclari
   */
  async function analyze({ sessionId, query, answer, ragResults }) {
    try {
      const ragContext = Array.isArray(ragResults) && ragResults.length > 0
        ? ragResults.map(r => (r.answer || r.text || "").slice(0, 200)).join("\n")
        : "RAG sonucu yok";

      const userMessage = [
        "Kullanici bu cevaptan memnun kalmadi.",
        "",
        `Kullanici Sorusu: ${query}`,
        `Verilen Cevap: ${answer}`,
        `RAG Baglami:\n${ragContext}`,
      ].join("\n");

      const messages = [{ role: "user", parts: [{ text: userMessage }] }];
      const providerConfig = getProviderConfig();
      const response = await callLLM(messages, ANALYZE_SYSTEM_PROMPT, 512, providerConfig);

      const rawReply = (response.reply || "").trim();
      const cleaned = rawReply
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```$/i, "")
        .trim();

      const parsed = JSON.parse(cleaned);

      const VALID_ERROR_TYPES = ["wrong_info", "incomplete", "irrelevant", "tone_issue"];
      const errorType = VALID_ERROR_TYPES.includes(parsed.errorType)
        ? parsed.errorType
        : "incomplete";

      const logData = {
        sessionId,
        query,
        answer,
        topic: parsed.topic || "",
        errorType,
        analysis: parsed.analysis || "",
        correctInfo: parsed.correctInfo || "",
        createdAt: new Date().toISOString(),
      };

      await sqliteDb.saveReflexionLog(logData);
    } catch (err) {
      logger.warn("reflexion", "Analiz basarisiz, kayit atlanıyor", err);
    }
  }

  /**
   * Belirli bir konu icin gecmis reflexion uyarilarini formatla.
   * @param {string} topic - Aranacak konu (intent)
   * @param {Object} [opts] - Ek arama parametreleri
   * @param {string} [opts.standaloneQuery] - standaloneQuery ile ek arama
   * @param {number} [opts.limit] - Maks sonuc sayisi
   * @returns {string} Formatlenmis uyari metni veya bos string
   */
  async function getWarnings(topic, opts = {}) {
    const { standaloneQuery, limit = 3 } = typeof opts === "number" ? { limit: opts } : opts;

    let results = await sqliteDb.searchReflexionByTopic(topic, limit);

    // Also search by standaloneQuery if provided and different from topic
    if (standaloneQuery && standaloneQuery !== topic) {
      const extraResults = await sqliteDb.searchReflexionByTopic(standaloneQuery, limit);
      const existingIds = new Set(results.map(r => r.id));
      for (const r of extraResults) {
        if (!existingIds.has(r.id)) results.push(r);
      }
      results = results.slice(0, limit);
    }

    if (!Array.isArray(results) || results.length === 0) {
      return "";
    }

    const warnings = results.map(r => {
      const lines = [`DIKKAT: ${r.analysis}`];
      if (r.correctInfo) {
        lines.push(`Dogru bilgi: ${r.correctInfo}`);
      }
      return lines.join("\n");
    });

    return `--- GECMIS HATALAR (Reflexion) ---\n${warnings.join("\n---\n")}\n---`;
  }

  return { analyze, getWarnings };
}

module.exports = { createReflexion };

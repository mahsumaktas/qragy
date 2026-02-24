"use strict";

/**
 * Query Analyzer Service
 *
 * Classifies query complexity and routes to FAST/STANDARD/DEEP paths.
 * Single LLM call producing structured JSON analysis.
 *
 * Factory pattern: createQueryAnalyzer(deps)
 */

const VALID_COMPLEXITIES = new Set(["simple", "medium", "complex"]);
const VALID_INTENTS = new Set([
  "greeting", "faq", "product_support", "complaint", "escalation", "chitchat",
]);

const MAX_HISTORY_MESSAGES = 6;

const ANALYSIS_SYSTEM_PROMPT = `Sen bir sorgu analiz asistanisin. Kullanicinin mesajini analiz edip JSON formatinda donus yap.

Analiz kriterleri:
- complexity: "simple" (tek satirlik selam, evet/hayir), "medium" (tek konulu soru), "complex" (cok katmanli, karsilastirma, birden fazla soru)
- intent: "greeting" (merhaba, selam), "faq" (sikca sorulan sorular), "product_support" (urun/hizmet destegi), "complaint" (sikayet), "escalation" (yonetici/insan talep), "chitchat" (sohbet, konu disi)
- subQueries: karmasik sorgularda alt sorulara ayir, basit sorgularda bos dizi
- requiresMemory: kullanicinin onceki konusmalarindan bilgi gerekiyor mu (true/false)
- requiresGraph: iliskisel/graf bilgisi gerekiyor mu (urun-kategori, musteri-siparis iliskileri) (true/false)
- standaloneQuery: chat gecmisindeki zamirleri ("bunu", "ayni seyi", "o urun") cozerek bagimsiz bir soru olustur

Ornekler:
Kullanici: "Merhaba" -> {"complexity":"simple","intent":"greeting","subQueries":[],"requiresMemory":false,"requiresGraph":false,"standaloneQuery":"Merhaba"}
Kullanici: "Kargo nerede?" -> {"complexity":"medium","intent":"product_support","subQueries":[],"requiresMemory":true,"requiresGraph":false,"standaloneQuery":"Kargo nerede?"}
Kullanici: "X urunuyle Y urununu karsilastir ve hangisi daha uygun fiyatli, ayrica iade kosullarini da acikla" -> {"complexity":"complex","intent":"product_support","subQueries":["X urunu ile Y urunu arasindaki farklar nelerdir?","Hangi urun daha uygun fiyatli?","Iade kosullari nelerdir?"],"requiresMemory":false,"requiresGraph":true,"standaloneQuery":"X urunuyle Y urununu karsilastir ve hangisi daha uygun fiyatli, ayrica iade kosullarini da acikla"}

Chat gecmisi varsa zamirleri coz:
Gecmis: "Kullanici: iPhone 15 fiyati ne kadar? Bot: 45000 TL" Kullanici: "Bunu sepete ekle" -> standaloneQuery: "iPhone 15'i sepete ekle"

SADECE JSON don, baska bir sey yazma. JSON disinda metin ekleme.`;

/**
 * Determines route based on complexity and intent.
 *
 * - simple + greeting/chitchat -> FAST
 * - simple + faq -> STANDARD (faq needs retrieval)
 * - medium + anything -> STANDARD
 * - complex + anything -> DEEP
 */
function determineRoute(complexity, intent) {
  if (complexity === "complex") return "DEEP";
  if (complexity === "simple") {
    if (intent === "greeting" || intent === "chitchat") return "FAST";
    // faq and other intents need retrieval even if simple
    return "STANDARD";
  }
  // medium + anything
  return "STANDARD";
}

/**
 * Strips markdown code fences (```json ... ``` or ``` ... ```) from LLM reply.
 */
function stripCodeFences(text) {
  let cleaned = text.trim();
  // Remove ```json or ``` prefix
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, "");
  // Remove trailing ```
  cleaned = cleaned.replace(/\s*```\s*$/, "");
  return cleaned.trim();
}

/**
 * Validates and normalizes the parsed analysis object.
 */
function validateAnalysis(parsed, userMessage) {
  const complexity = VALID_COMPLEXITIES.has(parsed.complexity) ? parsed.complexity : "medium";
  const intent = VALID_INTENTS.has(parsed.intent) ? parsed.intent : "product_support";
  const subQueries = Array.isArray(parsed.subQueries) ? parsed.subQueries : [];
  const requiresMemory = typeof parsed.requiresMemory === "boolean" ? parsed.requiresMemory : false;
  const requiresGraph = typeof parsed.requiresGraph === "boolean" ? parsed.requiresGraph : false;
  const standaloneQuery = typeof parsed.standaloneQuery === "string" && parsed.standaloneQuery.length > 0
    ? parsed.standaloneQuery
    : userMessage;

  return { complexity, intent, subQueries, requiresMemory, requiresGraph, standaloneQuery };
}

function createQueryAnalyzer(deps) {
  const {
    callLLM,
    getProviderConfig,
    logger = { info() {}, warn() {}, error() {} },
  } = deps || {};

  /**
   * Builds LLM messages array from user message and chat history.
   * Takes last MAX_HISTORY_MESSAGES from chatHistory for context.
   */
  function buildMessages(userMessage, chatHistory) {
    const messages = [];

    // Add recent chat history for context
    if (Array.isArray(chatHistory) && chatHistory.length > 0) {
      const recentHistory = chatHistory.slice(-MAX_HISTORY_MESSAGES);
      for (const msg of recentHistory) {
        const role = msg.role === "user" ? "user" : "model";
        const text = msg.content || msg.text || "";
        if (text) {
          messages.push({ role, parts: [{ text }] });
        }
      }
    }

    // Add current user message
    messages.push({ role: "user", parts: [{ text: userMessage }] });

    return messages;
  }

  /**
   * Main analysis function.
   * Returns analysis object with route field added.
   *
   * @param {string} userMessage - Current user message
   * @param {Array} chatHistory - Previous messages [{role, content}]
   * @returns {Promise<Object>} Analysis with complexity, intent, route, etc.
   */
  async function analyze(userMessage, chatHistory = []) {
    const fallback = {
      complexity: "medium",
      intent: "product_support",
      subQueries: [],
      requiresMemory: false,
      requiresGraph: false,
      standaloneQuery: userMessage,
      route: "STANDARD",
    };

    try {
      const messages = buildMessages(userMessage, chatHistory);
      const providerConfig = getProviderConfig();

      const result = await callLLM(messages, ANALYSIS_SYSTEM_PROMPT, 512, providerConfig);

      const rawReply = (result && result.reply) || "";
      if (!rawReply) {
        logger.warn("queryAnalyzer", "LLM bos yanit dondu, fallback kullaniliyor");
        return fallback;
      }

      const cleaned = stripCodeFences(rawReply);
      let parsed;
      try {
        parsed = JSON.parse(cleaned);
      } catch (_parseErr) {
        logger.warn("queryAnalyzer", "JSON parse hatasi, fallback kullaniliyor", { raw: rawReply });
        return fallback;
      }

      const analysis = validateAnalysis(parsed, userMessage);
      analysis.route = determineRoute(analysis.complexity, analysis.intent);

      logger.info("queryAnalyzer", "Analiz tamamlandi", {
        complexity: analysis.complexity,
        intent: analysis.intent,
        route: analysis.route,
        requiresMemory: analysis.requiresMemory,
        requiresGraph: analysis.requiresGraph,
        subQueries: analysis.subQueries.length,
        standaloneChanged: analysis.standaloneQuery !== userMessage,
        standalonePreview: analysis.standaloneQuery.slice(0, 80),
      });

      return analysis;
    } catch (err) {
      logger.error("queryAnalyzer", "Analiz hatasi, fallback kullaniliyor", err);
      return fallback;
    }
  }

  return {
    analyze,
    determineRoute,
  };
}

module.exports = { createQueryAnalyzer };

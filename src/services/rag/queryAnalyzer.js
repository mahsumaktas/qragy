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

const ANALYSIS_SYSTEM_PROMPT = `You are a query analysis assistant. Analyze the user's message and return a JSON response.

Analysis criteria:
- complexity: "simple" (one-line greeting, yes/no), "medium" (single-topic question), "complex" (multi-layered, comparison, multiple questions)
- intent: "greeting" (hello, hi), "faq" (frequently asked questions), "product_support" (product/service support), "complaint" (complaint), "escalation" (manager/human request), "chitchat" (chat, off-topic)
- subQueries: break complex queries into sub-questions, empty array for simple queries
- requiresMemory: does it need information from the user's previous conversations (true/false)
- requiresGraph: does it need relational/graph information (product-category, customer-order relationships) (true/false)
- standaloneQuery: resolve pronouns from chat history ("this", "the same thing", "that product") to create a standalone question

Examples:
User: "Hello" -> {"complexity":"simple","intent":"greeting","subQueries":[],"requiresMemory":false,"requiresGraph":false,"standaloneQuery":"Hello"}
User: "I can't log in" -> {"complexity":"medium","intent":"product_support","subQueries":[],"requiresMemory":true,"requiresGraph":false,"standaloneQuery":"I can't log in"}
User: "Compare plan X with plan Y and which is cheaper, also explain the cancellation policy" -> {"complexity":"complex","intent":"product_support","subQueries":["What are the differences between plan X and plan Y?","Which plan is cheaper?","What is the cancellation policy?"],"requiresMemory":false,"requiresGraph":true,"standaloneQuery":"Compare plan X with plan Y and which is cheaper, also explain the cancellation policy"}

If chat history exists, resolve pronouns:
History: "User: How much is the Pro plan? Bot: $49/month" User: "I want to upgrade to that" -> standaloneQuery: "I want to upgrade to the Pro plan"

Return ONLY JSON, do not write anything else. Do not add text outside of JSON.`;

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
        logger.warn("queryAnalyzer", "LLM returned empty reply, using fallback");
        return fallback;
      }

      const cleaned = stripCodeFences(rawReply);
      let parsed;
      try {
        parsed = JSON.parse(cleaned);
      } catch (_parseErr) {
        logger.warn("queryAnalyzer", "JSON parse error, using fallback", { raw: rawReply });
        return fallback;
      }

      const analysis = validateAnalysis(parsed, userMessage);
      analysis.route = determineRoute(analysis.complexity, analysis.intent);

      logger.info("queryAnalyzer", "Analysis completed", {
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
      logger.error("queryAnalyzer", "Analysis error, using fallback", err);
      return fallback;
    }
  }

  return {
    analyze,
    determineRoute,
  };
}

module.exports = { createQueryAnalyzer };

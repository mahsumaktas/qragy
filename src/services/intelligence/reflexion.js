"use strict";

/**
 * Reflexion Engine
 *
 * Learning engine from negative feedback.
 * When user is unsatisfied, analyzes with LLM,
 * records error type and correct information.
 * Produces warnings from past errors in subsequent responses.
 *
 * Factory pattern: createReflexion(deps)
 */

const ANALYZE_SYSTEM_PROMPT = `You are a customer support quality analysis assistant.
The user was unsatisfied with the provided answer. Examine the question, answer, and RAG context to analyze the root cause of the error.

Respond in JSON format. Write nothing else.
Format:
{
  "topic": "topic title (2-3 words)",
  "errorType": "wrong_info|incomplete|irrelevant|tone_issue",
  "analysis": "1-2 sentence analysis",
  "correctInfo": "correct information or suggestion (empty string if unknown)"
}`;

function createReflexion(deps) {
  const { callLLM, getProviderConfig, sqliteDb, logger } = deps;

  /**
   * Analyze with LLM after negative feedback and save.
   * @param {object} params
   * @param {string} params.sessionId
   * @param {string} params.query - User question
   * @param {string} params.answer - Provided answer
   * @param {Array} params.ragResults - RAG results
   */
  async function analyze({ sessionId, query, answer, ragResults }) {
    try {
      const ragContext = Array.isArray(ragResults) && ragResults.length > 0
        ? ragResults.map(r => (r.answer || r.text || "").slice(0, 200)).join("\n")
        : "No RAG results";

      const userMessage = [
        "User was unsatisfied with this answer.",
        "",
        `User Question: ${query}`,
        `Provided Answer: ${answer}`,
        `RAG Context:\n${ragContext}`,
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
      logger.warn("reflexion", "Analysis failed, record skipped", err);
    }
  }

  /**
   * Format past reflexion warnings for a specific topic.
   * @param {string} topic - Topic to search (intent)
   * @param {Object} [opts] - Additional search parameters
   * @param {string} [opts.standaloneQuery] - Additional search with standaloneQuery
   * @param {number} [opts.limit] - Max result count
   * @returns {string} Formatted warning text or empty string
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
      const lines = [`WARNING: ${r.analysis}`];
      if (r.correctInfo) {
        lines.push(`Correct info: ${r.correctInfo}`);
      }
      return lines.join("\n");
    });

    return `--- PAST ERRORS (Reflexion) ---\n${warnings.join("\n---\n")}\n---`;
  }

  return { analyze, getWarnings };
}

module.exports = { createReflexion };

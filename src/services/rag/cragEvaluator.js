"use strict";

/**
 * Corrective RAG (CRAG) Evaluator
 *
 * LLM-based result evaluation and query rewriting.
 * Classifies each search result as RELEVANT / PARTIAL / IRRELEVANT.
 * Generates alternative query suggestions for insufficient results.
 *
 * Factory pattern: createCragEvaluator(deps)
 */

const MAX_REWRITE_ATTEMPTS = 2;

const EVALUATE_SYSTEM_PROMPT = `You are a knowledge evaluation assistant. You will be given a user question and search results.
Evaluate each result using these criteria:
- RELEVANT: Directly answers the question
- PARTIAL: Somewhat relevant but incomplete answer
- IRRELEVANT: Unrelated to the question

Respond in JSON format. Do not write anything else.
Format: [{"index": 0, "verdict": "RELEVANT"}, ...]`;

const REWRITE_SYSTEM_PROMPT = `You are a search query improvement assistant.
Transform the user's original query into a more effective search query.
Only write the new query, do not add anything else.
Write in Turkish.`;

function createCragEvaluator(deps) {
  const { callLLM, getProviderConfig, logger } = deps;

  /**
   * Evaluate search results with LLM.
   * @param {string} query - User question
   * @param {Array} results - Search results [{question, answer, ...}]
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

      const userMessage = `User Question: ${query}\n\nSearch Results:\n${JSON.stringify(resultsSummary, null, 2)}`;

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

      logger.info("cragEvaluator", "Evaluation completed", {
        query: query.slice(0, 80),
        totalResults: results.length,
        relevant: relevant.length,
        partial: partial.length,
        irrelevant: irrelevant.length,
        insufficient,
        verdicts: verdicts.map(v => `[${v.index}]=${v.verdict}`).join(", "),
      });

      return { relevant, partial, irrelevant, insufficient };
    } catch (err) {
      logger.warn("cragEvaluator", "LLM evaluation error, all results treated as relevant", err);
      // Safe fallback: treat all results as relevant
      return { relevant: [...results], partial: [], irrelevant: [], insufficient: false };
    }
  }

  /**
   * Generate alternative search query suggestion.
   * @param {string} query - Original query
   * @param {Array} chatHistory - Chat history
   * @returns {string} Rewritten query
   */
  async function suggestRewrite(query, chatHistory = []) {
    try {
      let contextText = "";
      if (chatHistory.length > 0) {
        const recent = chatHistory.slice(-4);
        contextText = "\n\nChat History:\n" + recent
          .map(m => `${m.role === "user" ? "User" : "Bot"}: ${m.content}`)
          .join("\n");
      }

      const userMessage = `Original Query: ${query}${contextText}\n\nImproved Search Query:`;
      const messages = [{ role: "user", parts: [{ text: userMessage }] }];
      const providerConfig = getProviderConfig();
      const response = await callLLM(messages, REWRITE_SYSTEM_PROMPT, 256, providerConfig);

      let rewritten = (response.reply || "").trim();
      // Strip quotes from LLM reply
      rewritten = rewritten.replace(/^["']+|["']+$/g, "");

      logger.info("cragEvaluator", "Query rewritten", {
        original: query.slice(0, 80),
        rewritten: (rewritten || query).slice(0, 80),
      });

      return rewritten || query;
    } catch (err) {
      logger.warn("cragEvaluator", "Query rewrite error, using original query", err);
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

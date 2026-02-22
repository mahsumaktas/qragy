"use strict";

/**
 * Core Memory Service — MemGPT-style "always in prompt" memory tier.
 *
 * Unlike passive userMemory CRUD, Core Memory auto-extracts user profile
 * information from conversations via LLM and keeps it ready for system prompt
 * injection.
 */

const CORE_MEMORY_TOKEN_BUDGET = 500;
const CHARS_PER_TOKEN = 2.5; // Turkish text averages ~2.5 chars per token
const MAX_RECENT_MESSAGES = 10;

const EXTRACTION_SYSTEM_PROMPT = `Sen bir kullanici profili cikarma asistanisin.
Verilen konusma gecmisinden kullanici hakkinda profil bilgilerini JSON olarak cikar.
Sadece acikca belirtilen bilgileri cikar, tahminde bulunma.
Cikarilacak alanlar: name, branch, phone, company, issue_history, preferences
Bos alanlari dahil etme. Sadece JSON don, baska bir sey yazma.
Ornek cikti: {"name": "Ahmet", "company": "ABC Ltd"}`;

const MAX_EXTRACT_TOKENS = 512;

function createCoreMemory(deps) {
  const { sqliteDb, callLLM, getProviderConfig, logger } = deps;

  /**
   * Load user profile from SQLite.
   * @param {string} userId
   * @returns {object} key-value profile, {} on error
   */
  function load(userId) {
    try {
      const profile = sqliteDb.getUserMemory(userId);
      return profile || {};
    } catch (err) {
      logger.warn("coreMemory", "load failed", err);
      return {};
    }
  }

  /**
   * Save a single key-value pair to user profile.
   * @param {string} userId
   * @param {string} key
   * @param {string} value
   */
  function save(userId, key, value) {
    sqliteDb.saveUserMemory(userId, key, value);
  }

  /**
   * Auto-extract user profile from recent chat history via LLM.
   * This is the core MemGPT-style feature: conversations passively build
   * user knowledge without explicit user action.
   *
   * @param {string} userId
   * @param {Array} chatHistory - array of message objects
   */
  async function autoExtract(userId, chatHistory) {
    try {
      const recent = chatHistory.slice(-MAX_RECENT_MESSAGES);

      const text = recent
        .map((msg) => {
          const role = msg.role || "user";
          const content =
            msg.parts && msg.parts[0] && msg.parts[0].text
              ? msg.parts[0].text
              : msg.content || "";
          return `${role}: ${content}`;
        })
        .join("\n");

      if (!text.trim()) return;

      const messages = [
        { role: "user", parts: [{ text }] },
      ];

      const providerConfig = getProviderConfig();
      const { reply } = await callLLM(
        messages,
        EXTRACTION_SYSTEM_PROMPT,
        MAX_EXTRACT_TOKENS,
        providerConfig
      );

      let cleaned = reply.trim();
      // Strip markdown code fences if present
      if (cleaned.startsWith("```")) {
        cleaned = cleaned.replace(/^```(?:json)?\s*/, "").replace(/```\s*$/, "");
      }

      const extracted = JSON.parse(cleaned);

      for (const [key, value] of Object.entries(extracted)) {
        if (value && String(value).trim()) {
          save(userId, key, String(value).trim());
        }
      }
    } catch (err) {
      logger.warn("coreMemory", "autoExtract failed", err);
      // Fail silently — extraction is best-effort
    }
  }

  /**
   * Format user profile for system prompt injection.
   * Respects token budget to avoid bloating the prompt.
   *
   * @param {string} userId
   * @param {number} maxTokens - token budget, default CORE_MEMORY_TOKEN_BUDGET
   * @returns {string} formatted profile or empty string
   */
  function formatForPrompt(userId, maxTokens = CORE_MEMORY_TOKEN_BUDGET) {
    const profile = load(userId);
    const entries = Object.entries(profile);

    if (entries.length === 0) return "";

    const header = "--- KULLANICI PROFILI ---\n";
    const maxChars = Math.floor(maxTokens * CHARS_PER_TOKEN);
    let result = header;

    for (const [key, value] of entries) {
      const line = `${key}: ${value}\n`;
      if (result.length + line.length > maxChars) break;
      result += line;
    }

    return result;
  }

  return { load, save, autoExtract, formatForPrompt };
}

module.exports = {
  createCoreMemory,
  CORE_MEMORY_TOKEN_BUDGET,
  CHARS_PER_TOKEN,
};

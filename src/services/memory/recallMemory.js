"use strict";

/**
 * Recall Memory Service
 *
 * "Searched on demand" memory tier — FTS5 ile gecmis konusma ozetlerini
 * kaydeder ve arandiginda getirir. Prompt'a format edip ekleyebilir.
 */

const crypto = require("crypto");

const CHARS_PER_TOKEN = 2.5;

function createRecallMemory(deps) {
  const { sqliteDb, logger } = deps;

  /**
   * Konusma ozetini recall_memory tablosuna kaydeder.
   * @param {string} userId
   * @param {string} sessionId
   * @param {string} content
   * @param {string} [type="summary"]
   */
  function save(userId, sessionId, content, type = "summary") {
    const id = `rm-${crypto.randomUUID().slice(0, 8)}`;
    try {
      sqliteDb.saveRecallMemory(id, userId, sessionId, type, content);
    } catch (err) {
      logger.warn("recallMemory", "save failed", err);
    }
  }

  /**
   * FTS5 ile recall memory'de arama yapar.
   * @param {string} query
   * @param {string} userId
   * @param {number} [limit=5]
   * @returns {Array} sonuc listesi
   */
  function search(query, userId, limit = 5) {
    try {
      return sqliteDb.searchRecallMemory(query, userId, limit);
    } catch (err) {
      logger.warn("recallMemory", "search failed", err);
      return [];
    }
  }

  /**
   * Arama sonuclarini system prompt'a eklenecek formatta dondurur.
   * @param {string} query
   * @param {string} userId
   * @param {number} [maxTokens=1000]
   * @returns {string} formatlanmis metin veya ""
   */
  function formatForPrompt(query, userId, maxTokens = 1000) {
    const results = search(query, userId);
    if (!results || results.length === 0) return "";

    const maxChars = Math.floor(maxTokens * CHARS_PER_TOKEN);
    let body = "";

    for (const r of results) {
      const line = `[${r.type || "summary"}] ${r.content}\n`;
      if (body.length + line.length > maxChars) break;
      body += line;
    }

    if (!body) return "";
    return `--- GECMIS KONUSMALAR ---\n${body}---`;
  }

  return { save, search, formatForPrompt };
}

module.exports = { createRecallMemory };

"use strict";

/**
 * Chat Audit Logger
 *
 * Writes complete chat interaction details to daily JSONL files.
 * Each line is a self-contained JSON object with full request/response data.
 * Used for post-hoc debugging of chat quality issues.
 *
 * Files: data/chat-logs/YYYY-MM-DD.jsonl
 */

const fs = require("fs");
const path = require("path");

const DEFAULT_LOG_DIR = path.join(process.cwd(), "data", "chat-logs");

function createChatAuditLogger(opts = {}) {
  const logDir = opts.logDir || DEFAULT_LOG_DIR;

  function ensureDir() {
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
  }

  function getFilePath() {
    const date = new Date().toISOString().slice(0, 10);
    return path.join(logDir, `${date}.jsonl`);
  }

  /**
   * Log a complete chat interaction.
   * @param {Object} entry
   * @param {string} entry.sessionId
   * @param {string} entry.userMessage - Latest user message
   * @param {string} entry.reply - Full bot reply
   * @param {string} entry.source - Response source (gemini, rule-engine, etc.)
   * @param {string} [entry.route] - Pipeline route (FAST/STANDARD/DEEP)
   * @param {Object} [entry.memory] - Current memory state
   * @param {Object} [entry.conversationContext] - Conversation state
   * @param {Array}  [entry.ragResults] - RAG results used
   * @param {number} [entry.promptLen] - System prompt length
   * @param {string} [entry.finishReason] - LLM finish reason
   * @param {Object} [entry.qualityScore] - Quality scorer output
   * @param {Object} [entry.analysis] - Query analysis result
   * @param {string} [entry.searchQuery] - Actual search query used
   * @param {string} [entry.topicDetected] - Detected topic ID
   * @param {Object} [entry.extra] - Any additional data
   */
  function log(entry) {
    try {
      ensureDir();
      const record = {
        ts: new Date().toISOString(),
        sessionId: entry.sessionId || "unknown",
        userMessage: entry.userMessage || "",
        reply: entry.reply || "",
        source: entry.source || "",
        route: entry.route || null,
        memory: entry.memory || null,
        conversationState: entry.conversationContext?.conversationState || null,
        currentTopic: entry.conversationContext?.currentTopic || null,
        turnCount: entry.conversationContext?.turnCount || 0,
        ragResults: Array.isArray(entry.ragResults)
          ? entry.ragResults.map(r => ({
              question: (r.question || "").slice(0, 200),
              answer: (r.answer || "").slice(0, 300),
              score: r._rerankScore || r.rrfScore || r._textScore || 0,
            }))
          : null,
        promptLen: entry.promptLen || null,
        finishReason: entry.finishReason || null,
        qualityScore: entry.qualityScore || null,
        analysis: entry.analysis || null,
        searchQuery: entry.searchQuery || null,
        topicDetected: entry.topicDetected || null,
        extra: entry.extra || null,
      };

      const line = JSON.stringify(record) + "\n";
      fs.appendFileSync(getFilePath(), line, "utf8");
    } catch {
      // Silent fail — audit logging should never break chat
    }
  }

  return { log };
}

module.exports = { createChatAuditLogger };

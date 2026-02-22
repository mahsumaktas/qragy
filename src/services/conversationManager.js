"use strict";

/**
 * Conversation Manager Service
 *
 * Live conversation CRUD, upsert with pruning, and
 * clarification retry tracking.
 * Factory pattern — deps injected.
 */
function createConversationManager(deps) {
  const {
    sqliteDb,
    logger,
    clarificationCounters,
  } = deps;

  // ── Conversation CRUD ──────────────────────────────────────────────────

  function loadConversations() {
    try {
      return sqliteDb.loadConversations();
    } catch (err) { logger.warn("loadConversations", "Error", err); }
    return { conversations: [] };
  }

  function saveConversations(data) {
    try {
      sqliteDb.saveConversations(data);
    } catch (err) { logger.warn("saveConversations", "Error", err); }
  }

  function upsertConversation(sessionId, messages, memory, extra = {}) {
    const data = loadConversations();
    let conv = data.conversations.find(c => c.sessionId === sessionId);
    const now = new Date().toISOString();

    if (!conv) {
      conv = {
        sessionId,
        status: "active",
        createdAt: now,
        updatedAt: now,
        messageCount: 0,
        lastUserMessage: "",
        memory: {},
        ticketId: "",
        source: extra.source || "web",
        chatHistory: [],
        ip: extra.ip || ""
      };
      data.conversations.push(conv);
    }

    conv.updatedAt = now;
    conv.memory = memory || conv.memory;
    conv.chatHistory = (messages || []).slice(-50).map(m => ({
      role: m.role,
      content: String(m.content || "").slice(0, 500)
    }));
    conv.messageCount = conv.chatHistory.filter(m => m.role === "user").length;

    const lastUser = [...conv.chatHistory].reverse().find(m => m.role === "user");
    conv.lastUserMessage = lastUser ? lastUser.content.slice(0, 200) : "";

    if (extra.ticketId) conv.ticketId = extra.ticketId;
    if (extra.status) conv.status = extra.status;

    // Prune old conversations (older than 7 days)
    const cutoff = Date.now() - 7 * 86400000;
    data.conversations = data.conversations.filter(c => {
      const ts = Date.parse(c.updatedAt || c.createdAt || "");
      return Number.isFinite(ts) && ts > cutoff;
    });

    saveConversations(data);
    return conv;
  }

  // ── Clarification Retry Tracking ───────────────────────────────────────

  function getClarificationKey(messages) {
    const firstUser = messages.find(m => m.role === "user");
    return firstUser ? firstUser.content.slice(0, 50) : "default";
  }

  function incrementClarificationCount(sessionKey) {
    const count = (clarificationCounters.get(sessionKey) || 0) + 1;
    clarificationCounters.set(sessionKey, count);
    return count;
  }

  function resetClarificationCount(sessionKey) {
    clarificationCounters.delete(sessionKey);
  }

  // Cleanup stale clarification counters every 30 minutes
  setInterval(() => {
    clarificationCounters.clear();
  }, 30 * 60 * 1000);

  return {
    loadConversations,
    saveConversations,
    upsertConversation,
    getClarificationKey,
    incrementClarificationCount,
    resetClarificationCount,
  };
}

module.exports = { createConversationManager };

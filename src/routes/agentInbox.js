"use strict";

function mount(app, deps) {
  const {
    requireAdminAccess,
    agentQueue,
    loadConversations,
    logger,
  } = deps;

  // SSE connections for real-time updates
  const sseClients = new Set();

  function broadcast(event, data) {
    const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const client of sseClients) {
      try { client.write(msg); } catch (_) { sseClients.delete(client); }
    }
  }

  // SSE stream
  app.get("/api/admin/inbox/stream", requireAdminAccess, (req, res) => {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    });
    res.write("event: connected\ndata: {}\n\n");
    sseClients.add(res);
    req.on("close", () => sseClients.delete(res));
  });

  // List inbox (pending + active)
  app.get("/api/admin/inbox", requireAdminAccess, (_req, res) => {
    try {
      const pending = agentQueue.listPending();
      const active = agentQueue.listActive();
      res.json({ ok: true, pending, active });
    } catch (err) {
      logger.warn("agentInbox", "list failed", err);
      res.status(500).json({ error: "Kuyruk listelenemedi" });
    }
  });

  // Claim a conversation
  app.post("/api/admin/inbox/:id/claim", requireAdminAccess, (req, res) => {
    const id = Number(req.params.id);
    const agentName = req.body?.agentName || "admin";
    const success = agentQueue.claim(id, agentName);
    if (success) {
      broadcast("claimed", { id, agentName });
      return res.json({ ok: true });
    }
    res.status(400).json({ error: "Gorusme alinamadi" });
  });

  // Send message to conversation
  app.post("/api/admin/inbox/:id/message", requireAdminAccess, (req, res) => {
    const id = Number(req.params.id);
    const { message } = req.body || {};
    if (!message || typeof message !== "string" || !message.trim()) {
      return res.status(400).json({ error: "Mesaj gerekli" });
    }
    const queueItem = agentQueue.getById(id);
    if (!queueItem) {
      return res.status(404).json({ error: "Gorusme bulunamadi" });
    }
    // Add agent message to conversation history
    try {
      const conversations = loadConversations();
      const conv = conversations[queueItem.sessionId];
      if (conv && Array.isArray(conv.chatHistory)) {
        conv.chatHistory.push({
          role: "assistant",
          content: message.trim(),
          agentMessage: true,
        });
      }
      broadcast("message", { id, sessionId: queueItem.sessionId, message: message.trim() });
      res.json({ ok: true });
    } catch (err) {
      logger.warn("agentInbox", "message failed", err);
      res.status(500).json({ error: "Mesaj gonderilemedi" });
    }
  });

  // Release conversation back to bot
  app.post("/api/admin/inbox/:id/release", requireAdminAccess, (req, res) => {
    const id = Number(req.params.id);
    const success = agentQueue.release(id);
    if (success) {
      broadcast("released", { id });
      return res.json({ ok: true });
    }
    res.status(400).json({ error: "Gorusme birakilamadi" });
  });

  // Expose broadcast for external use (escalation triggers)
  return { broadcast, sseClients };
}

module.exports = { mount };

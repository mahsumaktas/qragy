"use strict";

/**
 * Conversation & Ticket Routes
 *
 * Ticket handoff, session status, conversation close, CSAT rating,
 * file upload, and message feedback endpoints.
 * Extracted from chat.js — mount(app, deps) pattern.
 */
function mount(app, deps) {
  const {
    express, fs, logger, multer,
    loadTicketsDb, saveTicketsDb, updateTicketHandoffResult, sanitizeTicketForList,
    nowIso,
    fireWebhook,
    loadConversations, upsertConversation,
    recordAnalyticsEvent, recordCsatAnalytics, saveAnalyticsData,
    getAnalyticsData,
    FEEDBACK_FILE, UPLOADS_DIR,
  } = deps;

  // ── Local helpers ──────────────────────────────────────────────────────

  function loadFeedback() {
    try {
      if (fs.existsSync(FEEDBACK_FILE)) return JSON.parse(fs.readFileSync(FEEDBACK_FILE, "utf8"));
    } catch (err) { logger.warn("loadFeedback", "Error", err); }
    return { entries: [] };
  }

  function saveFeedback(data) {
    if (data.entries.length > 1000) data.entries = data.entries.slice(-1000);
    fs.writeFileSync(FEEDBACK_FILE, JSON.stringify(data, null, 2), "utf8");
  }

  const chatUpload = multer({
    dest: UPLOADS_DIR,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      const allowed = ["image/jpeg", "image/png", "image/gif", "image/webp", "application/pdf"];
      if (allowed.includes(file.mimetype)) cb(null, true);
      else cb(new Error("Desteklenmeyen dosya tipi. Sadece resim ve PDF kabul edilir."));
    }
  });

  // ── Ticket Handoff Result ──────────────────────────────────────────────
  app.post("/api/tickets/:ticketId/handoff", (req, res) => {
    const ticketId = String(req.params.ticketId || "").trim();
    if (!ticketId) {
      return res.status(400).json({ error: "ticketId zorunludur." });
    }

    const status = String(req.body?.status || "").trim().toLowerCase();
    const detail = String(req.body?.detail || "").trim();
    const meta = req.body?.meta && typeof req.body.meta === "object" ? req.body.meta : {};

    const result = updateTicketHandoffResult(ticketId, status, detail, meta);
    if (result.error) {
      const isNotFound = /bulunamadi/i.test(result.error);
      return res.status(isNotFound ? 404 : 400).json({ error: result.error });
    }

    fireWebhook("handoff_result", { ticketId, status, detail });
    return res.json({ ok: true, ticket: sanitizeTicketForList(result.ticket) });
  });

  // ── Session Status Check ───────────────────────────────────────────────
  app.get("/api/conversations/status/:sessionId", (req, res) => {
    const sessionId = String(req.params.sessionId || "").trim();
    if (!sessionId) return res.status(400).json({ error: "sessionId zorunludur." });
    const data = loadConversations();
    const conv = data.conversations.find(c => c.sessionId === sessionId);
    if (!conv) return res.json({ active: false });
    return res.json({ active: conv.status === "active" || conv.status === "ticketed" });
  });

  // ── Conversation Close ─────────────────────────────────────────────────
  app.post("/api/conversations/close", (req, res) => {
    const sessionId = String(req.body?.sessionId || "").trim();
    if (!sessionId) {
      return res.status(400).json({ error: "sessionId zorunludur." });
    }
    const reason = String(req.body?.reason || "inactivity").trim();
    const allowed = ["inactivity", "user", "farewell"];
    const safeReason = allowed.includes(reason) ? reason : "inactivity";

    upsertConversation(sessionId, null, null, { status: "closed" });
    recordAnalyticsEvent({ source: "chat-closed", reason: safeReason });
    return res.json({ ok: true });
  });

  // ── Ticket CSAT Rating ─────────────────────────────────────────────────
  app.post("/api/tickets/:ticketId/rating", (req, res) => {
    const ticketId = String(req.params.ticketId || "").trim();
    if (!ticketId) {
      return res.status(400).json({ error: "ticketId zorunludur." });
    }

    const rating = Number(req.body?.rating);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return res.status(400).json({ error: "Rating 1-5 arasi olmalidir." });
    }

    const db = loadTicketsDb();
    const ticket = db.tickets.find((item) => item.id === ticketId);
    if (!ticket) {
      return res.status(404).json({ error: "Ticket bulunamadi." });
    }

    const timestamp = nowIso();
    ticket.csatRating = rating;
    ticket.csatRatedAt = timestamp;
    ticket.updatedAt = timestamp;
    ticket.events = Array.isArray(ticket.events) ? ticket.events : [];
    ticket.events.push({
      at: timestamp,
      type: "csat_rating",
      message: `Kullanici ${rating}/5 puan verdi.`,
      rating
    });

    saveTicketsDb(db);
    recordCsatAnalytics(rating);
    fireWebhook("csat_rating", { ticketId, rating });
    return res.json({ ok: true, rating });
  });

  // ── Chat File Upload ───────────────────────────────────────────────────
  app.post("/api/chat/upload", chatUpload.single("file"), (req, res) => {
    if (!req.file) return res.status(400).json({ error: "Dosya gerekli." });
    const fileUrl = `/uploads/${req.file.filename}`;
    return res.json({ ok: true, url: fileUrl, name: req.file.originalname, size: req.file.size });
  });

  app.use("/uploads", express.static(UPLOADS_DIR));

  // ── Message Feedback (thumbs up/down) ──────────────────────────────────
  app.post("/api/chat/feedback", (req, res) => {
    const { sessionId, messageIndex, rating } = req.body || {};
    if (!rating || !["up", "down"].includes(rating)) {
      return res.status(400).json({ error: "rating: 'up' veya 'down' olmalidir." });
    }
    const data = loadFeedback();
    data.entries.push({
      sessionId: String(sessionId || "").slice(0, 100),
      messageIndex: Number(messageIndex) || 0,
      rating,
      timestamp: nowIso()
    });
    saveFeedback(data);
    const analyticsData = getAnalyticsData();
    const dayKey = new Date().toISOString().slice(0, 10);
    if (!analyticsData.daily[dayKey]) {
      analyticsData.daily[dayKey] = { totalChats: 0, aiCalls: 0, deterministicReplies: 0, totalResponseMs: 0, responseCount: 0, escalationCount: 0, csatSum: 0, csatCount: 0, topicCounts: {}, sourceCounts: {} };
    }
    const day = analyticsData.daily[dayKey];
    if (!day.feedbackUp) day.feedbackUp = 0;
    if (!day.feedbackDown) day.feedbackDown = 0;
    if (rating === "up") day.feedbackUp++; else day.feedbackDown++;
    saveAnalyticsData();
    return res.json({ ok: true });
  });

  return { loadFeedback };
}

module.exports = { mount };

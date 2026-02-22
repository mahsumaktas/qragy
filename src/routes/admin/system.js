"use strict";

/**
 * Admin System Routes — backup, summary, system status, agent reload, audit log, env management
 */
function mount(app, deps) {
  const {
    requireAdminAccess,
    fs,
    path,
    sqliteDb,
    loadTicketsDb,
    getAdminSummary,
    loadConversations,
    saveConversations,
    recordAnalyticsEvent,
    loadAllAgentConfig,
    readTextFileSafe,
    readEnvFile,
    writeEnvFile,
    reloadRuntimeEnv,
    checkLLMHealth,
    loadChatFlowConfig,
    loadSiteConfig,
    loadSunshineConfig,
    safeError,
    getGoogleModel,
    getTopicIndex,
    getLlmHealthStatus,
    getKnowledgeTable,
    AGENT_DIR,
    DATA_DIR,
    logger,
    nowIso,
    loadCSVData,
  } = deps;

  // ── Audit Log helpers ──────────────────────────────────────────────────
  const AUDIT_LOG_FILE = path.join(DATA_DIR, "audit-log.json");

  function loadAuditLog() {
    try {
      if (fs.existsSync(AUDIT_LOG_FILE)) return JSON.parse(fs.readFileSync(AUDIT_LOG_FILE, "utf8"));
    } catch (err) { logger.warn("loadAuditLog", "Error", err); }
    return { entries: [] };
  }

  function saveAuditLog(data) {
    if (data.entries.length > 500) data.entries = data.entries.slice(-500);
    fs.writeFileSync(AUDIT_LOG_FILE, JSON.stringify(data, null, 2), "utf8");
  }

  // ── Backup ──────────────────────────────────────────────────────────────
  app.post("/api/admin/backup", requireAdminAccess, (_req, res) => {
    const backupPath = sqliteDb.backupDatabase();
    if (backupPath) {
      return res.json({ ok: true, path: backupPath });
    }
    return res.status(500).json({ error: "Backup olusturulamadi." });
  });

  // ── Summary ─────────────────────────────────────────────────────────────
  app.get("/api/admin/summary", requireAdminAccess, (_req, res) => {
    const db = loadTicketsDb();
    const summary = getAdminSummary(db.tickets);
    return res.json({ ok: true, summary });
  });

  // ── Conversations (live chat sessions) ──────────────────────────────────
  app.get("/api/admin/conversations", requireAdminAccess, (_req, res) => {
    const data = loadConversations();
    const statusFilter = String(_req.query.status || "").trim();
    let convs = [...data.conversations];
    convs.sort((a, b) => Date.parse(b.updatedAt || "") - Date.parse(a.updatedAt || ""));

    if (statusFilter) {
      convs = convs.filter(c => c.status === statusFilter);
    }

    res.json({
      ok: true,
      total: convs.length,
      conversations: convs.map(c => ({
        sessionId: c.sessionId,
        status: c.status,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
        messageCount: c.messageCount || 0,
        lastUserMessage: c.lastUserMessage || "",
        memory: c.memory || {},
        ticketId: c.ticketId || "",
        source: c.source || "web",
        chatHistory: c.chatHistory || []
      }))
    });
  });

  // ── Close All Active Conversations ──────────────────────────────────────
  app.post("/api/admin/conversations/close-all", requireAdminAccess, (_req, res) => {
    const data = loadConversations();
    let closedCount = 0;
    for (const conv of data.conversations) {
      if (conv.status === "active" || conv.status === "ticketed") {
        conv.status = "closed";
        conv.updatedAt = new Date().toISOString();
        closedCount++;
      }
    }
    saveConversations(data);
    recordAnalyticsEvent({ source: "chat-closed", reason: "admin-bulk-close", count: closedCount });
    return res.json({ ok: true, closedCount });
  });

  // ── System Status ───────────────────────────────────────────────────────
  app.get("/api/admin/system", requireAdminAccess, async (req, res) => {
    try {
      if (req.query.forceCheck === "1") {
        await checkLLMHealth();
      }

      const memUsage = process.memoryUsage();
      const knowledgeTable = getKnowledgeTable();
      const kbRowCount = knowledgeTable ? await knowledgeTable.countRows().catch(() => 0) : 0;

      const agentFiles = ["soul.md", "persona.md", "domain.md", "bootstrap.md", "response-policy.md", "skills.md", "hard-bans.md", "escalation-matrix.md", "definition-of-done.md", "output-filter.md"];
      const agentStatus = agentFiles.map(f => ({
        file: f,
        loaded: Boolean(readTextFileSafe(path.join(AGENT_DIR, f), ""))
      }));

      const TOPIC_INDEX = getTopicIndex();
      const GOOGLE_MODEL = getGoogleModel();

      return res.json({
        ok: true,
        uptime: process.uptime(),
        nodeVersion: process.version,
        memory: {
          rss: memUsage.rss,
          heapUsed: memUsage.heapUsed,
          heapTotal: memUsage.heapTotal
        },
        agentStatus,
        knowledgeBase: {
          loaded: Boolean(knowledgeTable),
          recordCount: kbRowCount
        },
        topicsCount: TOPIC_INDEX.topics.length,
        model: GOOGLE_MODEL,
        llmHealth: getLlmHealthStatus()
      });
    } catch (err) {
      return res.status(500).json({ error: safeError(err, "api") });
    }
  });

  // ── Agent Reload ────────────────────────────────────────────────────────
  app.post("/api/admin/agent/reload", requireAdminAccess, (_req, res) => {
    try {
      loadAllAgentConfig();
      loadChatFlowConfig();
      loadSiteConfig();
      loadSunshineConfig();
      return res.json({ ok: true, message: "Agent config yeniden yuklendi." });
    } catch (err) {
      return res.status(500).json({ error: safeError(err, "api") });
    }
  });

  // ── Env: Read ───────────────────────────────────────────────────────────
  app.get("/api/admin/env", requireAdminAccess, (_req, res) => {
    try {
      const env = readEnvFile();
      const SENSITIVE_KEYS = ["GOOGLE_API_KEY", "LLM_API_KEY", "EMBEDDING_API_KEY", "ADMIN_TOKEN", "ZENDESK_SNIPPET_KEY", "ZENDESK_SC_KEY_SECRET", "ZENDESK_SC_WEBHOOK_SECRET", "DEPLOY_WEBHOOK_SECRET", "TELEGRAM_BOT_TOKEN"];
      const masked = {};
      for (const [key, value] of Object.entries(env)) {
        if (SENSITIVE_KEYS.includes(key) && value) {
          masked[key] = value.slice(0, 4) + "****" + value.slice(-4);
        } else {
          masked[key] = value;
        }
      }
      return res.json({ ok: true, env: masked, sensitiveKeys: SENSITIVE_KEYS });
    } catch (err) {
      return res.status(500).json({ error: safeError(err, "api") });
    }
  });

  // ── Env: Update ─────────────────────────────────────────────────────────
  app.put("/api/admin/env", requireAdminAccess, (req, res) => {
    try {
      const { updates } = req.body || {};
      if (!updates || typeof updates !== "object") return res.status(400).json({ error: "updates objesi zorunludur." });

      const cleanUpdates = {};
      for (const [key, value] of Object.entries(updates)) {
        if (typeof value === "string" && !value.includes("****")) {
          cleanUpdates[key] = value;
        }
      }

      writeEnvFile(cleanUpdates);
      reloadRuntimeEnv();
      const keyChanged = ["GOOGLE_API_KEY", "GEMINI_API_KEY", "LLM_API_KEY", "GOOGLE_MODEL", "LLM_MODEL", "LLM_PROVIDER"].some(k => k in cleanUpdates);
      if (keyChanged) {
        setTimeout(checkLLMHealth, 500);
      }
      return res.json({ ok: true, message: "Env guncellendi ve aninda uyguland\u0131." });
    } catch (err) {
      return res.status(500).json({ error: safeError(err, "api") });
    }
  });

  // ── Audit helpers (shared with other sub-routes) ─────────────────────
  function recordAuditEvent(action, details, adminIp) {
    const data = loadAuditLog();
    data.entries.push({
      action,
      details: String(details || "").slice(0, 500),
      adminIp: String(adminIp || "").slice(0, 50),
      timestamp: nowIso()
    });
    saveAuditLog(data);
  }

  // ── Onboarding Status ──────────────────────────────────────────────────
  app.get("/api/admin/onboarding-status", requireAdminAccess, (_req, res) => {
    try {
      const kbCount = typeof loadCSVData === "function" ? loadCSVData().length : 0;
      const personaExists = fs.existsSync(path.join(AGENT_DIR, "persona.md"));
      const topicIndex = typeof getTopicIndex === "function" ? getTopicIndex() : { topics: [] };
      const topicCount = Array.isArray(topicIndex.topics) ? topicIndex.topics.length : 0;

      const items = [
        { id: "kb", label: "Bilgi tabanina en az 10 soru-cevap ekleyin", done: kbCount >= 10 },
        { id: "persona", label: "Bot kisiligini ozellestirin", done: personaExists },
        { id: "topics", label: "En az 3 konu olusturun", done: topicCount >= 3 },
        { id: "test", label: "Bot'u test edin", done: false }, // Client-side tracking
        { id: "widget", label: "Widget kodunu kopyalayin", done: false }, // Client-side tracking
      ];

      const allDone = items.filter(i => i.id !== "test" && i.id !== "widget").every(i => i.done);
      return res.json({ ok: true, items, allDone });
    } catch (err) {
      return res.status(500).json({ error: safeError(err, "api") });
    }
  });

  // ── Audit Log ───────────────────────────────────────────────────────────
  app.get("/api/admin/audit-log", requireAdminAccess, (_req, res) => {
    const data = loadAuditLog();
    return res.json({ ok: true, entries: (data.entries || []).slice(-100).reverse() });
  });

  return { recordAuditEvent };
}

module.exports = { mount };

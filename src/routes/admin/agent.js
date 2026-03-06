"use strict";

/**
 * Admin Agent Routes — agent files CRUD, topics CRUD, memory config
 */
function mount(app, deps) {
  const {
    requireAdminAccess,
    fs,
    path,
    loadAllAgentConfig,
    readJsonFileSafe,
    isValidFilename,
    savePromptVersion,
    invalidateTopicCache,
    safeError,
    callLLM,
    AGENT_DIR,
    TOPICS_DIR,
    MEMORY_DIR,
    logger,
    recordAuditEvent,
  } = deps;

  // ── Agent Files: List ───────────────────────────────────────────────────
  app.get("/api/admin/agent/files", requireAdminAccess, (_req, res) => {
    try {
      const files = fs.readdirSync(AGENT_DIR).filter(f => f.endsWith(".md")).sort();
      return res.json({ ok: true, files });
    } catch (err) {
      return res.status(500).json({ error: safeError(err, "api") });
    }
  });

  // ── Agent Files: Read ───────────────────────────────────────────────────
  app.get("/api/admin/agent/files/:filename", requireAdminAccess, (req, res) => {
    const filename = req.params.filename;
    if (!isValidFilename(filename)) return res.status(400).json({ error: "Invalid filename." });

    const filePath = path.join(AGENT_DIR, filename);
    try {
      const content = fs.readFileSync(filePath, "utf8");
      return res.json({ ok: true, filename, content });
    } catch (_err) {
      return res.status(404).json({ error: "File not found." });
    }
  });

  // ── Agent Files: Save ───────────────────────────────────────────────────
  app.put("/api/admin/agent/files/:filename", requireAdminAccess, (req, res) => {
    const filename = req.params.filename;
    if (!isValidFilename(filename)) return res.status(400).json({ error: "Invalid filename." });

    const { content, auditContext } = req.body || {};
    if (typeof content !== "string") return res.status(400).json({ error: "content is required." });

    const filePath = path.join(AGENT_DIR, filename);
    try {
      if (fs.existsSync(filePath)) {
        const oldContent = fs.readFileSync(filePath, "utf8");
        savePromptVersion(filename, oldContent);
      }
      fs.writeFileSync(filePath, content, "utf8");
      loadAllAgentConfig();
      recordAuditEvent?.(
        auditContext?.source === "copilot" ? "copilot_apply" : "agent_file_update",
        {
          surface: auditContext?.surface || "bot-settings",
          filename,
          goal: auditContext?.goal || "",
        },
        req.ip
      );
      return res.json({ ok: true });
    } catch (err) {
      return res.status(500).json({ error: safeError(err, "api") });
    }
  });

  // ── Topics: List ────────────────────────────────────────────────────────
  app.get("/api/admin/agent/topics", requireAdminAccess, (_req, res) => {
    try {
      const index = readJsonFileSafe(path.join(TOPICS_DIR, "_index.json"), { topics: [] });
      const includeContent = String(_req.query.includeContent || "").trim() === "1";
      const topics = includeContent
        ? index.topics.map((topic) => {
            let content = "";
            if (topic.file) {
              try {
                content = fs.readFileSync(path.join(TOPICS_DIR, topic.file), "utf8");
              } catch (_err) {
                content = "";
              }
            }
            return { ...topic, content };
          })
        : index.topics;
      return res.json({ ok: true, topics });
    } catch (err) {
      return res.status(500).json({ error: safeError(err, "api") });
    }
  });

  // ── Topics: Read single topic with content ─────────────────────────────
  app.get("/api/admin/agent/topics/:topicId", requireAdminAccess, (req, res) => {
    try {
      const indexPath = path.join(TOPICS_DIR, "_index.json");
      const index = readJsonFileSafe(indexPath, { topics: [] });
      const topic = index.topics.find(t => t.id === req.params.topicId);
      if (!topic) return res.status(404).json({ error: "Topic not found." });

      let content = "";
      if (topic.file) {
        try {
          content = fs.readFileSync(path.join(TOPICS_DIR, topic.file), "utf8");
        } catch (_err) {
          content = "";
        }
      }

      return res.json({ ok: true, topic, content });
    } catch (err) {
      return res.status(500).json({ error: safeError(err, "api") });
    }
  });

  // ── Topics: Update ──────────────────────────────────────────────────────
  app.put("/api/admin/agent/topics/:topicId", requireAdminAccess, (req, res) => {
    try {
      const {
        title,
        description,
        keywords,
        requiresEscalation,
        canResolveDirectly,
        requiredInfo,
        content,
        auditContext,
      } = req.body || {};
      const indexPath = path.join(TOPICS_DIR, "_index.json");
      const index = readJsonFileSafe(indexPath, { topics: [] });
      const topicIdx = index.topics.findIndex(t => t.id === req.params.topicId);
      if (topicIdx < 0) return res.status(404).json({ error: "Topic not found." });

      const topic = index.topics[topicIdx];
      if (title !== undefined) topic.title = title;
      if (description !== undefined) topic.description = description;
      if (Array.isArray(keywords)) topic.keywords = keywords;
      if (typeof requiresEscalation === "boolean") topic.requiresEscalation = requiresEscalation;
      if (typeof canResolveDirectly === "boolean") topic.canResolveDirectly = canResolveDirectly;
      if (Array.isArray(requiredInfo)) topic.requiredInfo = requiredInfo;

      fs.writeFileSync(indexPath, JSON.stringify(index, null, 2), "utf8");

      if (typeof content === "string") {
        fs.writeFileSync(path.join(TOPICS_DIR, topic.file), content, "utf8");
      }

      loadAllAgentConfig();
      invalidateTopicCache(req.params.topicId);
      recordAuditEvent?.(
        auditContext?.source === "copilot" ? "copilot_apply" : "topic_update",
        {
          surface: auditContext?.surface || "topics",
          topicId: req.params.topicId,
          goal: auditContext?.goal || "",
        },
        req.ip
      );
      return res.json({ ok: true });
    } catch (err) {
      return res.status(500).json({ error: safeError(err, "api") });
    }
  });

  // ── Topics: Create ──────────────────────────────────────────────────────
  app.post("/api/admin/agent/topics", requireAdminAccess, (req, res) => {
    try {
      const {
        id,
        title,
        description,
        keywords,
        requiresEscalation,
        canResolveDirectly,
        requiredInfo,
        content,
        auditContext,
      } = req.body || {};
      if (!id || !title) return res.status(400).json({ error: "id and title are required." });
      if (!/^[a-z0-9-]+$/.test(id)) return res.status(400).json({ error: "Invalid topic ID format." });

      const indexPath = path.join(TOPICS_DIR, "_index.json");
      const index = readJsonFileSafe(indexPath, { topics: [] });
      if (index.topics.find(t => t.id === id)) return res.status(400).json({ error: "This ID already exists." });

      const filename = `${id}.md`;
      const newTopic = {
        id,
        title,
        description: description || "",
        keywords: Array.isArray(keywords) ? keywords : [],
        file: filename,
        requiresEscalation: Boolean(requiresEscalation),
        requiredInfo: Array.isArray(requiredInfo) ? requiredInfo : [],
        canResolveDirectly: Boolean(canResolveDirectly)
      };

      index.topics.push(newTopic);
      fs.writeFileSync(indexPath, JSON.stringify(index, null, 2), "utf8");
      fs.writeFileSync(path.join(TOPICS_DIR, filename), content || "", "utf8");

      loadAllAgentConfig();
      recordAuditEvent?.(
        auditContext?.source === "copilot" ? "copilot_apply" : "topic_create",
        {
          surface: auditContext?.surface || "topics",
          topicId: id,
          goal: auditContext?.goal || "",
        },
        req.ip
      );
      return res.json({ ok: true, topic: newTopic });
    } catch (err) {
      return res.status(500).json({ error: safeError(err, "api") });
    }
  });

  // ── Topics: Delete ──────────────────────────────────────────────────────
  app.delete("/api/admin/agent/topics/:topicId", requireAdminAccess, (req, res) => {
    try {
      const indexPath = path.join(TOPICS_DIR, "_index.json");
      const index = readJsonFileSafe(indexPath, { topics: [] });
      const topicIdx = index.topics.findIndex(t => t.id === req.params.topicId);
      if (topicIdx < 0) return res.status(404).json({ error: "Topic not found." });

      const topic = index.topics[topicIdx];
      index.topics.splice(topicIdx, 1);
      fs.writeFileSync(indexPath, JSON.stringify(index, null, 2), "utf8");

      const topicFile = path.join(TOPICS_DIR, topic.file);
      try { fs.unlinkSync(topicFile); } catch (err) { logger.warn("deleteTopic", "File cleanup", err); }

      loadAllAgentConfig();
      invalidateTopicCache(req.params.topicId);
      recordAuditEvent?.("topic_delete", { topicId: req.params.topicId }, req.ip);
      return res.json({ ok: true });
    } catch (err) {
      return res.status(500).json({ error: safeError(err, "api") });
    }
  });

  // ── Topics: Suggest Keywords ────────────────────────────────────────────
  app.post("/api/admin/topics/suggest-keywords", requireAdminAccess, async (req, res) => {
    const { title } = req.body || {};
    if (!title || typeof title !== "string") {
      return res.status(400).json({ error: "title is required." });
    }
    if (!callLLM) {
      return res.status(500).json({ error: "LLM service is not configured." });
    }
    try {
      const result = await callLLM(
        [{ role: "user", parts: [{ text: title }] }],
        "Suggest keywords for a customer support topic. You will receive the topic title. Think about how customers might ask this topic and suggest 8-12 keywords/phrases. Write as a single line separated by commas. Write only the keywords, nothing else.",
        128
      );
      const raw = (result.reply || "").trim();
      const keywords = raw
        .split(",")
        .map(k => k.trim())
        .filter(Boolean);
      return res.json({ ok: true, keywords, raw });
    } catch (err) {
      return res.status(500).json({ error: safeError(err, "api") });
    }
  });

  // ── Memory: Read ────────────────────────────────────────────────────────
  app.get("/api/admin/agent/memory", requireAdminAccess, (_req, res) => {
    try {
      const ticketTemplate = readJsonFileSafe(path.join(MEMORY_DIR, "ticket-template.json"), {});
      const conversationSchema = readJsonFileSafe(path.join(MEMORY_DIR, "conversation-schema.json"), {});
      return res.json({ ok: true, files: { "ticket-template.json": ticketTemplate, "conversation-schema.json": conversationSchema } });
    } catch (err) {
      return res.status(500).json({ error: safeError(err, "api") });
    }
  });

  // ── Memory: Save ────────────────────────────────────────────────────────
  app.put("/api/admin/agent/memory/:filename", requireAdminAccess, (req, res) => {
    const filename = req.params.filename;
    const allowed = ["ticket-template.json", "conversation-schema.json"];
    if (!allowed.includes(filename)) return res.status(400).json({ error: "Invalid filename." });

    const { content, auditContext } = req.body || {};
    if (typeof content !== "string") return res.status(400).json({ error: "content is required." });

    try { JSON.parse(content); } catch (_err) {
      return res.status(400).json({ error: "Invalid JSON format." });
    }

    try {
      fs.writeFileSync(path.join(MEMORY_DIR, filename), content, "utf8");
      loadAllAgentConfig();
      recordAuditEvent?.(
        auditContext?.source === "copilot" ? "copilot_apply" : "memory_update",
        {
          surface: auditContext?.surface || "bot-settings",
          filename,
          goal: auditContext?.goal || "",
        },
        req.ip
      );
      return res.json({ ok: true });
    } catch (err) {
      return res.status(500).json({ error: safeError(err, "api") });
    }
  });
}

module.exports = { mount };

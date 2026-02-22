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
    readTextFileSafe,
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
    if (!isValidFilename(filename)) return res.status(400).json({ error: "Gecersiz dosya adi." });

    const filePath = path.join(AGENT_DIR, filename);
    try {
      const content = fs.readFileSync(filePath, "utf8");
      return res.json({ ok: true, filename, content });
    } catch (_err) {
      return res.status(404).json({ error: "Dosya bulunamadi." });
    }
  });

  // ── Agent Files: Save ───────────────────────────────────────────────────
  app.put("/api/admin/agent/files/:filename", requireAdminAccess, (req, res) => {
    const filename = req.params.filename;
    if (!isValidFilename(filename)) return res.status(400).json({ error: "Gecersiz dosya adi." });

    const { content } = req.body || {};
    if (typeof content !== "string") return res.status(400).json({ error: "content zorunludur." });

    const filePath = path.join(AGENT_DIR, filename);
    try {
      if (fs.existsSync(filePath)) {
        const oldContent = fs.readFileSync(filePath, "utf8");
        savePromptVersion(filename, oldContent);
      }
      fs.writeFileSync(filePath, content, "utf8");
      loadAllAgentConfig();
      return res.json({ ok: true });
    } catch (err) {
      return res.status(500).json({ error: safeError(err, "api") });
    }
  });

  // ── Topics: List ────────────────────────────────────────────────────────
  app.get("/api/admin/agent/topics", requireAdminAccess, (_req, res) => {
    try {
      const index = readJsonFileSafe(path.join(TOPICS_DIR, "_index.json"), { topics: [] });
      return res.json({ ok: true, topics: index.topics });
    } catch (err) {
      return res.status(500).json({ error: safeError(err, "api") });
    }
  });

  // ── Topics: Get one ─────────────────────────────────────────────────────
  app.get("/api/admin/agent/topics/:topicId", requireAdminAccess, (req, res) => {
    try {
      const index = readJsonFileSafe(path.join(TOPICS_DIR, "_index.json"), { topics: [] });
      const topic = index.topics.find(t => t.id === req.params.topicId);
      if (!topic) return res.status(404).json({ error: "Konu bulunamadi." });

      const content = readTextFileSafe(path.join(TOPICS_DIR, topic.file), "");
      return res.json({ ok: true, topic, content });
    } catch (err) {
      return res.status(500).json({ error: safeError(err, "api") });
    }
  });

  // ── Topics: Update ──────────────────────────────────────────────────────
  app.put("/api/admin/agent/topics/:topicId", requireAdminAccess, (req, res) => {
    try {
      const { title, keywords, requiresEscalation, canResolveDirectly, requiredInfo, content } = req.body || {};
      const indexPath = path.join(TOPICS_DIR, "_index.json");
      const index = readJsonFileSafe(indexPath, { topics: [] });
      const topicIdx = index.topics.findIndex(t => t.id === req.params.topicId);
      if (topicIdx < 0) return res.status(404).json({ error: "Konu bulunamadi." });

      const topic = index.topics[topicIdx];
      if (title !== undefined) topic.title = title;
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
      return res.json({ ok: true });
    } catch (err) {
      return res.status(500).json({ error: safeError(err, "api") });
    }
  });

  // ── Topics: Create ──────────────────────────────────────────────────────
  app.post("/api/admin/agent/topics", requireAdminAccess, (req, res) => {
    try {
      const { id, title, keywords, requiresEscalation, canResolveDirectly, requiredInfo, content } = req.body || {};
      if (!id || !title) return res.status(400).json({ error: "id ve title zorunludur." });
      if (!/^[a-z0-9-]+$/.test(id)) return res.status(400).json({ error: "Gecersiz konu ID formati." });

      const indexPath = path.join(TOPICS_DIR, "_index.json");
      const index = readJsonFileSafe(indexPath, { topics: [] });
      if (index.topics.find(t => t.id === id)) return res.status(400).json({ error: "Bu ID zaten var." });

      const filename = `${id}.md`;
      const newTopic = {
        id,
        title,
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
      if (topicIdx < 0) return res.status(404).json({ error: "Konu bulunamadi." });

      const topic = index.topics[topicIdx];
      index.topics.splice(topicIdx, 1);
      fs.writeFileSync(indexPath, JSON.stringify(index, null, 2), "utf8");

      const topicFile = path.join(TOPICS_DIR, topic.file);
      try { fs.unlinkSync(topicFile); } catch (err) { logger.warn("deleteTopic", "File cleanup", err); }

      loadAllAgentConfig();
      invalidateTopicCache(req.params.topicId);
      return res.json({ ok: true });
    } catch (err) {
      return res.status(500).json({ error: safeError(err, "api") });
    }
  });

  // ── Topics: Suggest Keywords ────────────────────────────────────────────
  app.post("/api/admin/topics/suggest-keywords", requireAdminAccess, async (req, res) => {
    const { title } = req.body || {};
    if (!title || typeof title !== "string") {
      return res.status(400).json({ error: "title zorunludur." });
    }
    if (!callLLM) {
      return res.status(500).json({ error: "LLM servisi yapilandirilmamis." });
    }
    try {
      const result = await callLLM(
        [{ role: "user", parts: [{ text: title }] }],
        "Bir musteri destek konusu icin anahtar kelime onerisi yap. Konu basligini alacaksin. Kullanicilarin bu konuyu nasil sorabilecegini dusun ve 8-12 anahtar kelime/cümle oner. Virgülle ayrilmis tek satir halinde yaz. Sadece anahtar kelimeleri yaz, baska bir sey yazma. Turkce yaz.",
        128
      );
      const keywords = (result.reply || "").trim();
      return res.json({ ok: true, keywords });
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
    if (!allowed.includes(filename)) return res.status(400).json({ error: "Gecersiz dosya adi." });

    const { content } = req.body || {};
    if (typeof content !== "string") return res.status(400).json({ error: "content zorunludur." });

    try { JSON.parse(content); } catch (_err) {
      return res.status(400).json({ error: "Gecersiz JSON formati." });
    }

    try {
      fs.writeFileSync(path.join(MEMORY_DIR, filename), content, "utf8");
      loadAllAgentConfig();
      return res.json({ ok: true });
    } catch (err) {
      return res.status(500).json({ error: safeError(err, "api") });
    }
  });
}

module.exports = { mount };

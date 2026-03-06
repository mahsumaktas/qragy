"use strict";

/**
 * Admin Knowledge Base Routes — list, add, update, delete, reingest, file upload
 */
const { getKnowledgeWarnings } = require("../../services/adminContentCopilot");
const { buildEntriesFromChunks, prepareKnowledgeImport } = require("../../services/knowledgeImport");
const { adminError } = require("../../utils/adminLocale");

function mount(app, deps) {
  const {
    requireAdminAccess,
    fs,
    path,
    loadCSVData,
    saveCSVData,
    reingestKnowledgeBase,
    getKnowledgeTable,
    safeError,
    callLLM,
    multer,
    chunkText,
    UPLOADS_DIR,
    TOPICS_DIR,
    readJsonFileSafe,
    logger,
    contextualChunker,
    urlExtractor,
    recordAuditEvent,
  } = deps;

  const upload = multer({ dest: UPLOADS_DIR, limits: { fileSize: 10 * 1024 * 1024 } });

  function getTopicList() {
    const index = readJsonFileSafe(path.join(TOPICS_DIR, "_index.json"), { topics: [] });
    return Array.isArray(index?.topics) ? index.topics : [];
  }

  function getKnowledgeBlockingWarning(question, answer) {
    const { warnings } = getKnowledgeWarnings(question, answer, getTopicList());
    if (warnings.includes("noTopicMatch")) return "noTopicMatch";
    return null;
  }

  function mergeImportedEntries(rows, entries) {
    let added = 0;
    for (const entry of entries) {
      const question = String(entry.question || "").trim();
      const answer = String(entry.answer || "").trim();
      if (!question || !answer) continue;
      const exists = rows.some((row) =>
        (row.question || "").trim().toLowerCase() === question.toLowerCase()
        && (row.answer || "").trim().toLowerCase() === answer.toLowerCase()
      );
      if (exists) continue;
      rows.push({
        question,
        answer,
        source: entry.source || "file-import",
      });
      added += 1;
    }
    return added;
  }

  // ── KB: List all ────────────────────────────────────────────────────────
  app.get("/api/admin/knowledge", requireAdminAccess, (_req, res) => {
    try {
      const rows = loadCSVData();
      return res.json({
        ok: true,
        records: rows.map((r, i) => ({
          id: i + 1,
          question: r.question || "",
          answer: r.answer || "",
          source: r.source || "",
        })),
      });
    } catch (err) {
      return res.status(500).json({ error: safeError(err, "api") });
    }
  });

  // ── KB: Add new ─────────────────────────────────────────────────────────
  app.post("/api/admin/knowledge", requireAdminAccess, async (req, res) => {
    try {
      const { question, answer, source } = req.body || {};
      if (!question || !answer) return adminError(res, req, 400, "knowledge.questionAnswerRequired");
      if (getKnowledgeBlockingWarning(question, answer) === "noTopicMatch") {
        return adminError(res, req, 400, "guardrail.knowledge.noTopicMatch");
      }

      const rows = loadCSVData();
      rows.push({ question, answer, source: source || "admin-manual" });
      saveCSVData(rows);

      await reingestKnowledgeBase();
      recordAuditEvent?.("knowledge_create", { id: rows.length, source: source || "admin-manual" }, req.ip);

      return res.json({ ok: true, id: rows.length });
    } catch (err) {
      return res.status(500).json({ error: safeError(err, "api") });
    }
  });

  // ── KB: Reingest (must be before /:id routes) ───────────────────────────
  app.post("/api/admin/knowledge/reingest", requireAdminAccess, async (_req, res) => {
    try {
      await reingestKnowledgeBase();
      const knowledgeTable = getKnowledgeTable();
      const rowCount = knowledgeTable ? await knowledgeTable.countRows() : 0;
      return res.json({ ok: true, recordCount: rowCount });
    } catch (err) {
      return res.status(500).json({ error: safeError(err, "api") });
    }
  });

  // ── KB: Update ──────────────────────────────────────────────────────────
  app.put("/api/admin/knowledge/:id", requireAdminAccess, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const { question, answer, source, auditContext } = req.body || {};
      if (!question || !answer) return adminError(res, req, 400, "knowledge.questionAnswerRequired");
      if (getKnowledgeBlockingWarning(question, answer) === "noTopicMatch") {
        return adminError(res, req, 400, "guardrail.knowledge.noTopicMatch");
      }

      const rows = loadCSVData();
      const idx = id - 1;
      if (idx < 0 || idx >= rows.length) return adminError(res, req, 404, "knowledge.recordNotFound");

      rows[idx] = { ...rows[idx], question, answer, source: source || rows[idx].source || "admin-manual" };
      saveCSVData(rows);

      await reingestKnowledgeBase();
      recordAuditEvent?.(
        auditContext?.source === "copilot" ? "copilot_apply" : "knowledge_update",
        {
          surface: auditContext?.surface || "knowledge",
          id,
          goal: auditContext?.goal || "",
        },
        req.ip
      );

      return res.json({ ok: true });
    } catch (err) {
      return res.status(500).json({ error: safeError(err, "api") });
    }
  });

  // ── KB: Delete ──────────────────────────────────────────────────────────
  app.delete("/api/admin/knowledge/:id", requireAdminAccess, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const rows = loadCSVData();
      const idx = id - 1;
      if (idx < 0 || idx >= rows.length) return adminError(res, req, 404, "knowledge.recordNotFound");

      rows.splice(idx, 1);
      saveCSVData(rows);

      await reingestKnowledgeBase();
      recordAuditEvent?.("knowledge_delete", { id }, req.ip);

      return res.json({ ok: true });
    } catch (err) {
      return res.status(500).json({ error: safeError(err, "api") });
    }
  });

  // ── KB: File Upload (PDF/DOCX/TXT/CSV/XLSX) ──────────────────────────────
  app.post("/api/admin/knowledge/upload", requireAdminAccess, upload.single("file"), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: "File is required." });
    try {
      const contextualEnrich = req.body?.contextualEnrich === "true" || req.body?.contextualEnrich === true;
      const importPlan = await prepareKnowledgeImport(req.file, {
        fs,
        path,
        chunkText,
        callLLM,
        contextualChunker,
        logger,
      }, {
        contextualEnrich,
        source: req.file.originalname,
      });
      const rows = loadCSVData();
      const added = mergeImportedEntries(rows, importPlan.entries);
      saveCSVData(rows);
      await reingestKnowledgeBase();
      recordAuditEvent?.("knowledge_upload", {
        source: req.file.originalname,
        mode: importPlan.mode,
        added,
        truncated: Boolean(importPlan.truncated),
      }, req.ip);

      try { fs.unlinkSync(req.file.path); } catch (err) { logger.warn("fileUpload", "Cleanup", err); }

      return res.json({
        ok: true,
        chunksAdded: added,
        totalRecords: rows.length,
        mode: importPlan.mode,
        truncated: Boolean(importPlan.truncated),
      });
    } catch (err) {
      try { fs.unlinkSync(req.file.path); } catch (cleanupErr) { logger.warn("fileUpload", "Cleanup", cleanupErr); }
      return res.status(500).json({ error: safeError(err, "api") });
    }
  });
  // ── KB: URL Import ────────────────────────────────────────────────────
  app.post("/api/admin/knowledge/import-url", requireAdminAccess, async (req, res) => {
    const { url } = req.body || {};
    if (!url || typeof url !== "string") {
      return res.status(400).json({ error: "url is required." });
    }

    // Basic URL validation
    try { new URL(url); } catch {
      return res.status(400).json({ error: "Invalid URL." });
    }

    if (!urlExtractor) {
      return res.status(500).json({ error: "URL import service is not configured." });
    }

    try {
      const { title, text } = await urlExtractor.extract(url);
      const importPlan = await buildEntriesFromChunks(
        chunkText(text, { filename: title || url }),
        { callLLM, logger },
        { filename: title || url, source: url }
      );
      if (!importPlan.entries.length) return res.status(400).json({ error: "Could not extract sufficient content from page." });
      const rows = loadCSVData();
      const added = mergeImportedEntries(rows, importPlan.entries);
      saveCSVData(rows);
      await reingestKnowledgeBase();

      return res.json({
        ok: true,
        title: title || "",
        chunksAdded: added,
        totalRecords: rows.length,
        truncated: Boolean(importPlan.truncated),
      });
    } catch (err) {
      return res.status(500).json({ error: safeError(err, "api") });
    }
  });

  // ── KB: Batch Upload (multiple files) ──────────────────────────────────
  const uploadBatch = multer({ dest: UPLOADS_DIR, limits: { fileSize: 10 * 1024 * 1024 } });
  app.post("/api/admin/knowledge/upload-batch", requireAdminAccess, uploadBatch.array("files", 10), async (req, res) => {
    if (!req.files || !req.files.length) {
      return res.status(400).json({ error: "At least one file is required." });
    }

    const results = [];
    let totalAdded = 0;

    for (const file of req.files) {
      try {
        const importPlan = await prepareKnowledgeImport(file, {
          fs,
          path,
          chunkText,
          callLLM,
          contextualChunker,
          logger,
        }, {
          source: file.originalname,
        });
        const rows = loadCSVData();
        const added = mergeImportedEntries(rows, importPlan.entries);
        if (added > 0) saveCSVData(rows);
        totalAdded += added;
        results.push({
          file: file.originalname,
          ok: true,
          chunksAdded: added,
          mode: importPlan.mode,
          truncated: Boolean(importPlan.truncated),
        });
      } catch (err) {
        results.push({ file: file.originalname, ok: false, error: safeError(err, "api") });
      } finally {
        try { fs.unlinkSync(file.path); } catch (_) { /* cleanup */ }
      }
    }

    if (totalAdded > 0) {
      await reingestKnowledgeBase();
    }

    const rows = loadCSVData();
    return res.json({ ok: true, results, totalAdded, totalRecords: rows.length });
  });
}

module.exports = { mount };

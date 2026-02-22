"use strict";

/**
 * Admin Knowledge Base Routes — list, add, update, delete, reingest, file upload
 */
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
    logger,
  } = deps;

  const upload = multer({ dest: UPLOADS_DIR, limits: { fileSize: 10 * 1024 * 1024 } });

  async function extractTextFromFile(filePath, mimetype, originalname) {
    const ext = path.extname(originalname).toLowerCase();
    if (ext === ".txt" || mimetype === "text/plain") {
      return fs.readFileSync(filePath, "utf8");
    }
    if (ext === ".pdf" || mimetype === "application/pdf") {
      const pdfParse = require("pdf-parse");
      const buffer = fs.readFileSync(filePath);
      const data = await pdfParse(buffer);
      return data.text || "";
    }
    if (ext === ".docx" || mimetype === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
      const mammoth = require("mammoth");
      const result = await mammoth.extractRawText({ path: filePath });
      return result.value || "";
    }
    throw new Error("Desteklenmeyen dosya formati: " + ext);
  }

  // ── KB: List all ────────────────────────────────────────────────────────
  app.get("/api/admin/knowledge", requireAdminAccess, (_req, res) => {
    try {
      const rows = loadCSVData();
      return res.json({ ok: true, records: rows.map((r, i) => ({ id: i + 1, question: r.question || "", answer: r.answer || "" })) });
    } catch (err) {
      return res.status(500).json({ error: safeError(err, "api") });
    }
  });

  // ── KB: Add new ─────────────────────────────────────────────────────────
  app.post("/api/admin/knowledge", requireAdminAccess, async (req, res) => {
    try {
      const { question, answer } = req.body || {};
      if (!question || !answer) return res.status(400).json({ error: "question ve answer zorunludur." });

      const rows = loadCSVData();
      rows.push({ question, answer });
      saveCSVData(rows);

      await reingestKnowledgeBase();

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
      const { question, answer } = req.body || {};
      if (!question || !answer) return res.status(400).json({ error: "question ve answer zorunludur." });

      const rows = loadCSVData();
      const idx = id - 1;
      if (idx < 0 || idx >= rows.length) return res.status(404).json({ error: "Kayit bulunamadi." });

      rows[idx] = { question, answer };
      saveCSVData(rows);

      await reingestKnowledgeBase();

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
      if (idx < 0 || idx >= rows.length) return res.status(404).json({ error: "Kayit bulunamadi." });

      rows.splice(idx, 1);
      saveCSVData(rows);

      await reingestKnowledgeBase();

      return res.json({ ok: true });
    } catch (err) {
      return res.status(500).json({ error: safeError(err, "api") });
    }
  });

  // ── KB: File Upload (PDF/DOCX/TXT) ─────────────────────────────────────
  app.post("/api/admin/knowledge/upload", requireAdminAccess, upload.single("file"), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: "Dosya gerekli." });
    try {
      const text = await extractTextFromFile(req.file.path, req.file.mimetype, req.file.originalname);
      if (!text.trim()) return res.status(400).json({ error: "Dosyadan metin cikarilamadi." });

      const chunks = chunkText(text, { filename: req.file.originalname });
      if (!chunks.length) return res.status(400).json({ error: "Yeterli icerik bulunamadi." });

      const rows = loadCSVData();
      let added = 0;

      for (const chunk of chunks) {
        let question;
        try {
          const qResult = await callLLM(
            [{ role: "user", parts: [{ text: chunk }] }],
            "Bu metin parcasini ozetleyen tek bir soru yaz. Turkce yaz. Sadece soruyu yaz, baska bir sey yazma.",
            64
          );
          question = (qResult.reply || "").trim();
        } catch (err) {
          logger.warn("fileUpload", "Question generation", err);
          question = chunk.slice(0, 100) + "...";
        }
        if (!question) question = chunk.slice(0, 100) + "...";

        rows.push({ question, answer: chunk, source: req.file.originalname });
        added++;
      }

      saveCSVData(rows);
      await reingestKnowledgeBase();

      try { fs.unlinkSync(req.file.path); } catch (err) { logger.warn("fileUpload", "Cleanup", err); }

      return res.json({ ok: true, chunksAdded: added, totalRecords: rows.length });
    } catch (err) {
      try { fs.unlinkSync(req.file.path); } catch (cleanupErr) { logger.warn("fileUpload", "Cleanup", cleanupErr); }
      return res.status(500).json({ error: safeError(err, "api") });
    }
  });
}

module.exports = { mount };

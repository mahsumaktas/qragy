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
    contextualChunker,
    urlExtractor,
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

  /**
   * Extract Q&A pairs from XLSX/XLS file.
   * Header detection: looks for soru/question + cevap/answer columns.
   * Fallback: col 1 = question, col 2 = answer.
   * @returns {Array<{ question: string, answer: string }>}
   */
  function extractQAFromXlsx(filePath) {
    const XLSX = require("xlsx");
    const workbook = XLSX.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) throw new Error("XLSX dosyasinda sayfa bulunamadi.");

    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });
    if (!rows.length) throw new Error("XLSX dosyasi bos.");

    // Try to detect Q/A columns from headers
    const headers = Object.keys(rows[0]).map(h => h.toLowerCase().trim());
    const qHeaders = ["soru", "question", "q"];
    const aHeaders = ["cevap", "answer", "a", "yanit"];

    let qCol = null;
    let aCol = null;
    for (const h of headers) {
      if (!qCol && qHeaders.some(qh => h.includes(qh))) qCol = Object.keys(rows[0])[headers.indexOf(h)];
      if (!aCol && aHeaders.some(ah => h.includes(ah))) aCol = Object.keys(rows[0])[headers.indexOf(h)];
    }

    // Fallback: first column = question, second column = answer
    if (!qCol || !aCol) {
      const keys = Object.keys(rows[0]);
      qCol = keys[0];
      aCol = keys[1] || keys[0];
    }

    const pairs = [];
    for (const row of rows) {
      const q = String(row[qCol] || "").trim();
      const a = String(row[aCol] || "").trim();
      if (q && a) pairs.push({ question: q, answer: a });
    }

    return pairs;
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

  // ── KB: File Upload (PDF/DOCX/TXT/XLSX) ──────────────────────────────────
  app.post("/api/admin/knowledge/upload", requireAdminAccess, upload.single("file"), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: "Dosya gerekli." });
    try {
      const ext = path.extname(req.file.originalname).toLowerCase();

      // XLSX/XLS: extract Q&A pairs directly (no chunking needed)
      if (ext === ".xlsx" || ext === ".xls") {
        const pairs = extractQAFromXlsx(req.file.path);
        if (!pairs.length) {
          try { fs.unlinkSync(req.file.path); } catch (_) { /* cleanup */ }
          return res.status(400).json({ error: "XLSX dosyasindan soru-cevap cifti cikarilamadi." });
        }

        const rows = loadCSVData();
        let added = 0;
        for (const pair of pairs) {
          const exists = rows.some(r =>
            (r.question || "").trim().toLowerCase() === pair.question.trim().toLowerCase()
          );
          if (!exists) {
            rows.push({ question: pair.question, answer: pair.answer, source: req.file.originalname });
            added++;
          }
        }

        saveCSVData(rows);
        await reingestKnowledgeBase();
        try { fs.unlinkSync(req.file.path); } catch (_) { /* cleanup */ }
        return res.json({ ok: true, chunksAdded: added, totalRecords: rows.length });
      }

      const text = await extractTextFromFile(req.file.path, req.file.mimetype, req.file.originalname);
      if (!text.trim()) return res.status(400).json({ error: "Dosyadan metin cikarilamadi." });

      let chunks = chunkText(text, { filename: req.file.originalname });
      if (!chunks.length) return res.status(400).json({ error: "Yeterli icerik bulunamadi." });

      // Optional contextual enrichment (adds LLM-generated context prefix to each chunk)
      const contextualEnrich = req.body?.contextualEnrich === "true" || req.body?.contextualEnrich === true;
      if (contextualEnrich && contextualChunker) {
        try {
          const chunkObjs = chunks.map(c => ({ question: "", answer: c }));
          const enriched = await contextualChunker.enrichBatch(chunkObjs, req.file.originalname);
          chunks = enriched.map(e => e.contextualContent || e.originalContent || e.answer);
        } catch (err) {
          logger.warn("fileUpload", "Contextual enrichment hatasi, orijinal chunk'lar kullaniliyor", err);
        }
      }

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
  // ── KB: URL Import ────────────────────────────────────────────────────
  app.post("/api/admin/knowledge/import-url", requireAdminAccess, async (req, res) => {
    const { url } = req.body || {};
    if (!url || typeof url !== "string") {
      return res.status(400).json({ error: "url zorunludur." });
    }

    // Basic URL validation
    try { new URL(url); } catch {
      return res.status(400).json({ error: "Gecersiz URL." });
    }

    if (!urlExtractor) {
      return res.status(500).json({ error: "URL import servisi yapilandirilmamis." });
    }

    try {
      const { title, text } = await urlExtractor.extract(url);

      const chunks = chunkText(text, { filename: title || url });
      if (!chunks.length) return res.status(400).json({ error: "Sayfadan yeterli icerik cikarilamadi." });

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
          logger.warn("urlImport", "Question generation", err);
          question = chunk.slice(0, 100) + "...";
        }
        if (!question) question = chunk.slice(0, 100) + "...";

        rows.push({ question, answer: chunk, source: url });
        added++;
      }

      saveCSVData(rows);
      await reingestKnowledgeBase();

      return res.json({ ok: true, title: title || "", chunksAdded: added, totalRecords: rows.length });
    } catch (err) {
      return res.status(500).json({ error: safeError(err, "api") });
    }
  });

  // ── KB: Batch Upload (multiple files) ──────────────────────────────────
  const uploadBatch = multer({ dest: UPLOADS_DIR, limits: { fileSize: 10 * 1024 * 1024 } });
  app.post("/api/admin/knowledge/upload-batch", requireAdminAccess, uploadBatch.array("files", 10), async (req, res) => {
    if (!req.files || !req.files.length) {
      return res.status(400).json({ error: "En az bir dosya gerekli." });
    }

    const results = [];
    let totalAdded = 0;

    for (const file of req.files) {
      try {
        const ext = path.extname(file.originalname).toLowerCase();

        if (ext === ".xlsx" || ext === ".xls") {
          const pairs = extractQAFromXlsx(file.path);
          const rows = loadCSVData();
          let added = 0;
          for (const pair of pairs) {
            const exists = rows.some(r =>
              (r.question || "").trim().toLowerCase() === pair.question.trim().toLowerCase()
            );
            if (!exists) {
              rows.push({ question: pair.question, answer: pair.answer, source: file.originalname });
              added++;
            }
          }
          if (added > 0) saveCSVData(rows);
          totalAdded += added;
          results.push({ file: file.originalname, ok: true, chunksAdded: added });
        } else {
          const text = await extractTextFromFile(file.path, file.mimetype, file.originalname);
          if (!text.trim()) {
            results.push({ file: file.originalname, ok: false, error: "Metin cikarilamadi" });
            continue;
          }
          const chunks = chunkText(text, { filename: file.originalname });
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
            } catch (_) {
              question = chunk.slice(0, 100) + "...";
            }
            if (!question) question = chunk.slice(0, 100) + "...";
            rows.push({ question, answer: chunk, source: file.originalname });
            added++;
          }
          if (added > 0) saveCSVData(rows);
          totalAdded += added;
          results.push({ file: file.originalname, ok: true, chunksAdded: added });
        }
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

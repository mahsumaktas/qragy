"use strict";

const Papa = require("papaparse");

const TABULAR_EXTENSIONS = new Set([".csv", ".xls", ".xlsx"]);
const QUESTION_HEADER_HINTS = ["soru", "question", "q"];
const ANSWER_HEADER_HINTS = ["cevap", "answer", "a", "yanit"];
const MAX_TABULAR_ROWS = 2000;
const MAX_QA_PAIRS = 500;
const MAX_IMPORT_TEXT_CHARS = 60000;
const MAX_IMPORT_CHUNKS = 60;
const MAX_LLM_QUESTION_CHUNKS = 12;
const PREVIEW_ROW_COUNT = 8;

function normalizeHeader(value) {
  return String(value || "").trim().toLowerCase();
}

function compactText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function looksLikeHeaderLabel(label) {
  const compact = compactText(label);
  if (!compact) return false;
  if (compact.length > 40) return false;
  if (/[?!]/.test(compact)) return false;
  const wordCount = compact.split(/\s+/).length;
  return wordCount <= 4;
}

function sanitizeTabularRows(rows) {
  return (Array.isArray(rows) ? rows : [])
    .map((row) => (row && typeof row === "object" ? row : null))
    .filter(Boolean)
    .map((row) => {
      const sanitized = {};
      for (const [key, value] of Object.entries(row)) {
        const cleanKey = compactText(key);
        const cleanValue = compactText(value);
        if (cleanKey && cleanValue) sanitized[cleanKey] = cleanValue;
      }
      return sanitized;
    })
    .filter((row) => Object.keys(row).length > 0)
    .slice(0, MAX_TABULAR_ROWS);
}

function rowsFromMatrix(matrix) {
  return (Array.isArray(matrix) ? matrix : [])
    .map((row) => {
      if (!Array.isArray(row)) return null;
      const mapped = {};
      row.forEach((value, index) => {
        const cleanValue = compactText(value);
        if (cleanValue) mapped[`Column ${index + 1}`] = cleanValue;
      });
      return mapped;
    })
    .filter(Boolean);
}

function parseCsvRows(raw) {
  const parsed = Papa.parse(raw, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (header) => compactText(header),
  });

  const fields = Array.isArray(parsed.meta?.fields) ? parsed.meta.fields.filter(Boolean) : [];
  if (
    fields.length === 2 &&
    fields.some((field) => !looksLikeHeaderLabel(field))
  ) {
    const fallback = Papa.parse(raw, { header: false, skipEmptyLines: true });
    return rowsFromMatrix(fallback.data);
  }

  return sanitizeTabularRows(parsed.data);
}

function readTabularRows(filePath, originalname) {
  const ext = originalname.toLowerCase().split(".").pop();
  if (ext === "csv") {
    return parseCsvRows(require("fs").readFileSync(filePath, "utf8"));
  }

  const XLSX = require("xlsx");
  const workbook = XLSX.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return [];
  const sheet = workbook.Sheets[sheetName];
  return sanitizeTabularRows(XLSX.utils.sheet_to_json(sheet, { defval: "" }));
}

function detectQaColumns(rows) {
  if (!rows.length) return null;
  const keys = Object.keys(rows[0]);
  const normalizedKeys = keys.map((key) => normalizeHeader(key));

  let qCol = null;
  let aCol = null;
  for (let index = 0; index < keys.length; index += 1) {
    const normalized = normalizedKeys[index];
    if (!qCol && QUESTION_HEADER_HINTS.some((hint) => normalized.includes(hint))) qCol = keys[index];
    if (!aCol && ANSWER_HEADER_HINTS.some((hint) => normalized.includes(hint))) aCol = keys[index];
  }

  if (qCol && aCol) return { qCol, aCol, mode: "header" };

  if (keys.length === 2) {
    const sample = rows
      .map((row) => ({
        question: compactText(row[keys[0]]),
        answer: compactText(row[keys[1]]),
      }))
      .filter((row) => row.question && row.answer)
      .slice(0, 25);

    if (sample.length >= 2) {
      const avgQuestionLength = sample.reduce((sum, row) => sum + row.question.length, 0) / sample.length;
      const avgAnswerLength = sample.reduce((sum, row) => sum + row.answer.length, 0) / sample.length;
      const questionLikeCount = sample.filter((row) => (
        /[?？]/.test(row.question) || row.question.split(/\s+/).length >= 3
      )).length;
      const codeLikeCount = sample.filter((row) => (
        /^[A-Z0-9_-]{2,20}$/i.test(row.question.replace(/\s+/g, ""))
      )).length;
      if (
        avgAnswerLength >= avgQuestionLength &&
        avgAnswerLength >= 20 &&
        questionLikeCount >= Math.ceil(sample.length * 0.6) &&
        codeLikeCount <= Math.floor(sample.length * 0.3)
      ) {
        return { qCol: keys[0], aCol: keys[1], mode: "two-column" };
      }
    }
  }

  return null;
}

function extractQAPairsFromRows(rows) {
  const match = detectQaColumns(rows);
  if (!match) return { pairs: [], mode: null };

  const seen = new Set();
  const pairs = [];

  for (const row of rows) {
    const question = compactText(row[match.qCol]);
    const answer = compactText(row[match.aCol]);
    if (!question || !answer) continue;
    const dedupeKey = `${question.toLowerCase()}|||${answer.toLowerCase()}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    pairs.push({ question, answer });
    if (pairs.length >= MAX_QA_PAIRS) break;
  }

  return { pairs, mode: match.mode };
}

function tabularRowsToText(rows) {
  return rows
    .slice(0, MAX_TABULAR_ROWS)
    .map((row, index) => {
      const cells = Object.entries(row)
        .map(([key, value]) => `${key}: ${compactText(value)}`)
        .filter((cell) => cell && !cell.endsWith(":"));
      if (!cells.length) return "";
      return `Row ${index + 1} - ${cells.join(" | ")}`;
    })
    .filter(Boolean)
    .join("\n");
}

async function extractTextFromImportFile(filePath, mimetype, originalname, deps) {
  const { fs, path } = deps;
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
  if (TABULAR_EXTENSIONS.has(ext)) {
    return tabularRowsToText(readTabularRows(filePath, originalname));
  }
  throw new Error("Unsupported file format: " + ext);
}

function buildHeuristicQuestion(chunk) {
  const cleaned = compactText(
    String(chunk || "")
      .replace(/^#{1,6}\s+/gm, "")
      .replace(/\|/g, " ")
      .split("\n")[0]
  );
  const firstSentence = cleaned.split(/(?<=[.!?])\s+/)[0] || cleaned;
  const truncated = firstSentence.length > 100 ? firstSentence.slice(0, 100).trim() + "..." : firstSentence;
  if (!truncated) return "Imported content summary?";
  return /[?؟]$/.test(truncated) ? truncated : truncated + "?";
}

async function buildEntriesFromChunks(chunks, deps, options = {}) {
  const { callLLM, logger } = deps;
  const source = options.source || options.filename || "file-import";
  const limitedChunks = chunks.slice(0, MAX_IMPORT_CHUNKS);
  const useLlmQuestions = typeof callLLM === "function" && limitedChunks.length <= MAX_LLM_QUESTION_CHUNKS;
  const entries = [];

  for (const chunk of limitedChunks) {
    let question = buildHeuristicQuestion(chunk);
    if (useLlmQuestions) {
      try {
        const qResult = await callLLM(
          [{ role: "user", parts: [{ text: chunk }] }],
          "Write a single question summarizing this text snippet. Write only the question, nothing else.",
          64,
          { thinkingBudget: 0 }
        );
        const candidate = compactText(qResult.reply || "");
        if (candidate) {
          question = candidate;
        }
      } catch (error) {
        logger?.warn?.("knowledgeImport", "question_generation_failed", { error: error.message, source });
      }
    }
    entries.push({ question, answer: chunk, source });
  }

  return {
    entries,
    chunkCount: entries.length,
    truncated: chunks.length > MAX_IMPORT_CHUNKS,
    usedLlmQuestions: useLlmQuestions,
  };
}

async function prepareKnowledgeImport(file, deps, options = {}) {
  const { path, chunkText, contextualChunker, logger } = deps;
  const ext = path.extname(file.originalname).toLowerCase();
  const source = options.source || file.originalname;

  if (TABULAR_EXTENSIONS.has(ext)) {
    const rows = readTabularRows(file.path, file.originalname);
    const qa = extractQAPairsFromRows(rows);
    if (qa.pairs.length > 0) {
      return {
        mode: "qa_pairs",
        entries: qa.pairs.map((pair) => ({ ...pair, source })),
        pairCount: qa.pairs.length,
        rowCount: rows.length,
        preview: qa.pairs
          .slice(0, PREVIEW_ROW_COUNT)
          .map((pair, index) => `${index + 1}. Q: ${pair.question} | A: ${pair.answer}`)
          .join("\n"),
        truncated: qa.pairs.length >= MAX_QA_PAIRS || rows.length >= MAX_TABULAR_ROWS,
      };
    }
  }

  const rawText = String(await extractTextFromImportFile(file.path, file.mimetype, file.originalname, deps) || "")
    .replace(/\r/g, "")
    .trim();
  if (!rawText) {
    throw new Error("Could not extract text from file.");
  }

  const importText = rawText.slice(0, MAX_IMPORT_TEXT_CHARS);
  let chunks = chunkText(importText, {
    filename: file.originalname,
    strategy: TABULAR_EXTENSIONS.has(ext) ? "recursive" : undefined,
  });
  if (!chunks.length) {
    throw new Error("Insufficient content found.");
  }

  if (options.contextualEnrich && contextualChunker) {
    try {
      const chunkObjs = chunks.map((chunk) => ({ question: "", answer: chunk }));
      const enriched = await contextualChunker.enrichBatch(chunkObjs, file.originalname);
      chunks = enriched.map((item) => item.contextualContent || item.originalContent || item.answer);
    } catch (error) {
      logger?.warn?.("knowledgeImport", "contextual_enrichment_failed", { error: error.message, source });
    }
  }

  const chunkResult = await buildEntriesFromChunks(chunks, deps, {
    filename: file.originalname,
    source,
  });

  return {
    mode: "chunks",
    entries: chunkResult.entries,
    chunkCount: chunkResult.chunkCount,
    rowCount: null,
    preview: importText.slice(0, 2000),
    truncated: rawText.length > MAX_IMPORT_TEXT_CHARS || chunkResult.truncated,
    usedLlmQuestions: chunkResult.usedLlmQuestions,
  };
}

module.exports = {
  MAX_IMPORT_CHUNKS,
  MAX_IMPORT_TEXT_CHARS,
  MAX_QA_PAIRS,
  MAX_TABULAR_ROWS,
  buildEntriesFromChunks,
  prepareKnowledgeImport,
  extractQAPairsFromRows,
  extractTextFromImportFile,
  parseCsvRows,
  readTabularRows,
};

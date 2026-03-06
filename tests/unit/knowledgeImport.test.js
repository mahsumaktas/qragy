import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import XLSX from "xlsx";
import chunkerModule from "../../lib/chunker.js";
import knowledgeImportModule from "../../src/services/knowledgeImport.js";

const { chunkText } = chunkerModule;
const { prepareKnowledgeImport } = knowledgeImportModule;

function createTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "qragy-knowledge-import-"));
}

function writeCsv(tmpDir, filename, contents) {
  const filePath = path.join(tmpDir, filename);
  fs.writeFileSync(filePath, contents, "utf8");
  return filePath;
}

function writeXlsx(tmpDir, filename, rows, headers = ["Soru", "Cevap"]) {
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  XLSX.utils.book_append_sheet(workbook, sheet, "Sheet1");
  const filePath = path.join(tmpDir, filename);
  XLSX.writeFile(workbook, filePath);
  return filePath;
}

function makeDeps(overrides = {}) {
  return {
    fs,
    path,
    chunkText,
    callLLM: overrides.callLLM || vi.fn(async () => ({ reply: "Generated import question?" })),
    contextualChunker: null,
    logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
    ...overrides,
  };
}

let tmpDir = null;

afterEach(() => {
  if (tmpDir) {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    tmpDir = null;
  }
});

describe("knowledge import helpers", () => {
  it("extracts Q&A pairs from CSV files with explicit headers", async () => {
    tmpDir = createTmpDir();
    const filePath = writeCsv(
      tmpDir,
      "kb.csv",
      "Soru,Cevap\nGiris hatasi aliyorum,Once kullanici kodunu kontrol edin\nYazici calismiyor,Yazici servisinin acik oldugunu dogrulayin\n"
    );

    const importPlan = await prepareKnowledgeImport({
      path: filePath,
      mimetype: "text/csv",
      originalname: "kb.csv",
    }, makeDeps(), { source: "kb.csv" });

    expect(importPlan.mode).toBe("qa_pairs");
    expect(importPlan.entries).toHaveLength(2);
    expect(importPlan.entries[0]).toMatchObject({
      question: "Giris hatasi aliyorum",
      answer: "Once kullanici kodunu kontrol edin",
      source: "kb.csv",
    });
  });

  it("extracts Q&A pairs from XLSX files", async () => {
    tmpDir = createTmpDir();
    const filePath = writeXlsx(tmpDir, "kb.xlsx", [
      ["Rapor alamiyorum", "Rapor filtrelerini sifirlayip tekrar deneyin"],
      ["Bildirim gelmiyor", "Bildirim ayarlarinin acik oldugunu kontrol edin"],
    ]);

    const importPlan = await prepareKnowledgeImport({
      path: filePath,
      mimetype: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      originalname: "kb.xlsx",
    }, makeDeps(), { source: "kb.xlsx" });

    expect(importPlan.mode).toBe("qa_pairs");
    expect(importPlan.entries).toHaveLength(2);
    expect(importPlan.entries[1].question).toBe("Bildirim gelmiyor");
  });

  it("chunks generic CSV files and avoids per-chunk LLM calls on large imports", async () => {
    tmpDir = createTmpDir();
    const csvLines = ["Kod,Aciklama"];
    for (let index = 0; index < 120; index += 1) {
      csvLines.push(`ERR-${index},Bu satir genel olay kaydidir ve bilgi bankasi import testi icin yeterince uzun aciklama metni icerir ${"x".repeat(120)}`);
    }
    const filePath = writeCsv(tmpDir, "events.csv", csvLines.join("\n"));
    const callLLM = vi.fn(async () => ({ reply: "Should not be used" }));

    const importPlan = await prepareKnowledgeImport({
      path: filePath,
      mimetype: "text/csv",
      originalname: "events.csv",
    }, makeDeps({ callLLM }), { source: "events.csv" });

    expect(importPlan.mode).toBe("chunks");
    expect(importPlan.entries.length).toBeGreaterThan(12);
    expect(importPlan.entries.length).toBeLessThanOrEqual(60);
    expect(callLLM).not.toHaveBeenCalled();
  });
});

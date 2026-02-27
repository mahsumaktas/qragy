/**
 * knowledge_base.csv -> LanceDB ingestion script
 *
 * Kullanim:
 *   node scripts/ingest.js
 *
 * CSV formati: question,answer
 * Embedding: Multi-provider (Gemini/OpenAI/Ollama via lib/providers.js)
 * Hedef: data/lancedb/knowledge_qa tablosu
 */

require("dotenv").config();

const fs = require("fs");
const path = require("path");
const Papa = require("papaparse");
const lancedb = require("@lancedb/lancedb");
const { embedText, getProviderConfig } = require("../lib/providers");

const CSV_EXAMPLE = path.join(__dirname, "..", "knowledge_base.example.csv");
const CSV_PATH = path.join(__dirname, "..", "data", "knowledge_base.csv");
const LANCE_DB_PATH = path.join(__dirname, "..", "data", "lancedb");
const TABLE_NAME = "knowledge_qa";
const EMBED_DELAY_MS = 250;
const MAX_RETRIES = 5;

async function embedWithRetry(text, idx) {
  let delay = 1000;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const values = await embedText(text);
      return Array.from(values);
    } catch (err) {
      if (err.status === 429 && attempt < MAX_RETRIES) {
        console.warn(`  [${idx}] Rate limit (429), ${delay}ms bekleniyor... (deneme ${attempt}/${MAX_RETRIES})`);
        await sleep(delay);
        delay *= 2;
        continue;
      }
      throw err;
    }
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const cfg = getProviderConfig();
  if (!cfg.embeddingApiKey && cfg.embeddingProvider !== "ollama") {
    console.error("API key gerekli. GOOGLE_API_KEY, LLM_API_KEY veya EMBEDDING_API_KEY env degiskeni ayarlayin.");
    process.exit(1);
  }

  console.log(`Embedding provider: ${cfg.embeddingProvider}, model: ${cfg.embeddingModel}`);

  // First run: copy example KB if no runtime KB exists
  if (!fs.existsSync(CSV_PATH) && fs.existsSync(CSV_EXAMPLE)) {
    fs.mkdirSync(path.dirname(CSV_PATH), { recursive: true });
    fs.copyFileSync(CSV_EXAMPLE, CSV_PATH);
    console.log("Ornek KB kopyalandi:", CSV_PATH);
  }

  if (!fs.existsSync(CSV_PATH)) {
    console.error(`CSV dosyasi bulunamadi: ${CSV_PATH}`);
    process.exit(1);
  }

  console.log("CSV okunuyor:", CSV_PATH);
  const csvText = fs.readFileSync(CSV_PATH, "utf8");
  const parsed = Papa.parse(csvText, { header: true, skipEmptyLines: true });

  if (parsed.errors.length) {
    console.warn("CSV parse uyarilari:", parsed.errors);
  }

  const rows = parsed.data.filter((r) => r.question && r.answer);
  console.log(`${rows.length} soru-cevap cifti bulundu.`);

  if (!rows.length) {
    console.error("Islenecek satir yok.");
    process.exit(1);
  }

  // Embedding uret
  const records = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    process.stdout.write(`  Embedding ${i + 1}/${rows.length}: ${row.question.slice(0, 50)}...`);

    const vector = await embedWithRetry(row.question, i + 1);
    records.push({
      id: i + 1,
      question: row.question,
      answer: row.answer,
      vector
    });

    console.log(" OK");

    if (i < rows.length - 1) {
      await sleep(EMBED_DELAY_MS);
    }
  }

  // LanceDB'ye yaz
  console.log("\nLanceDB'ye yaziliyor:", LANCE_DB_PATH);
  fs.mkdirSync(LANCE_DB_PATH, { recursive: true });

  const db = await lancedb.connect(LANCE_DB_PATH);

  // Mevcut tabloyu sil (varsa)
  try {
    await db.dropTable(TABLE_NAME);
    console.log(`Mevcut '${TABLE_NAME}' tablosu silindi.`);
  } catch (_e) {
    // Tablo yoksa hata yok
  }

  const table = await db.createTable(TABLE_NAME, records);
  const count = await table.countRows();
  console.log(`\n'${TABLE_NAME}' tablosu olusturuldu: ${count} kayit.`);
  console.log("Ingestion tamamlandi.");
}

main().catch((err) => {
  console.error("Ingestion hatasi:", err);
  process.exit(1);
});

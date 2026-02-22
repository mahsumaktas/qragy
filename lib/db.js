/**
 * lib/db.js — SQLite persistence layer for Qragy
 *
 * Replaces JSON file storage for:
 *   - tickets       (TICKETS_DB_FILE)
 *   - conversations (CONVERSATIONS_FILE)
 *   - analytics     (ANALYTICS_FILE)
 *
 * API is intentionally identical to the old JSON-file functions so
 * server.js call-sites require no changes.
 *
 * Uses better-sqlite3 (synchronous, C-native, WAL mode).
 * Node.js is single-threaded, so sync API is safe and faster than JSON.
 */

"use strict";

const BetterSQLite = require("better-sqlite3");
const path = require("path");
const fs = require("fs");

const DATA_DIR = path.join(__dirname, "..", "data");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const DB_PATH = path.join(DATA_DIR, "qragy.db");
const db = new BetterSQLite(DB_PATH);

// WAL mode: concurrent reads while writing, much faster than default journal
db.pragma("journal_mode = WAL");
db.pragma("synchronous = NORMAL"); // safe + fast with WAL

// ── Schema ───────────────────────────────────────────────────────────────

db.exec(`
  CREATE TABLE IF NOT EXISTS tickets (
    id            TEXT PRIMARY KEY,
    status        TEXT NOT NULL DEFAULT '',
    branchCode    TEXT NOT NULL DEFAULT '',
    issueSummary  TEXT NOT NULL DEFAULT '',
    companyName   TEXT NOT NULL DEFAULT '',
    fullName      TEXT NOT NULL DEFAULT '',
    phone         TEXT NOT NULL DEFAULT '',
    source        TEXT NOT NULL DEFAULT '',
    model         TEXT NOT NULL DEFAULT '',
    sentiment     TEXT NOT NULL DEFAULT 'neutral',
    qualityScore  REAL,
    firstResponseAt TEXT,
    resolvedAt    TEXT,
    handoffAttempts INTEGER NOT NULL DEFAULT 0,
    lastHandoffAt TEXT NOT NULL DEFAULT '',
    createdAt     TEXT NOT NULL DEFAULT '',
    updatedAt     TEXT NOT NULL DEFAULT '',
    supportSnapshot TEXT NOT NULL DEFAULT '{}',
    chatHistory   TEXT NOT NULL DEFAULT '[]',
    events        TEXT NOT NULL DEFAULT '[]'
  );

  CREATE TABLE IF NOT EXISTS conversations (
    sessionId     TEXT PRIMARY KEY,
    status        TEXT NOT NULL DEFAULT 'active',
    source        TEXT NOT NULL DEFAULT 'web',
    ip            TEXT NOT NULL DEFAULT '',
    createdAt     TEXT NOT NULL DEFAULT '',
    updatedAt     TEXT NOT NULL DEFAULT '',
    messageCount  INTEGER NOT NULL DEFAULT 0,
    lastUserMessage TEXT NOT NULL DEFAULT '',
    ticketId      TEXT NOT NULL DEFAULT '',
    memory        TEXT NOT NULL DEFAULT '{}',
    chatHistory   TEXT NOT NULL DEFAULT '[]'
  );

  CREATE TABLE IF NOT EXISTS analytics (
    date  TEXT PRIMARY KEY,
    data  TEXT NOT NULL DEFAULT '{}'
  );

  CREATE TABLE IF NOT EXISTS user_memory (
    userId    TEXT NOT NULL,
    key       TEXT NOT NULL,
    value     TEXT NOT NULL,
    updatedAt TEXT NOT NULL,
    PRIMARY KEY (userId, key)
  );

  CREATE TABLE IF NOT EXISTS recall_memory (
    id        TEXT PRIMARY KEY,
    userId    TEXT NOT NULL,
    sessionId TEXT NOT NULL DEFAULT '',
    type      TEXT NOT NULL DEFAULT 'summary',
    content   TEXT NOT NULL,
    createdAt TEXT NOT NULL
  );

  CREATE VIRTUAL TABLE IF NOT EXISTS recall_memory_fts USING fts5(
    content,
    content=recall_memory,
    content_rowid=rowid,
    tokenize='unicode61'
  );

  CREATE TABLE IF NOT EXISTS kg_entities (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    name           TEXT NOT NULL,
    type           TEXT NOT NULL,
    attributes     TEXT NOT NULL DEFAULT '{}',
    createdAt      TEXT NOT NULL,
    UNIQUE(name, type)
  );

  CREATE TABLE IF NOT EXISTS kg_edges (
    sourceId   INTEGER NOT NULL REFERENCES kg_entities(id),
    targetId   INTEGER NOT NULL REFERENCES kg_entities(id),
    relation   TEXT NOT NULL,
    weight     REAL NOT NULL DEFAULT 1.0,
    metadata   TEXT NOT NULL DEFAULT '{}',
    createdAt  TEXT NOT NULL,
    PRIMARY KEY (sourceId, targetId, relation)
  );

  CREATE TABLE IF NOT EXISTS reflexion_logs (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    sessionId     TEXT NOT NULL DEFAULT '',
    topic         TEXT NOT NULL DEFAULT '',
    errorType     TEXT NOT NULL DEFAULT '',
    originalQuery TEXT NOT NULL DEFAULT '',
    wrongAnswer   TEXT NOT NULL DEFAULT '',
    analysis      TEXT NOT NULL DEFAULT '',
    correctInfo   TEXT NOT NULL DEFAULT '',
    createdAt     TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS quality_scores (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    sessionId     TEXT NOT NULL DEFAULT '',
    messageId     TEXT NOT NULL DEFAULT '',
    faithfulness  REAL,
    relevancy     REAL,
    confidence    REAL,
    ragResultCount INTEGER NOT NULL DEFAULT 0,
    avgRerankScore REAL,
    createdAt     TEXT NOT NULL
  );
`);

// ── Migration: JSON → SQLite (runs once on first boot) ──────────────────

function migrateJsonFile(filePath, migratorFn) {
  if (!fs.existsSync(filePath)) return;
  const backupPath = filePath + ".bak";
  if (fs.existsSync(backupPath)) return; // already migrated
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    const data = JSON.parse(raw);
    migratorFn(data);
    fs.renameSync(filePath, backupPath);
    console.log(`[db] Migrated ${path.basename(filePath)} → SQLite`);
  } catch (err) {
    console.warn(`[db] Migration skipped for ${path.basename(filePath)}:`, err.message);
  }
}

// Tickets migration
const TICKETS_JSON = path.join(DATA_DIR, "tickets.json");
migrateJsonFile(TICKETS_JSON, (data) => {
  const tickets = Array.isArray(data?.tickets) ? data.tickets : [];
  const upsert = db.prepare(`INSERT OR IGNORE INTO tickets
    (id, status, branchCode, issueSummary, companyName, fullName, phone,
     source, model, sentiment, qualityScore, firstResponseAt, resolvedAt,
     handoffAttempts, lastHandoffAt, createdAt, updatedAt,
     supportSnapshot, chatHistory, events)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  const insertAll = db.transaction((rows) => { for (const t of rows) upsert.run(..._ticketRow(t)); });
  insertAll(tickets);
});

// Conversations migration
const CONVERSATIONS_JSON = path.join(DATA_DIR, "conversations.json");
migrateJsonFile(CONVERSATIONS_JSON, (data) => {
  const convs = Array.isArray(data?.conversations) ? data.conversations : [];
  const upsert = db.prepare(`INSERT OR IGNORE INTO conversations
    (sessionId, status, source, ip, createdAt, updatedAt, messageCount,
     lastUserMessage, ticketId, memory, chatHistory)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`);
  const insertAll = db.transaction((rows) => { for (const c of rows) upsert.run(..._convRow(c)); });
  insertAll(convs);
});

// Analytics migration
const ANALYTICS_JSON = path.join(DATA_DIR, "analytics.json");
migrateJsonFile(ANALYTICS_JSON, (data) => {
  const daily = data?.daily || {};
  const upsert = db.prepare("INSERT OR IGNORE INTO analytics (date, data) VALUES (?, ?)");
  const insertAll = db.transaction((entries) => {
    for (const [date, dayData] of entries) upsert.run(date, JSON.stringify(dayData));
  });
  insertAll(Object.entries(daily));
});

// ── Helpers ──────────────────────────────────────────────────────────────

function _ticketRow(t) {
  return [
    t.id || "",
    t.status || "",
    t.branchCode || "",
    t.issueSummary || "",
    t.companyName || "",
    t.fullName || "",
    t.phone || "",
    t.source || "",
    t.model || "",
    t.sentiment || "neutral",
    t.qualityScore ?? null,
    t.firstResponseAt || null,
    t.resolvedAt || null,
    t.handoffAttempts ?? 0,
    t.lastHandoffAt || "",
    t.createdAt || "",
    t.updatedAt || "",
    JSON.stringify(t.supportSnapshot || {}),
    JSON.stringify(t.chatHistory || []),
    JSON.stringify(t.events || []),
  ];
}

function _rowToTicket(row) {
  return {
    id: row.id,
    status: row.status,
    branchCode: row.branchCode,
    issueSummary: row.issueSummary,
    companyName: row.companyName,
    fullName: row.fullName,
    phone: row.phone,
    source: row.source,
    model: row.model,
    sentiment: row.sentiment,
    qualityScore: row.qualityScore,
    firstResponseAt: row.firstResponseAt,
    resolvedAt: row.resolvedAt,
    handoffAttempts: row.handoffAttempts,
    lastHandoffAt: row.lastHandoffAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    supportSnapshot: _parseJson(row.supportSnapshot, {}),
    chatHistory: _parseJson(row.chatHistory, []),
    events: _parseJson(row.events, []),
  };
}

function _convRow(c) {
  return [
    c.sessionId || "",
    c.status || "active",
    c.source || "web",
    c.ip || "",
    c.createdAt || "",
    c.updatedAt || "",
    c.messageCount ?? 0,
    c.lastUserMessage || "",
    c.ticketId || "",
    JSON.stringify(c.memory || {}),
    JSON.stringify(c.chatHistory || []),
  ];
}

function _rowToConv(row) {
  return {
    sessionId: row.sessionId,
    status: row.status,
    source: row.source,
    ip: row.ip,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    messageCount: row.messageCount,
    lastUserMessage: row.lastUserMessage,
    ticketId: row.ticketId,
    memory: _parseJson(row.memory, {}),
    chatHistory: _parseJson(row.chatHistory, []),
  };
}

function _parseJson(str, fallback) {
  try { return JSON.parse(str); } catch { return fallback; }
}

// ── Prepared statements ──────────────────────────────────────────────────

const stmts = {
  ticketUpsert: db.prepare(`INSERT OR REPLACE INTO tickets
    (id, status, branchCode, issueSummary, companyName, fullName, phone,
     source, model, sentiment, qualityScore, firstResponseAt, resolvedAt,
     handoffAttempts, lastHandoffAt, createdAt, updatedAt,
     supportSnapshot, chatHistory, events)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`),

  ticketSelectAll: db.prepare("SELECT * FROM tickets ORDER BY createdAt ASC"),

  ticketDeleteNotIn: (ids) => {
    if (!ids.length) {
      return db.prepare("DELETE FROM tickets").run();
    }
    const placeholders = ids.map(() => "?").join(",");
    return db.prepare(`DELETE FROM tickets WHERE id NOT IN (${placeholders})`).run(...ids);
  },

  convUpsert: db.prepare(`INSERT OR REPLACE INTO conversations
    (sessionId, status, source, ip, createdAt, updatedAt, messageCount,
     lastUserMessage, ticketId, memory, chatHistory)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`),

  convSelectAll: db.prepare("SELECT * FROM conversations ORDER BY createdAt ASC"),

  convDeleteNotIn: (ids) => {
    if (!ids.length) {
      return db.prepare("DELETE FROM conversations").run();
    }
    const placeholders = ids.map(() => "?").join(",");
    return db.prepare(`DELETE FROM conversations WHERE sessionId NOT IN (${placeholders})`).run(...ids);
  },

  analyticsUpsert: db.prepare("INSERT OR REPLACE INTO analytics (date, data) VALUES (?, ?)"),
  analyticsSelectAll: db.prepare("SELECT date, data FROM analytics"),
  analyticsDeleteOlderThan: db.prepare("DELETE FROM analytics WHERE date < ?"),

  // Recall Memory
  recallInsert: db.prepare(
    `INSERT INTO recall_memory (id, userId, sessionId, type, content, createdAt)
     VALUES (?, ?, ?, ?, ?, ?)`
  ),
  recallFtsInsert: db.prepare(
    `INSERT INTO recall_memory_fts (rowid, content)
     VALUES ((SELECT rowid FROM recall_memory WHERE id = ?), ?)`
  ),
  recallFtsSearch: db.prepare(
    `SELECT rm.* FROM recall_memory rm
     JOIN recall_memory_fts fts ON fts.rowid = rm.rowid
     WHERE fts.content MATCH ? AND rm.userId = ?
     ORDER BY rank
     LIMIT ?`
  ),

  // KG Entities
  entityUpsert: db.prepare(
    `INSERT INTO kg_entities (name, type, attributes, createdAt)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(name, type) DO UPDATE SET attributes = excluded.attributes`
  ),
  entitySelect: db.prepare(
    "SELECT * FROM kg_entities WHERE name = ? AND type = ?"
  ),

  // KG Edges
  edgeUpsert: db.prepare(
    `INSERT OR REPLACE INTO kg_edges (sourceId, targetId, relation, weight, metadata, createdAt)
     VALUES (?, ?, ?, ?, ?, ?)`
  ),
  edgesByEntity: db.prepare(
    `SELECT e.*, src.name AS sourceName, tgt.name AS targetName
     FROM kg_edges e
     JOIN kg_entities src ON src.id = e.sourceId
     JOIN kg_entities tgt ON tgt.id = e.targetId
     WHERE src.name = ? OR tgt.name = ?
     ORDER BY e.weight DESC
     LIMIT ?`
  ),

  // Reflexion Logs
  reflexionInsert: db.prepare(
    `INSERT INTO reflexion_logs
     (sessionId, topic, errorType, originalQuery, wrongAnswer, analysis, correctInfo, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ),
  reflexionByTopic: db.prepare(
    `SELECT * FROM reflexion_logs WHERE topic LIKE '%' || ? || '%'
     ORDER BY createdAt DESC LIMIT ?`
  ),

  // Quality Scores
  qualityInsert: db.prepare(
    `INSERT INTO quality_scores
     (sessionId, messageId, faithfulness, relevancy, confidence, ragResultCount, avgRerankScore, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ),

  // User Memory (for coreMemory service)
  userMemorySelectAll: db.prepare(
    "SELECT key, value FROM user_memory WHERE userId = ? ORDER BY updatedAt DESC"
  ),
  userMemoryUpsert: db.prepare(
    `INSERT INTO user_memory (userId, key, value, updatedAt)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(userId, key) DO UPDATE SET value = excluded.value, updatedAt = excluded.updatedAt`
  ),
};

// ── Public API: Tickets ──────────────────────────────────────────────────

/**
 * Load all tickets. Returns { tickets: [...] } — identical to old JSON API.
 */
function loadTicketsDb() {
  try {
    const rows = stmts.ticketSelectAll.all();
    return { tickets: rows.map(_rowToTicket) };
  } catch (err) {
    console.error("[db] loadTicketsDb error:", err.message);
    return { tickets: [] };
  }
}

/**
 * Save all tickets. Accepts { tickets: [...] } — identical to old JSON API.
 * Uses a transaction: upserts all current tickets, removes deleted ones.
 */
const _saveTickets = db.transaction((tickets) => {
  const ids = tickets.map((t) => t.id).filter(Boolean);
  stmts.ticketDeleteNotIn(ids);
  for (const t of tickets) {
    stmts.ticketUpsert.run(..._ticketRow(t));
  }
});

function saveTicketsDb(data) {
  try {
    const tickets = Array.isArray(data?.tickets) ? data.tickets : [];
    _saveTickets(tickets);
  } catch (err) {
    console.error("[db] saveTicketsDb error:", err.message);
  }
}

// ── Public API: Conversations ─────────────────────────────────────────────

function loadConversations() {
  try {
    const rows = stmts.convSelectAll.all();
    return { conversations: rows.map(_rowToConv) };
  } catch (err) {
    console.error("[db] loadConversations error:", err.message);
    return { conversations: [] };
  }
}

const _saveConvs = db.transaction((conversations) => {
  const ids = conversations.map((c) => c.sessionId).filter(Boolean);
  stmts.convDeleteNotIn(ids);
  for (const c of conversations) {
    stmts.convUpsert.run(..._convRow(c));
  }
});

function saveConversations(data) {
  try {
    const conversations = Array.isArray(data?.conversations) ? data.conversations : [];
    _saveConvs(conversations);
  } catch (err) {
    console.error("[db] saveConversations error:", err.message);
  }
}

// ── Public API: Analytics ────────────────────────────────────────────────

function loadAnalyticsData() {
  try {
    const rows = stmts.analyticsSelectAll.all();
    const daily = {};
    for (const row of rows) {
      daily[row.date] = _parseJson(row.data, {});
    }
    return { daily };
  } catch (err) {
    console.error("[db] loadAnalyticsData error:", err.message);
    return { daily: {} };
  }
}

const _saveAnalytics = db.transaction((daily) => {
  // Prune > 90 days
  const cutoff = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);
  stmts.analyticsDeleteOlderThan.run(cutoff);
  for (const [date, data] of Object.entries(daily)) {
    stmts.analyticsUpsert.run(date, JSON.stringify(data));
  }
});

function saveAnalyticsData(analyticsData) {
  try {
    _saveAnalytics(analyticsData?.daily || {});
  } catch (err) {
    console.error("[db] saveAnalyticsData error:", err.message);
  }
}

// ── Backup ───────────────────────────────────────────────────────────────

const BACKUP_DIR = path.join(DATA_DIR, "backups");
const MAX_BACKUPS = 3;

function backupDatabase() {
  try {
    if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });

    // WAL checkpoint before backup
    db.pragma("wal_checkpoint(TRUNCATE)");

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backupPath = path.join(BACKUP_DIR, `qragy-${timestamp}.db`);

    // Use better-sqlite3 backup API if available, otherwise fs copy
    if (typeof db.backup === "function") {
      db.backup(backupPath);
    } else {
      fs.copyFileSync(DB_PATH, backupPath);
    }

    // Cleanup old backups (keep max 3)
    const backups = fs.readdirSync(BACKUP_DIR)
      .filter((f) => f.startsWith("qragy-") && f.endsWith(".db"))
      .sort();
    while (backups.length > MAX_BACKUPS) {
      const oldest = backups.shift();
      fs.unlinkSync(path.join(BACKUP_DIR, oldest));
    }

    console.log(`[db] Backup olusturuldu: ${path.basename(backupPath)}`);
    return backupPath;
  } catch (err) {
    console.error("[db] Backup hatasi:", err.message);
    return null;
  }
}

// ── Public API: Recall Memory ─────────────────────────────────────────────

function saveRecallMemory(id, userId, sessionId, type, content) {
  const now = new Date().toISOString();
  stmts.recallInsert.run(id, userId, sessionId || "", type || "summary", content, now);
  stmts.recallFtsInsert.run(id, content);
}

function searchRecallMemory(query, userId, limit = 5) {
  return stmts.recallFtsSearch.all(query, userId, limit);
}

// ── Public API: Knowledge Graph ───────────────────────────────────────────

function upsertEntity(name, type, attributes = {}) {
  const now = new Date().toISOString();
  stmts.entityUpsert.run(name, type, JSON.stringify(attributes), now);
  return stmts.entitySelect.get(name, type);
}

function getEntity(name, type) {
  const row = stmts.entitySelect.get(name, type);
  if (!row) return null;
  row.attributes = _parseJson(row.attributes, {});
  return row;
}

function insertEdge(sourceId, targetId, relation, weight = 1.0, metadata = {}) {
  const now = new Date().toISOString();
  stmts.edgeUpsert.run(sourceId, targetId, relation, weight, JSON.stringify(metadata), now);
}

function queryEdgesByEntity(entityName, limit = 10) {
  return stmts.edgesByEntity.all(entityName, entityName, limit);
}

// ── Public API: Reflexion Logs ────────────────────────────────────────────

function saveReflexionLog(data) {
  const now = new Date().toISOString();
  stmts.reflexionInsert.run(
    data.sessionId || "",
    data.topic || "",
    data.errorType || "",
    data.originalQuery || "",
    data.wrongAnswer || "",
    data.analysis || "",
    data.correctInfo || "",
    now
  );
}

function searchReflexionByTopic(topic, limit = 3) {
  return stmts.reflexionByTopic.all(topic, limit);
}

// ── Public API: Quality Scores ────────────────────────────────────────────

function saveQualityScore(data) {
  const now = new Date().toISOString();
  stmts.qualityInsert.run(
    data.sessionId || "",
    data.messageId || "",
    data.faithfulness ?? null,
    data.relevancy ?? null,
    data.confidence ?? null,
    data.ragResultCount ?? 0,
    data.avgRerankScore ?? null,
    now
  );
}

// ── Public API: User Memory (for coreMemory service) ─────────────────────

function getUserMemory(userId) {
  try {
    const rows = stmts.userMemorySelectAll.all(userId);
    const result = {};
    for (const row of rows) result[row.key] = row.value;
    return result;
  } catch (err) {
    console.error("[db] getUserMemory error:", err.message);
    return {};
  }
}

function saveUserMemory(userId, key, value) {
  try {
    stmts.userMemoryUpsert.run(userId, key, String(value), new Date().toISOString());
  } catch (err) {
    console.error("[db] saveUserMemory error:", err.message);
  }
}

// ── Close ────────────────────────────────────────────────────────────────

function closeDb() {
  try {
    db.close();
    console.log("[db] SQLite baglantisi kapatildi.");
  } catch (err) {
    console.error("[db] Close hatasi:", err.message);
  }
}

// ── Exports ──────────────────────────────────────────────────────────────

module.exports = {
  db,
  loadTicketsDb,
  saveTicketsDb,
  loadConversations,
  saveConversations,
  loadAnalyticsData,
  saveAnalyticsData,
  backupDatabase,
  closeDb,
  // Recall Memory
  saveRecallMemory,
  searchRecallMemory,
  // Knowledge Graph
  upsertEntity,
  getEntity,
  insertEdge,
  queryEdgesByEntity,
  // Reflexion
  saveReflexionLog,
  searchReflexionByTopic,
  // Quality Scores
  saveQualityScore,
  // User Memory (for coreMemory)
  getUserMemory,
  saveUserMemory,
};

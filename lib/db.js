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
};

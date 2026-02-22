"use strict";

/**
 * User Memory Service
 *
 * Persistent per-user memory across sessions.
 * Stores key-value pairs per userId (e.g. name, branch, past issues).
 */

const MAX_KEYS_PER_USER = 20;
const MAX_VALUE_LENGTH = 1000;

function createUserMemory(deps) {
  const { sqliteDb, logger } = deps;

  function save(userId, key, value) {
    if (!userId || !key) return;
    const sanitizedValue = String(value).slice(0, MAX_VALUE_LENGTH);
    // Guard against injection in key names
    const sanitizedKey = String(key).replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 50);
    if (!sanitizedKey) return;

    try {
      const db = sqliteDb.getDb();
      const stmt = db.prepare(
        `INSERT INTO user_memory (userId, key, value, updatedAt)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(userId, key) DO UPDATE SET value = excluded.value, updatedAt = excluded.updatedAt`
      );
      stmt.run(userId, sanitizedKey, sanitizedValue, new Date().toISOString());
    } catch (err) {
      logger.warn("userMemory", "save failed", err);
    }
  }

  function get(userId, key) {
    if (!userId || !key) return null;
    try {
      const db = sqliteDb.getDb();
      const row = db.prepare("SELECT value FROM user_memory WHERE userId = ? AND key = ?").get(userId, key);
      return row ? row.value : null;
    } catch (err) {
      logger.warn("userMemory", "get failed", err);
      return null;
    }
  }

  function getAll(userId) {
    if (!userId) return {};
    try {
      const db = sqliteDb.getDb();
      const rows = db.prepare("SELECT key, value FROM user_memory WHERE userId = ? ORDER BY updatedAt DESC LIMIT ?").all(userId, MAX_KEYS_PER_USER);
      const result = {};
      for (const row of rows) {
        result[row.key] = row.value;
      }
      return result;
    } catch (err) {
      logger.warn("userMemory", "getAll failed", err);
      return {};
    }
  }

  function remove(userId, key) {
    if (!userId || !key) return;
    try {
      const db = sqliteDb.getDb();
      db.prepare("DELETE FROM user_memory WHERE userId = ? AND key = ?").run(userId, key);
    } catch (err) {
      logger.warn("userMemory", "remove failed", err);
    }
  }

  function prune(userId) {
    if (!userId) return;
    try {
      const db = sqliteDb.getDb();
      // Keep only the most recent MAX_KEYS_PER_USER entries
      db.prepare(
        `DELETE FROM user_memory WHERE userId = ? AND rowid NOT IN (
          SELECT rowid FROM user_memory WHERE userId = ? ORDER BY updatedAt DESC LIMIT ?
        )`
      ).run(userId, userId, MAX_KEYS_PER_USER);
    } catch (err) {
      logger.warn("userMemory", "prune failed", err);
    }
  }

  return { save, get, getAll, remove, prune, MAX_KEYS_PER_USER, MAX_VALUE_LENGTH };
}

module.exports = { createUserMemory };

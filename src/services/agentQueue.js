"use strict";

/**
 * Agent Queue Service
 *
 * Manages the handoff queue for human agents.
 * State machine: bot_active -> handoff_pending -> agent_active -> bot_active
 */

const QUEUE_STATUS = {
  HANDOFF_PENDING: "handoff_pending",
  AGENT_ACTIVE: "agent_active",
};

function createAgentQueue(deps) {
  const { sqliteDb, logger } = deps;

  // Ensure table exists
  try {
    const db = sqliteDb.getDb ? sqliteDb.getDb() : sqliteDb.db;
    db.exec(`CREATE TABLE IF NOT EXISTS agent_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sessionId TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'handoff_pending',
      assignedTo TEXT,
      customerName TEXT,
      topic TEXT,
      summary TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    )`);
  } catch (err) {
    logger.warn("agentQueue", "Table creation failed", err);
  }

  function _getDb() {
    return sqliteDb.getDb ? sqliteDb.getDb() : sqliteDb.db;
  }

  function enqueue(sessionId, metadata = {}) {
    const db = _getDb();
    const now = new Date().toISOString();
    try {
      // Check if already in queue
      const existing = db.prepare("SELECT id FROM agent_queue WHERE sessionId = ?").get(sessionId);
      if (existing) {
        db.prepare("UPDATE agent_queue SET status = ?, updatedAt = ? WHERE sessionId = ?")
          .run(QUEUE_STATUS.HANDOFF_PENDING, now, sessionId);
        return existing.id;
      }
      const result = db.prepare(
        "INSERT INTO agent_queue (sessionId, status, customerName, topic, summary, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?)"
      ).run(
        sessionId,
        QUEUE_STATUS.HANDOFF_PENDING,
        metadata.customerName || "",
        metadata.topic || "",
        metadata.summary || "",
        now,
        now
      );
      return result.lastInsertRowid;
    } catch (err) {
      logger.warn("agentQueue", "enqueue failed", err);
      return null;
    }
  }

  function listPending() {
    try {
      return _getDb().prepare(
        "SELECT * FROM agent_queue WHERE status = ? ORDER BY createdAt ASC"
      ).all(QUEUE_STATUS.HANDOFF_PENDING);
    } catch (err) {
      logger.warn("agentQueue", "listPending failed", err);
      return [];
    }
  }

  function listActive() {
    try {
      return _getDb().prepare(
        "SELECT * FROM agent_queue WHERE status = ? ORDER BY updatedAt DESC"
      ).all(QUEUE_STATUS.AGENT_ACTIVE);
    } catch (err) {
      logger.warn("agentQueue", "listActive failed", err);
      return [];
    }
  }

  function claim(id, agentName) {
    const now = new Date().toISOString();
    try {
      const result = _getDb().prepare(
        "UPDATE agent_queue SET status = ?, assignedTo = ?, updatedAt = ? WHERE id = ? AND status = ?"
      ).run(QUEUE_STATUS.AGENT_ACTIVE, agentName || "admin", now, id, QUEUE_STATUS.HANDOFF_PENDING);
      return result.changes > 0;
    } catch (err) {
      logger.warn("agentQueue", "claim failed", err);
      return false;
    }
  }

  function release(id) {
    try {
      const result = _getDb().prepare(
        "DELETE FROM agent_queue WHERE id = ?"
      ).run(id);
      return result.changes > 0;
    } catch (err) {
      logger.warn("agentQueue", "release failed", err);
      return false;
    }
  }

  function getBySessionId(sessionId) {
    try {
      return _getDb().prepare("SELECT * FROM agent_queue WHERE sessionId = ?").get(sessionId) || null;
    } catch (err) {
      logger.warn("agentQueue", "getBySessionId failed", err);
      return null;
    }
  }

  function getById(id) {
    try {
      return _getDb().prepare("SELECT * FROM agent_queue WHERE id = ?").get(id) || null;
    } catch (err) {
      logger.warn("agentQueue", "getById failed", err);
      return null;
    }
  }

  return {
    enqueue, listPending, listActive, claim, release,
    getBySessionId, getById, QUEUE_STATUS,
  };
}

module.exports = { createAgentQueue, QUEUE_STATUS };

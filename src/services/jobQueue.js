"use strict";

/**
 * Persistent Job Queue Service
 *
 * SQLite-backed polling worker for fire-and-forget tasks.
 * Pattern: createJobQueue(deps) factory — agentQueue.js ile ayni yaklasim.
 *
 * Job lifecycle: pending -> running -> completed | dead
 * Retry: exponential backoff, max 5dk
 * Crash recovery: startup'ta stale 'running' job'lar 'pending'e reset
 */

const JOB_STATUS = {
  PENDING: "pending",
  RUNNING: "running",
  COMPLETED: "completed",
  DEAD: "dead",
};

const DEFAULT_POLL_MS = 2000;
const MAX_BACKOFF_MS = 300000; // 5 dakika
const CLEANUP_INTERVAL_MS = 86400000; // 24 saat
const STOP_TIMEOUT_MS = 30000;

function createJobQueue(deps) {
  const { sqliteDb, logger } = deps;

  const handlers = new Map();
  let running = false;
  let timer = null;
  let cleanupTimer = null;
  let pollMs = DEFAULT_POLL_MS;
  let currentJobPromise = null;
  let stopRequested = false;

  // ── Table setup ──────────────────────────────────────────────────────
  try {
    const db = _getDb();
    db.exec(`CREATE TABLE IF NOT EXISTS job_queue (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      type        TEXT NOT NULL,
      payload     TEXT NOT NULL DEFAULT '{}',
      status      TEXT NOT NULL DEFAULT 'pending',
      priority    INTEGER NOT NULL DEFAULT 0,
      attempts    INTEGER NOT NULL DEFAULT 0,
      maxAttempts INTEGER NOT NULL DEFAULT 5,
      lastError   TEXT NOT NULL DEFAULT '',
      runAfter    TEXT NOT NULL DEFAULT '',
      createdAt   TEXT NOT NULL,
      updatedAt   TEXT NOT NULL,
      completedAt TEXT
    )`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_job_queue_status_runAfter ON job_queue (status, runAfter)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_job_queue_type ON job_queue (type)`);
  } catch (err) {
    logger.warn("jobQueue", "Table olusturma hatasi", err);
  }

  function _getDb() {
    return sqliteDb.getDb ? sqliteDb.getDb() : sqliteDb.db;
  }

  // ── Public API ───────────────────────────────────────────────────────

  /**
   * Job ekle.
   * @param {string} type - Handler tipi
   * @param {Object} payload - Islenecek veri
   * @param {Object} [opts] - { priority, maxAttempts, runAfter }
   * @returns {number|null} job id
   */
  function add(type, payload, opts = {}) {
    const now = new Date().toISOString();
    const priority = opts.priority ?? 0;
    const maxAttempts = opts.maxAttempts ?? 5;
    const runAfter = opts.runAfter || "";
    try {
      const result = _getDb().prepare(
        `INSERT INTO job_queue (type, payload, status, priority, maxAttempts, runAfter, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        type,
        JSON.stringify(payload),
        JOB_STATUS.PENDING,
        priority,
        maxAttempts,
        runAfter,
        now,
        now
      );
      return Number(result.lastInsertRowid);
    } catch (err) {
      logger.warn("jobQueue", "add hatasi", { type, error: err.message });
      return null;
    }
  }

  /**
   * Handler kaydet.
   * @param {string} type
   * @param {function} asyncFn - async (payload) => void
   */
  function registerHandler(type, asyncFn) {
    handlers.set(type, asyncFn);
  }

  /**
   * Worker baslat.
   * @param {Object} [opts] - { pollIntervalMs }
   */
  function start(opts = {}) {
    if (running) return;
    running = true;
    stopRequested = false;
    pollMs = opts.pollIntervalMs || DEFAULT_POLL_MS;

    // Crash recovery: stale 'running' job'lari reset et
    _resetStaleJobs();

    // Cleanup timer: 24 saatte bir completed job'lari temizle
    cleanupTimer = setInterval(_cleanupCompleted, CLEANUP_INTERVAL_MS);

    logger.info("jobQueue", `Worker baslatildi (poll: ${pollMs}ms, handlers: ${handlers.size})`);
    _tick();
  }

  /**
   * Worker durdur. In-flight job bitmesini bekle (max 30s).
   * @returns {Promise<void>}
   */
  async function stop() {
    if (!running) return;
    stopRequested = true;
    running = false;

    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    if (cleanupTimer) {
      clearInterval(cleanupTimer);
      cleanupTimer = null;
    }

    // In-flight job varsa bekle
    if (currentJobPromise) {
      const timeout = new Promise((resolve) => setTimeout(resolve, STOP_TIMEOUT_MS));
      await Promise.race([currentJobPromise, timeout]);
    }

    logger.info("jobQueue", "Worker durduruldu");
  }

  /**
   * Dead job listele.
   * @param {number} [limit=50]
   * @returns {Array}
   */
  function listDead(limit = 50) {
    try {
      const rows = _getDb().prepare(
        `SELECT * FROM job_queue WHERE status = ? ORDER BY updatedAt DESC LIMIT ?`
      ).all(JOB_STATUS.DEAD, limit);
      return rows.map(_parseRow);
    } catch (err) {
      logger.warn("jobQueue", "listDead hatasi", err);
      return [];
    }
  }

  /**
   * Dead job'u pending'e dondur.
   * @param {number} jobId
   * @returns {boolean}
   */
  function retryDead(jobId) {
    const now = new Date().toISOString();
    try {
      const result = _getDb().prepare(
        `UPDATE job_queue SET status = ?, attempts = 0, lastError = '', runAfter = '', updatedAt = ?
         WHERE id = ? AND status = ?`
      ).run(JOB_STATUS.PENDING, now, jobId, JOB_STATUS.DEAD);
      return result.changes > 0;
    } catch (err) {
      logger.warn("jobQueue", "retryDead hatasi", { jobId, error: err.message });
      return false;
    }
  }

  /**
   * Tum dead job'lari sil.
   * @returns {number} silinen sayi
   */
  function purgeDead() {
    try {
      const result = _getDb().prepare(
        `DELETE FROM job_queue WHERE status = ?`
      ).run(JOB_STATUS.DEAD);
      return result.changes;
    } catch (err) {
      logger.warn("jobQueue", "purgeDead hatasi", err);
      return 0;
    }
  }

  /**
   * Status bazli count.
   * @returns {{ pending, running, completed, dead }}
   */
  function getStats() {
    try {
      const rows = _getDb().prepare(
        `SELECT status, COUNT(*) as count FROM job_queue GROUP BY status`
      ).all();
      const stats = { pending: 0, running: 0, completed: 0, dead: 0 };
      for (const row of rows) {
        if (row.status in stats) stats[row.status] = row.count;
      }
      return stats;
    } catch (err) {
      logger.warn("jobQueue", "getStats hatasi", err);
      return { pending: 0, running: 0, completed: 0, dead: 0 };
    }
  }

  // ── Internal ─────────────────────────────────────────────────────────

  function _parseRow(row) {
    try {
      row.payload = JSON.parse(row.payload);
    } catch {
      // payload zaten string kalsin
    }
    return row;
  }

  function _resetStaleJobs() {
    try {
      const now = new Date().toISOString();
      const result = _getDb().prepare(
        `UPDATE job_queue SET status = ?, updatedAt = ? WHERE status = ?`
      ).run(JOB_STATUS.PENDING, now, JOB_STATUS.RUNNING);
      if (result.changes > 0) {
        logger.info("jobQueue", `${result.changes} stale job reset edildi (crash recovery)`);
      }
    } catch (err) {
      logger.warn("jobQueue", "stale job reset hatasi", err);
    }
  }

  function _cleanupCompleted() {
    try {
      const cutoff = new Date(Date.now() - CLEANUP_INTERVAL_MS).toISOString();
      const result = _getDb().prepare(
        `DELETE FROM job_queue WHERE status = ? AND completedAt < ?`
      ).run(JOB_STATUS.COMPLETED, cutoff);
      if (result.changes > 0) {
        logger.info("jobQueue", `${result.changes} eski completed job temizlendi`);
      }
    } catch (err) {
      logger.warn("jobQueue", "cleanup hatasi", err);
    }
  }

  function _claimNext() {
    try {
      const now = new Date().toISOString();
      const row = _getDb().prepare(
        `SELECT * FROM job_queue
         WHERE status = ? AND (runAfter = '' OR runAfter <= ?)
         ORDER BY priority DESC, id ASC
         LIMIT 1`
      ).get(JOB_STATUS.PENDING, now);

      if (!row) return null;

      _getDb().prepare(
        `UPDATE job_queue SET status = ?, updatedAt = ? WHERE id = ?`
      ).run(JOB_STATUS.RUNNING, now, row.id);

      return _parseRow(row);
    } catch (err) {
      logger.warn("jobQueue", "claimNext hatasi", err);
      return null;
    }
  }

  function _markCompleted(jobId) {
    const now = new Date().toISOString();
    try {
      _getDb().prepare(
        `UPDATE job_queue SET status = ?, completedAt = ?, updatedAt = ? WHERE id = ?`
      ).run(JOB_STATUS.COMPLETED, now, now, jobId);
    } catch (err) {
      logger.warn("jobQueue", "markCompleted hatasi", { jobId, error: err.message });
    }
  }

  function _markFailed(jobId, attempts, maxAttempts, errorMsg) {
    const now = new Date().toISOString();
    try {
      if (attempts >= maxAttempts) {
        // Dead
        _getDb().prepare(
          `UPDATE job_queue SET status = ?, attempts = ?, lastError = ?, updatedAt = ? WHERE id = ?`
        ).run(JOB_STATUS.DEAD, attempts, errorMsg, now, jobId);
      } else {
        // Retry with backoff
        const backoffMs = Math.min(1000 * Math.pow(2, attempts - 1), MAX_BACKOFF_MS);
        const runAfter = new Date(Date.now() + backoffMs).toISOString();
        _getDb().prepare(
          `UPDATE job_queue SET status = ?, attempts = ?, lastError = ?, runAfter = ?, updatedAt = ? WHERE id = ?`
        ).run(JOB_STATUS.PENDING, attempts, errorMsg, runAfter, now, jobId);
      }
    } catch (err) {
      logger.warn("jobQueue", "markFailed hatasi", { jobId, error: err.message });
    }
  }

  async function _processJob(job) {
    const handler = handlers.get(job.type);
    if (!handler) {
      logger.warn("jobQueue", `Handler bulunamadi: ${job.type}`, { jobId: job.id });
      _markFailed(job.id, job.maxAttempts, job.maxAttempts, `Handler bulunamadi: ${job.type}`);
      return;
    }

    const newAttempts = job.attempts + 1;
    try {
      await handler(job.payload);
      _markCompleted(job.id);
    } catch (err) {
      const errorMsg = String(err.message || err).slice(0, 500);
      logger.warn("jobQueue", `Job basarisiz: ${job.type}`, { jobId: job.id, attempt: newAttempts, error: errorMsg });
      _markFailed(job.id, newAttempts, job.maxAttempts, errorMsg);
    }
  }

  function _tick() {
    if (!running || stopRequested) return;

    const job = _claimNext();
    if (job) {
      currentJobPromise = _processJob(job).finally(() => {
        currentJobPromise = null;
        // Is bulundu, hemen devam et
        if (running && !stopRequested) {
          setImmediate(_tick);
        }
      });
    } else {
      // Bos kuyruk, pollMs bekle
      currentJobPromise = null;
      timer = setTimeout(_tick, pollMs);
    }
  }

  return {
    add,
    registerHandler,
    start,
    stop,
    listDead,
    retryDead,
    purgeDead,
    getStats,
  };
}

module.exports = { createJobQueue, JOB_STATUS };

// ── Analytics Service (in-memory buffer → periodic flush) ─────────────
// Extracted from server.js — factory pattern for dependency injection.

const RETENTION_DAYS = 90;
const FLUSH_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

function createEmptyDay() {
  return {
    totalChats: 0,
    aiCalls: 0,
    deterministicReplies: 0,
    totalResponseMs: 0,
    responseCount: 0,
    escalationCount: 0,
    csatSum: 0,
    csatCount: 0,
    fallbackCount: 0,
    topicCounts: {},
    sourceCounts: {},
  };
}

/**
 * @param {object} deps
 * @param {object} deps.sqliteDb          – DB adapter with loadAnalyticsData / saveAnalyticsData
 * @param {object} deps.logger            – logger instance (warn, info, …)
 * @param {Function} deps.maskPII         – PII masking helper
 * @param {object} deps.analyticsBuffer   – shared mutable array (ctx.analyticsBuffer)
 * @param {Function} deps.getAnalyticsData – () => analyticsData
 * @param {Function} deps.setAnalyticsData – (data) => void
 */
function createAnalyticsService({
  sqliteDb,
  logger,
  maskPII,
  analyticsBuffer,
  getAnalyticsData,
  setAnalyticsData,
}) {
  // ── Load ────────────────────────────────────────────────────────────
  function loadAnalyticsData() {
    try {
      const loaded = sqliteDb.loadAnalyticsData();
      const data = loaded;
      if (!data.daily) data.daily = {};
      setAnalyticsData(data);
    } catch (err) {
      logger.warn("loadAnalytics", "Error", err);
      setAnalyticsData({ daily: {} });
    }
  }

  // ── Save ────────────────────────────────────────────────────────────
  function saveAnalyticsData() {
    try {
      sqliteDb.saveAnalyticsData(getAnalyticsData());
    } catch (err) {
      logger.warn("saveAnalytics", "Error", err);
    }
  }

  // ── Record a single event into the buffer ───────────────────────────
  function recordAnalyticsEvent(event) {
    // PII masking for analytics
    const safeEvent = { ...event, timestamp: Date.now() };
    if (safeEvent.query) safeEvent.query = maskPII(safeEvent.query);
    analyticsBuffer.push(safeEvent);
  }

  // ── Flush buffer → aggregate into daily buckets ─────────────────────
  function flushAnalyticsBuffer() {
    if (!analyticsBuffer.length) return;

    const analyticsData = getAnalyticsData();
    const events = analyticsBuffer.splice(0, analyticsBuffer.length);

    for (const evt of events) {
      const dayKey = new Date(evt.timestamp).toISOString().slice(0, 10);
      if (!analyticsData.daily[dayKey]) {
        analyticsData.daily[dayKey] = createEmptyDay();
      }
      const day = analyticsData.daily[dayKey];

      day.totalChats++;
      if (evt.source === "gemini" || evt.source === "topic-guided") day.aiCalls++;
      if (evt.source === "rule-engine" || evt.source === "fallback-no-key") day.deterministicReplies++;
      if (evt.source === "escalation-trigger" || evt.source === "topic-escalation") day.escalationCount++;
      if (evt.fallbackUsed) day.fallbackCount = (day.fallbackCount || 0) + 1;
      if (evt.responseTimeMs) {
        day.totalResponseMs += evt.responseTimeMs;
        day.responseCount++;
      }
      if (evt.topicId) {
        day.topicCounts[evt.topicId] = (day.topicCounts[evt.topicId] || 0) + 1;
      }
      if (evt.source) {
        day.sourceCounts[evt.source] = (day.sourceCounts[evt.source] || 0) + 1;
      }
      // Sentiment tracking
      if (evt.sentiment) {
        if (!day.sentimentCounts) day.sentimentCounts = {};
        day.sentimentCounts[evt.sentiment] = (day.sentimentCounts[evt.sentiment] || 0) + 1;
      }
    }

    // Prune data older than RETENTION_DAYS
    const cutoff = new Date(Date.now() - RETENTION_DAYS * 86400000).toISOString().slice(0, 10);
    for (const key of Object.keys(analyticsData.daily)) {
      if (key < cutoff) delete analyticsData.daily[key];
    }

    saveAnalyticsData();
  }

  // ── CSAT rating ─────────────────────────────────────────────────────
  function recordCsatAnalytics(rating) {
    const analyticsData = getAnalyticsData();
    const dayKey = new Date().toISOString().slice(0, 10);
    if (!analyticsData.daily[dayKey]) {
      analyticsData.daily[dayKey] = createEmptyDay();
    }
    analyticsData.daily[dayKey].csatSum += rating;
    analyticsData.daily[dayKey].csatCount++;
    saveAnalyticsData();
  }

  // ── Periodic flush (returns interval handle for cleanup) ────────────
  function startPeriodicFlush() {
    return setInterval(flushAnalyticsBuffer, FLUSH_INTERVAL_MS);
  }

  return {
    loadAnalyticsData,
    saveAnalyticsData,
    recordAnalyticsEvent,
    flushAnalyticsBuffer,
    recordCsatAnalytics,
    startPeriodicFlush,
  };
}

module.exports = { createAnalyticsService };

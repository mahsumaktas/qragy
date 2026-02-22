"use strict";

/**
 * Admin Analytics Routes — dashboard, export
 */
function mount(app, deps) {
  const {
    requireAdminAccess,
    flushAnalyticsBuffer,
    getAnalyticsData,
    safeError,
    Papa,
  } = deps;

  // ── Analytics Dashboard ─────────────────────────────────────────────────
  app.get("/api/admin/analytics", requireAdminAccess, (_req, res) => {
    try {
      flushAnalyticsBuffer();
      const analyticsDataVal = getAnalyticsData();
      const range = String(_req.query.range || "7d").trim();
      const days = range === "90d" ? 90 : range === "30d" ? 30 : 7;
      const cutoff = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);

      const dailyEntries = [];
      let totalChats = 0, totalAiCalls = 0, totalDeterministic = 0;
      let totalResponseMs = 0, totalResponseCount = 0;
      let totalEscalations = 0, totalCsatSum = 0, totalCsatCount = 0, totalFallbacks = 0;
      let totalFeedbackUp = 0, totalFeedbackDown = 0;
      const topicTotals = {};
      const sentimentTotals = {};

      for (const [dayKey, day] of Object.entries(analyticsDataVal.daily || {})) {
        if (dayKey < cutoff) continue;
        dailyEntries.push({ date: dayKey, ...day, avgResponseMs: day.responseCount > 0 ? Math.round(day.totalResponseMs / day.responseCount) : 0 });
        totalChats += day.totalChats || 0;
        totalAiCalls += day.aiCalls || 0;
        totalDeterministic += day.deterministicReplies || 0;
        totalResponseMs += day.totalResponseMs || 0;
        totalResponseCount += day.responseCount || 0;
        totalEscalations += day.escalationCount || 0;
        totalFallbacks += day.fallbackCount || 0;
        totalCsatSum += day.csatSum || 0;
        totalCsatCount += day.csatCount || 0;
        totalFeedbackUp += day.feedbackUp || 0;
        totalFeedbackDown += day.feedbackDown || 0;
        for (const [tid, cnt] of Object.entries(day.topicCounts || {})) {
          topicTotals[tid] = (topicTotals[tid] || 0) + cnt;
        }
        for (const [sent, cnt] of Object.entries(day.sentimentCounts || {})) {
          sentimentTotals[sent] = (sentimentTotals[sent] || 0) + cnt;
        }
      }

      dailyEntries.sort((a, b) => a.date.localeCompare(b.date));

      const topTopics = Object.entries(topicTotals)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([topicId, count]) => ({ topicId, count }));

      return res.json({
        ok: true,
        range,
        summary: {
          totalChats,
          aiCalls: totalAiCalls,
          deterministicReplies: totalDeterministic,
          avgResponseMs: totalResponseCount > 0 ? Math.round(totalResponseMs / totalResponseCount) : 0,
          escalationCount: totalEscalations,
          escalationRate: totalChats > 0 ? Math.round((totalEscalations / totalChats) * 100) : 0,
          fallbackCount: totalFallbacks,
          csatAverage: totalCsatCount > 0 ? Math.round((totalCsatSum / totalCsatCount) * 10) / 10 : 0,
          csatCount: totalCsatCount,
          deflectionRate: totalChats > 0 ? Math.round(((totalChats - totalEscalations) / totalChats) * 100) : 0,
          feedbackUp: totalFeedbackUp,
          feedbackDown: totalFeedbackDown,
          sentimentCounts: sentimentTotals
        },
        daily: dailyEntries,
        topTopics
      });
    } catch (err) {
      return res.status(500).json({ error: safeError(err, "api") });
    }
  });

  // ── Analytics Export ────────────────────────────────────────────────────
  app.get("/api/admin/analytics/export", requireAdminAccess, (req, res) => {
    const format = String(req.query.format || "json").toLowerCase();
    const range = String(req.query.range || "30d").trim();
    const days = range === "90d" ? 90 : range === "30d" ? 30 : 7;
    const cutoff = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);

    flushAnalyticsBuffer();
    const analyticsDataVal = getAnalyticsData();
    const entries = [];
    for (const [dayKey, day] of Object.entries(analyticsDataVal.daily || {})) {
      if (dayKey < cutoff) continue;
      entries.push({ date: dayKey, ...day });
    }
    entries.sort((a, b) => a.date.localeCompare(b.date));

    if (format === "csv") {
      const csv = Papa.unparse(entries, { header: true });
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename=analytics-${new Date().toISOString().slice(0, 10)}.csv`);
      return res.send("\uFEFF" + csv);
    }

    res.setHeader("Content-Type", "application/json");
    res.setHeader("Content-Disposition", `attachment; filename=analytics-${new Date().toISOString().slice(0, 10)}.json`);
    return res.json(entries);
  });
}

module.exports = { mount };

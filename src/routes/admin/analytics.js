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
    feedbackAnalyzer,
    loadFeedback,
  } = deps;

  // ── Dashboard Stats (KPI cards) ────────────────────────────────────────
  app.get("/api/admin/dashboard-stats", requireAdminAccess, (_req, res) => {
    try {
      flushAnalyticsBuffer();
      const analyticsDataVal = getAnalyticsData();
      const now = new Date();
      const todayKey = now.toISOString().slice(0, 10);

      // This week (Monday-based)
      const dayOfWeek = now.getDay() || 7; // Sunday=7
      const weekStart = new Date(now);
      weekStart.setDate(now.getDate() - dayOfWeek + 1);
      const weekStartKey = weekStart.toISOString().slice(0, 10);

      // This month
      const monthStartKey = todayKey.slice(0, 8) + "01";

      // Previous periods for trends
      const prevWeekStart = new Date(weekStart);
      prevWeekStart.setDate(prevWeekStart.getDate() - 7);
      const prevWeekStartKey = prevWeekStart.toISOString().slice(0, 10);

      const prevMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const prevMonthStartKey = prevMonthDate.toISOString().slice(0, 10);
      const prevMonthEndDate = new Date(now.getFullYear(), now.getMonth(), 0);
      const prevMonthEndKey = prevMonthEndDate.toISOString().slice(0, 10);

      function aggregatePeriod(startKey, endKey) {
        let chats = 0, escalations = 0, csatSum = 0, csatCount = 0;
        let responseMs = 0, responseCount = 0;
        const topicCounts = {};
        for (const [dayKey, day] of Object.entries(analyticsDataVal.daily || {})) {
          if (dayKey < startKey || (endKey && dayKey > endKey)) continue;
          chats += day.totalChats || 0;
          escalations += day.escalationCount || 0;
          csatSum += day.csatSum || 0;
          csatCount += day.csatCount || 0;
          responseMs += day.totalResponseMs || 0;
          responseCount += day.responseCount || 0;
          for (const [tid, cnt] of Object.entries(day.topicCounts || {})) {
            topicCounts[tid] = (topicCounts[tid] || 0) + cnt;
          }
        }
        return {
          chats, escalations,
          csatAvg: csatCount > 0 ? Math.round((csatSum / csatCount) * 10) / 10 : null,
          avgResponseMs: responseCount > 0 ? Math.round(responseMs / responseCount) : null,
          resolutionRate: chats > 0 ? Math.round(((chats - escalations) / chats) * 100) : null,
          topTopics: Object.entries(topicCounts).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([topicId, count]) => ({ topicId, count }))
        };
      }

      const today = aggregatePeriod(todayKey, todayKey);
      const thisWeek = aggregatePeriod(weekStartKey);
      const thisMonth = aggregatePeriod(monthStartKey);
      const prevWeek = aggregatePeriod(prevWeekStartKey, weekStartKey);
      const prevMonth = aggregatePeriod(prevMonthStartKey, prevMonthEndKey);

      // Trend calculation (percentage change)
      function trend(current, previous) {
        if (!previous || previous === 0) return current > 0 ? 100 : 0;
        return Math.round(((current - previous) / previous) * 100);
      }

      res.json({
        ok: true,
        today,
        thisWeek,
        thisMonth,
        trends: {
          weeklyChats: trend(thisWeek.chats, prevWeek.chats),
          monthlyChats: trend(thisMonth.chats, prevMonth.chats),
          weeklyCsat: trend(thisWeek.csatAvg || 0, prevWeek.csatAvg || 0),
        }
      });
    } catch (err) {
      return res.status(500).json({ error: safeError(err, "api") });
    }
  });

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

  // ── Feedback Report ───────────────────────────────────────────────────
  app.get("/api/admin/feedback-report", requireAdminAccess, (req, res) => {
    try {
      const days = Number(req.query.days) || 7;
      const feedbackData = loadFeedback();
      const entries = Array.isArray(feedbackData) ? feedbackData : (feedbackData?.entries || []);
      const report = feedbackAnalyzer.analyze(entries, { days });
      res.json({ ok: true, ...report });
    } catch (err) {
      return res.status(500).json({ error: safeError(err, "api") });
    }
  });
}

module.exports = { mount };

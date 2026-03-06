"use strict";

/**
 * Feedback Analyzer Service
 *
 * Analyzes negative feedback patterns to suggest KB improvements.
 * Groups thumbs-down feedback by topic/pattern.
 */

function createFeedbackAnalyzer(deps) {
  const { logger: _logger } = deps;

  function getFeedbackSignal(entry) {
    const raw = String(entry?.type || entry?.rating || entry?.reaction || "").toLowerCase().trim();
    if (raw === "up" || raw === "positive" || raw === "thumbs_up") return "positive";
    if (raw === "down" || raw === "negative" || raw === "thumbs_down") return "negative";

    const numeric = Number(entry?.rating);
    if (Number.isFinite(numeric)) {
      if (numeric >= 4) return "positive";
      if (numeric <= 2) return "negative";
    }
    return "neutral";
  }

  /**
   * Analyze feedback data and group by patterns
   * @param {Array} feedbackEntries - Array of { sessionId, messageIndex, type, timestamp, userMessage, botResponse }
   * @param {Object} options - { days: number }
   * @returns {{ negative: Array, summary: Object }}
   */
  function analyze(feedbackEntries, options = {}) {
    if (!Array.isArray(feedbackEntries) || feedbackEntries.length === 0) {
      return {
        negative: [],
        summary: {
          total: 0,
          negative: 0,
          positive: 0,
          neutral: 0,
          negativeRate: 0,
          contextCoverage: 0,
          topIssues: [],
        },
      };
    }

    const days = options.days || 7;
    const cutoff = new Date(Date.now() - days * 86400000).toISOString();

    // Filter by time range
    const recent = feedbackEntries.filter(f => (f.timestamp || "") >= cutoff);

    const positive = recent.filter(f => getFeedbackSignal(f) === "positive");
    const negative = recent.filter(f => getFeedbackSignal(f) === "negative");
    const withContext = recent.filter((entry) => entry.userMessage || entry.botResponse);

    // Group negative feedback by similar user messages (simple keyword grouping)
    const groups = {};
    for (const entry of negative) {
      const userMsg = (entry.userMessage || "").toLowerCase().trim();
      if (!userMsg) continue;

      // Simple grouping: first 3 significant words
      const words = userMsg.split(/\s+/).filter(w => w.length > 2).slice(0, 3);
      const groupKey = words.join(" ") || "diger";

      if (!groups[groupKey]) {
        groups[groupKey] = { key: groupKey, count: 0, examples: [] };
      }
      groups[groupKey].count++;
      if (groups[groupKey].examples.length < 3) {
        groups[groupKey].examples.push({
          userMessage: entry.userMessage || "",
          botResponse: (entry.botResponse || "").slice(0, 200),
          timestamp: entry.timestamp || "",
        });
      }
    }

    const topIssues = Object.values(groups)
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return {
      negative: negative.map(f => ({
        sessionId: f.sessionId,
        messageIndex: f.messageIndex,
        rating: f.rating,
        type: getFeedbackSignal(f),
        userMessage: f.userMessage || "",
        botResponse: (f.botResponse || "").slice(0, 200),
        timestamp: f.timestamp || "",
      })),
      summary: {
        total: recent.length,
        negative: negative.length,
        positive: positive.length,
        neutral: Math.max(0, recent.length - positive.length - negative.length),
        negativeRate: recent.length > 0 ? Math.round((negative.length / recent.length) * 100) : 0,
        contextCoverage: recent.length > 0 ? Math.round((withContext.length / recent.length) * 100) : 0,
        topIssues,
      },
    };
  }

  return { analyze };
}

module.exports = { createFeedbackAnalyzer };

"use strict";

/**
 * Feedback Analyzer Service
 *
 * Analyzes negative feedback patterns to suggest KB improvements.
 * Groups thumbs-down feedback by topic/pattern.
 */

function createFeedbackAnalyzer(deps) {
  const { logger: _logger } = deps;

  /**
   * Analyze feedback data and group by patterns
   * @param {Array} feedbackEntries - Array of { sessionId, messageIndex, type, timestamp, userMessage, botResponse }
   * @param {Object} options - { days: number }
   * @returns {{ negative: Array, summary: Object }}
   */
  function analyze(feedbackEntries, options = {}) {
    if (!Array.isArray(feedbackEntries) || feedbackEntries.length === 0) {
      return { negative: [], summary: { total: 0, negative: 0, positive: 0, topIssues: [] } };
    }

    const days = options.days || 7;
    const cutoff = new Date(Date.now() - days * 86400000).toISOString();

    // Filter by time range
    const recent = feedbackEntries.filter(f => (f.timestamp || "") >= cutoff);

    const positive = recent.filter(f => f.type === "up" || f.type === "positive");
    const negative = recent.filter(f => f.type === "down" || f.type === "negative");

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
        userMessage: f.userMessage || "",
        botResponse: (f.botResponse || "").slice(0, 200),
        timestamp: f.timestamp || "",
      })),
      summary: {
        total: recent.length,
        negative: negative.length,
        positive: positive.length,
        topIssues,
      },
    };
  }

  return { analyze };
}

module.exports = { createFeedbackAnalyzer };

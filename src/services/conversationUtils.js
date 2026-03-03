"use strict";

/**
 * Conversation Utilities Service
 *
 * Sentiment analysis, quality scoring, content gap detection,
 * escalation summary generation, and context window compression.
 * Factory pattern — deps injected.
 */
function createConversationUtils(deps) {
  const {
    callLLM,
    callLLMWithFallback,
    getProviderConfig,
    normalizeForMatching,
    logger,
    fs,
    contentGapsFile,
    nowIso,
  } = deps;

  // ── Sentiment Analysis (keyword-based) ──────────────────────────────────
  const POSITIVE_WORDS = new Set(["thank you", "thanks", "great", "awesome", "wonderful", "excellent", "perfect", "satisfied", "resolved", "fixed", "helpful", "amazing", "well done", "good job", "works now", "appreciate"]);
  const NEGATIVE_WORDS = new Set(["terrible", "awful", "horrible", "disgusting", "bad", "angry", "furious", "ridiculous", "stupid", "inadequate", "incompetent", "unresolved", "still waiting", "unfortunately", "disappointed", "frustrated", "broken", "faulty", "did not work", "waste of time"]);

  function analyzeSentiment(text) {
    if (!text) return "neutral";
    const normalized = normalizeForMatching(text);
    let posScore = 0, negScore = 0;
    for (const word of POSITIVE_WORDS) { if (normalized.includes(word)) posScore++; }
    for (const word of NEGATIVE_WORDS) { if (normalized.includes(word)) negScore++; }
    if (negScore >= 2) return "angry";
    if (negScore > posScore) return "negative";
    if (posScore > negScore) return "positive";
    return "neutral";
  }

  // ── Conversation Quality Score ──────────────────────────────────────────
  function calculateQualityScore(ticket) {
    let score = 10;
    const msgCount = (ticket.chatHistory || []).length;
    if (msgCount > 15) score -= 2;
    else if (msgCount > 8) score -= 1;
    if (ticket.status === "handoff_pending" || ticket.status === "handoff_failed") score -= 1;
    if (ticket.csatRating) {
      if (ticket.csatRating >= 4) score += 1;
      else if (ticket.csatRating <= 2) score -= 2;
    }
    const sentiment = ticket.sentiment || "neutral";
    if (sentiment === "angry") score -= 2;
    else if (sentiment === "negative") score -= 1;
    else if (sentiment === "positive") score += 1;
    if (ticket.resolvedAt && ticket.createdAt) {
      const resolveMs = Date.parse(ticket.resolvedAt) - Date.parse(ticket.createdAt);
      if (resolveMs < 5 * 60 * 1000) score += 1;
      else if (resolveMs > 60 * 60 * 1000) score -= 1;
    }
    return Math.max(1, Math.min(10, score));
  }

  // ── Content Gap Detection ───────────────────────────────────────────────
  function loadContentGaps() {
    try {
      if (fs.existsSync(contentGapsFile)) return JSON.parse(fs.readFileSync(contentGapsFile, "utf8"));
    } catch (err) { logger.warn("loadContentGaps", "Error", err); }
    return { gaps: [] };
  }

  function saveContentGaps(data) {
    if (data.gaps.length > 500) data.gaps = data.gaps.slice(-500);
    fs.writeFileSync(contentGapsFile, JSON.stringify(data, null, 2), "utf8");
  }

  function recordContentGap(query) {
    const data = loadContentGaps();
    const normalized = (query || "").toLowerCase().trim().slice(0, 200);
    if (!normalized) return;
    const existing = data.gaps.find(g => g.query === normalized);
    if (existing) {
      existing.count++;
      existing.lastSeen = nowIso();
    } else {
      data.gaps.push({ query: normalized, count: 1, firstSeen: nowIso(), lastSeen: nowIso() });
    }
    saveContentGaps(data);
  }

  // ── Escalation Summary ──────────────────────────────────────────────────
  async function generateEscalationSummary(contents, memory, conversationContext) {
    const fallback = memory.issueSummary
      || conversationContext?.currentTopic
      || "Live support request";

    const providerCfg = getProviderConfig();
    if (!providerCfg.apiKey && providerCfg.provider !== "ollama") return fallback;

    const summaryPrompt = [
      "Analyze the following conversation history and write a brief issue summary for the live support agent.",
      "Rules:",
      "- Write in English, plain text, 1-2 sentences.",
      "- Summarize the user's issue, provided information (branch code, company, error message, etc.) and steps taken.",
      "- Write only the summary, nothing else."
    ].join("\n");

    try {
      const result = await callLLMWithFallback(contents, summaryPrompt, 512);
      const summary = (result.reply || "").trim();
      return summary || fallback;
    } catch (_err) {
      return fallback;
    }
  }

  // ── Context Window Compression ──────────────────────────────────────────
  async function compressConversationHistory(messages) {
    if (messages.length <= 10) return messages;
    const oldMessages = messages.slice(0, -6);
    const recentMessages = messages.slice(-6);

    const providerCfg = getProviderConfig();
    if (providerCfg.apiKey || providerCfg.provider === "ollama") {
      try {
        const chatText = oldMessages
          .map(m => `${m.role === "user" ? "User" : "Bot"}: ${(m.content || "").slice(0, 200)}`)
          .join("\n");
        const result = await callLLM(
          [{ role: "user", parts: [{ text: chatText }] }],
          "Summarize this conversation history in a single paragraph. Write in English, 2-3 sentences. Write only the summary.",
          128
        );
        const summary = (result.reply || "").trim();
        if (summary) {
          return [
            { role: "assistant", content: `[Previous conversation summary: ${summary}]` },
            ...recentMessages
          ];
        }
      } catch (err) { logger.warn("compressHistory", "Error", err); }
    }

    return [...messages.slice(0, 2), ...recentMessages];
  }

  return {
    analyzeSentiment,
    calculateQualityScore,
    loadContentGaps,
    saveContentGaps,
    recordContentGap,
    generateEscalationSummary,
    compressConversationHistory,
  };
}

module.exports = { createConversationUtils };

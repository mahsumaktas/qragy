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

  const CONTENT_GAP_ACK_PATTERNS = [
    "tesekkurler",
    "tesekkur ederim",
    "sag ol",
    "saol",
    "tamam",
    "tamamdir",
    "anladim",
    "deneyecegim",
    "cozuldu",
    "oldu",
    "harika",
    "super",
    "ok",
    "peki",
  ];
  const CONTENT_GAP_TEST_PATTERNS = [
    "asdf",
    "qwer",
    "zxcv",
    "deneme",
    "test test",
    "lorem ipsum",
    "12345",
  ];
  const CONTENT_GAP_ACTIONABLE_HINTS = [
    "hata",
    "sorun",
    "olmuyor",
    "olamiyorum",
    "yapamiyorum",
    "acilmiyor",
    "yazdiramiyorum",
    "yazici",
    "bilet",
    "yetki",
    "erisemiyorum",
    "sifre",
    "parola",
    "giris",
    "login",
    "beyaz ekran",
    "mavi ekran",
    "siyah ekran",
    "500",
    "server error",
    "bildirim",
    "spam",
    "kurulum",
    "log",
    "dokum",
    "rapor",
    "uyari",
    "iptal",
    "baglanamiyorum",
    "baglanti",
  ];
  const CONTENT_GAP_EXPAND_HINTS = [
    "giris",
    "login",
    "sifre",
    "parola",
    "yazici",
    "bilet",
    "yetki",
    "beyaz ekran",
    "mavi ekran",
    "siyah ekran",
    "bildirim",
    "rapor",
    "dokum",
    "log",
    "500",
    "kurulum",
  ];
  const CONTENT_GAP_GENERIC_FOLLOWUP_PATTERNS = [
    "olmuyor",
    "hala ayni",
    "ayni hatayi veriyor",
    "denedim ama",
    "duzelmedi",
    "yardim edin",
    "cozulemedi",
    "devam ediyor",
    "hala sorun var",
    "tekrar denedim",
  ];

  function containsAnyPattern(normalizedText, patterns) {
    return patterns.some((pattern) => normalizedText.includes(pattern));
  }

  function looksLikeGibberish(normalizedText) {
    if (!normalizedText) return true;
    const compact = normalizedText.replace(/\s+/g, "");
    if (compact.length < 4) return true;
    if (/^[a-z0-9]+$/.test(compact) && !/[aeiou]/.test(compact) && compact.length >= 6) {
      return true;
    }
    const tokens = normalizedText.split(/\s+/).filter(Boolean);
    if (!tokens.length) return true;
    const vowelLessTokens = tokens.filter((token) => !/[aeiou]/.test(token));
    return vowelLessTokens.length === tokens.length && tokens.length >= 2;
  }

  function mergeContentGapEntries(entries) {
    const grouped = new Map();

    for (const entry of entries || []) {
      const rawQuery = String(entry?.question || entry?.query || "").trim();
      const normalizedQuery = normalizeForMatching(rawQuery).slice(0, 200);
      if (!normalizedQuery) continue;

      const current = grouped.get(normalizedQuery) || {
        query: rawQuery,
        normalizedQuery,
        count: 0,
        firstSeen: entry?.firstSeen || entry?.lastSeen || "",
        lastSeen: entry?.lastSeen || entry?.firstSeen || "",
      };

      current.count += Number(entry?.count || entry?.frequency || 1);

      const entryFirstSeen = String(entry?.firstSeen || entry?.lastSeen || "");
      const entryLastSeen = String(entry?.lastSeen || entry?.firstSeen || "");
      if (!current.firstSeen || (entryFirstSeen && entryFirstSeen < current.firstSeen)) current.firstSeen = entryFirstSeen;
      if (!current.lastSeen || (entryLastSeen && entryLastSeen > current.lastSeen)) current.lastSeen = entryLastSeen;

      if (rawQuery && rawQuery.length > current.query.length) {
        current.query = rawQuery;
      }

      grouped.set(normalizedQuery, current);
    }

    return Array.from(grouped.values());
  }

  function classifyContentGapEntry(entry) {
    const rawQuery = String(entry?.question || entry?.query || "").trim();
    const normalizedQuery = normalizeForMatching(rawQuery).slice(0, 200);
    const count = Math.max(1, Number(entry?.count || entry?.frequency || 1));

    if (!normalizedQuery || normalizedQuery.length < 4) {
      return {
        actionable: false,
        reason: "too_short",
        query: rawQuery,
        normalizedQuery,
        count,
        firstSeen: entry?.firstSeen || "",
        lastSeen: entry?.lastSeen || "",
      };
    }

    const hasActionableSignal = containsAnyPattern(normalizedQuery, CONTENT_GAP_ACTIONABLE_HINTS);
    const isAcknowledgement = containsAnyPattern(normalizedQuery, CONTENT_GAP_ACK_PATTERNS);
    const isTestLike = containsAnyPattern(normalizedQuery, CONTENT_GAP_TEST_PATTERNS) || looksLikeGibberish(normalizedQuery);

    if (isTestLike && !hasActionableSignal) {
      return {
        actionable: false,
        reason: "test_or_gibberish",
        query: rawQuery,
        normalizedQuery,
        count,
        firstSeen: entry?.firstSeen || "",
        lastSeen: entry?.lastSeen || "",
      };
    }

    if (isAcknowledgement && !hasActionableSignal) {
      return {
        actionable: false,
        reason: "acknowledgement",
        query: rawQuery,
        normalizedQuery,
        count,
        firstSeen: entry?.firstSeen || "",
        lastSeen: entry?.lastSeen || "",
      };
    }

    if (containsAnyPattern(normalizedQuery, CONTENT_GAP_GENERIC_FOLLOWUP_PATTERNS)
      && !containsAnyPattern(normalizedQuery, CONTENT_GAP_EXPAND_HINTS)) {
      return {
        actionable: false,
        reason: "generic_followup",
        query: rawQuery,
        normalizedQuery,
        count,
        firstSeen: entry?.firstSeen || "",
        lastSeen: entry?.lastSeen || "",
      };
    }

    const signal = count >= 20 ? "high" : count >= 8 ? "medium" : "low";
    const suggestionKey = containsAnyPattern(normalizedQuery, CONTENT_GAP_EXPAND_HINTS)
      ? "expand_existing_coverage"
      : "create_new_coverage";

    return {
      actionable: true,
      reason: "actionable",
      query: rawQuery,
      normalizedQuery,
      count,
      signal,
      suggestionKey,
      firstSeen: entry?.firstSeen || "",
      lastSeen: entry?.lastSeen || "",
    };
  }

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

  function getContentGapReport(options = {}) {
    const limit = Math.max(1, Math.min(500, Number(options.limit) || 100));
    const data = loadContentGaps();
    const merged = mergeContentGapEntries(data.gaps || []);
    const actionable = [];
    const filtered = [];
    const filteredReasonCounts = { acknowledgement: 0, test_or_gibberish: 0, too_short: 0, generic_followup: 0 };

    for (const entry of merged) {
      const classified = classifyContentGapEntry(entry);
      if (classified.actionable) actionable.push(classified);
      else {
        filtered.push(classified);
        if (filteredReasonCounts[classified.reason] !== undefined) {
          filteredReasonCounts[classified.reason]++;
        }
      }
    }

    actionable.sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return String(b.lastSeen || "").localeCompare(String(a.lastSeen || ""));
    });
    filtered.sort((a, b) => b.count - a.count);

    const lastSeen = actionable[0]?.lastSeen || filtered[0]?.lastSeen || "";

    return {
      summary: {
        rawCount: merged.length,
        actionableCount: actionable.length,
        filteredCount: filtered.length,
        highSignalCount: actionable.filter((item) => item.signal === "high").length,
        mediumSignalCount: actionable.filter((item) => item.signal === "medium").length,
        lowSignalCount: actionable.filter((item) => item.signal === "low").length,
        lastSeen,
        filteredReasonCounts,
      },
      gaps: actionable.slice(0, limit),
      filtered: filtered.slice(0, Math.min(25, limit)),
    };
  }

  function pruneContentGaps() {
    const report = getContentGapReport({ limit: 500 });
    const pruned = report.gaps.map((entry) => ({
      query: entry.query,
      count: entry.count,
      firstSeen: entry.firstSeen || nowIso(),
      lastSeen: entry.lastSeen || nowIso(),
    }));
    saveContentGaps({ gaps: pruned });
    return {
      keptCount: pruned.length,
      removedCount: report.summary.filteredCount,
      summary: {
        ...report.summary,
        rawCount: pruned.length,
        actionableCount: pruned.length,
        filteredCount: 0,
      },
    };
  }

  function recordContentGap(query) {
    const classified = classifyContentGapEntry({ query, count: 1, firstSeen: nowIso(), lastSeen: nowIso() });
    if (!classified.actionable) return false;

    const data = loadContentGaps();
    const existing = data.gaps.find((gap) => {
      const normalizedGap = normalizeForMatching(gap.query || gap.question || "").slice(0, 200);
      return normalizedGap === classified.normalizedQuery;
    });
    if (existing) {
      existing.count++;
      existing.lastSeen = nowIso();
    } else {
      data.gaps.push({
        query: query.trim().slice(0, 200),
        count: 1,
        firstSeen: nowIso(),
        lastSeen: nowIso(),
      });
    }
    saveContentGaps(data);
    return true;
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
    getContentGapReport,
    pruneContentGaps,
    classifyContentGapEntry,
    recordContentGap,
    generateEscalationSummary,
    compressConversationHistory,
  };
}

module.exports = { createConversationUtils };

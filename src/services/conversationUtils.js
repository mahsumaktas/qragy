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
  const POSITIVE_WORDS = new Set(["tesekkurler", "tesekkur", "sagol", "sagolun", "harika", "super", "muhtesem", "guzel", "memnunum", "tatmin", "basarili", "cozuldu", "duzeldim", "halloldu", "cok iyi", "mukemmel", "elinize saglik", "sorunsuz"]);
  const NEGATIVE_WORDS = new Set(["rezalet", "skandal", "berbat", "korkunc", "igrenc", "kotu", "kizgin", "sinirli", "sacma", "aptal", "yetersiz", "beceriksiz", "cozumsuz", "hala bekliyorum", "maalesef", "hayal kirikligi", "sikayetci", "utanc", "bozuk", "arizali", "ise yaramadi", "vakit kaybettim"]);

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
      || "Canlı destek talebi";

    const providerCfg = getProviderConfig();
    if (!providerCfg.apiKey && providerCfg.provider !== "ollama") return fallback;

    const summaryPrompt = [
      "Aşağıdaki konuşma geçmişini analiz et ve canlı destek temsilcisi için kısa bir sorun özeti yaz.",
      "Kurallar:",
      "- Türkçe yaz, düz metin, 1-2 cümle.",
      "- Kullanıcının sorununu, ilettiği bilgileri (şube kodu, firma, hata mesajı vb.) ve yapılan adımları özetle.",
      "- Sadece özeti yaz, başka bir şey yazma."
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
          .map(m => `${m.role === "user" ? "Kullanici" : "Bot"}: ${(m.content || "").slice(0, 200)}`)
          .join("\n");
        const result = await callLLM(
          [{ role: "user", parts: [{ text: chatText }] }],
          "Bu konusma gecmisini tek paragrafta ozetle. Turkce yaz, 2-3 cumle. Sadece ozeti yaz.",
          128
        );
        const summary = (result.reply || "").trim();
        if (summary) {
          return [
            { role: "assistant", content: `[Önceki konuşma özeti: ${summary}]` },
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

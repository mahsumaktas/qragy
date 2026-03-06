"use strict";

const { adminError } = require("../../utils/adminLocale");

/**
 * Admin Insights Routes — SLA tracking, auto-FAQ generation, content gaps, feedback
 */
function mount(app, deps) {
  const {
    requireAdminAccess,
    fs,
    path,
    loadTicketsDb,
    nowIso,
    loadCSVData,
    saveCSVData,
    reingestKnowledgeBase,
    loadContentGaps,
    getContentGapReport,
    pruneContentGaps,
    handleContentGap,
    loadFeedback,
    callLLM,
    getProviderConfig,
    recordAuditEvent,
    DATA_DIR,
    SLA_FIRST_RESPONSE_MIN,
    SLA_RESOLUTION_MIN,
    logger,
  } = deps;

  // ── SLA helpers ─────────────────────────────────────────────────────────
  function checkSLABreach(ticket) {
    const now = Date.now();
    const created = Date.parse(ticket.createdAt || "");
    if (!Number.isFinite(created)) return { firstResponse: false, resolution: false };

    const firstResponseBreach = !ticket.firstResponseAt && (now - created) > SLA_FIRST_RESPONSE_MIN * 60000;
    const resolutionBreach = !ticket.resolvedAt && (now - created) > SLA_RESOLUTION_MIN * 60000;

    return { firstResponse: firstResponseBreach, resolution: resolutionBreach };
  }

  // ── Suggested FAQs helpers ──────────────────────────────────────────────
  const SUGGESTED_FAQS_FILE = path.join(DATA_DIR, "suggested-faqs.json");

  function loadSuggestedFAQs() {
    try {
      if (fs.existsSync(SUGGESTED_FAQS_FILE)) return JSON.parse(fs.readFileSync(SUGGESTED_FAQS_FILE, "utf8"));
    } catch (err) { logger.warn("loadSuggestedFAQs", "Error", err); }
    return { faqs: [] };
  }

  function saveSuggestedFAQs(data) {
    if (data.faqs.length > 200) data.faqs = data.faqs.slice(-200);
    fs.writeFileSync(SUGGESTED_FAQS_FILE, JSON.stringify(data, null, 2), "utf8");
  }

  function getSuggestedFaqStats(data, ticketsDb) {
    const faqs = Array.isArray(data?.faqs) ? data.faqs : [];
    const eligibleResolved = (ticketsDb?.tickets || [])
      .filter((ticket) => ticket.status === "handoff_success" && Array.isArray(ticket.chatHistory) && ticket.chatHistory.length >= 3);

    const latestCreatedAt = faqs
      .map((faq) => String(faq.createdAt || ""))
      .filter(Boolean)
      .sort()
      .slice(-1)[0] || "";

    return {
      pending: faqs.filter((faq) => faq.status === "pending" || !faq.status).length,
      approved: faqs.filter((faq) => faq.status === "approved").length,
      rejected: faqs.filter((faq) => faq.status === "rejected").length,
      eligibleResolvedCount: eligibleResolved.length,
      latestCreatedAt,
    };
  }

  // ── SLA Tracking ────────────────────────────────────────────────────────
  app.get("/api/admin/sla", requireAdminAccess, (_req, res) => {
    const db = loadTicketsDb();
    const activeTickets = db.tickets.filter(t => !t.resolvedAt);
    let firstResponseBreaches = 0, resolutionBreaches = 0;
    const breachedTickets = [];

    for (const ticket of activeTickets) {
      const breach = checkSLABreach(ticket);
      if (breach.firstResponse) firstResponseBreaches++;
      if (breach.resolution) resolutionBreaches++;
      if (breach.firstResponse || breach.resolution) {
        breachedTickets.push({
          id: ticket.id, branchCode: ticket.branchCode, issueSummary: (ticket.issueSummary || "").slice(0, 100),
          createdAt: ticket.createdAt, firstResponseBreach: breach.firstResponse, resolutionBreach: breach.resolution
        });
      }
    }

    const resolvedTickets = db.tickets.filter(t => t.resolvedAt && t.createdAt);
    let totalResolutionMs = 0;
    for (const t of resolvedTickets) {
      totalResolutionMs += Date.parse(t.resolvedAt) - Date.parse(t.createdAt);
    }
    const avgResolutionMs = resolvedTickets.length ? Math.round(totalResolutionMs / resolvedTickets.length) : 0;
    const slaComplianceRate = activeTickets.length > 0
      ? Math.round(((activeTickets.length - breachedTickets.length) / activeTickets.length) * 100)
      : 100;

    return res.json({
      ok: true,
      config: { firstResponseMin: SLA_FIRST_RESPONSE_MIN, resolutionMin: SLA_RESOLUTION_MIN },
      summary: { activeTickets: activeTickets.length, firstResponseBreaches, resolutionBreaches, slaComplianceRate, avgResolutionMin: Math.round(avgResolutionMs / 60000) },
      breachedTickets: breachedTickets.slice(0, 50)
    });
  });

  // ── Auto-FAQ: Generate ──────────────────────────────────────────────────
  app.post("/api/admin/auto-faq/generate", requireAdminAccess, async (_req, res) => {
    const providerCfg = getProviderConfig();
    if (!providerCfg.apiKey && providerCfg.provider !== "ollama") {
      return res.status(400).json({ error: "LLM API key is required." });
    }

    const db = loadTicketsDb();
    const resolved = db.tickets
      .filter(t => t.status === "handoff_success" && Array.isArray(t.chatHistory) && t.chatHistory.length >= 3)
      .slice(-10);

    if (!resolved.length) {
      return res.json({
        ok: true,
        generated: 0,
        message: "No eligible resolved tickets found.",
        stats: getSuggestedFaqStats(loadSuggestedFAQs(), db),
      });
    }

    const data = loadSuggestedFAQs();
    let generated = 0;

    for (const ticket of resolved.slice(0, 5)) {
      const chatText = ticket.chatHistory
        .map(m => `${m.role === "user" ? "User" : "Bot"}: ${(m.content || "").slice(0, 300)}`)
        .join("\n");

      try {
        const result = await callLLM(
          [{ role: "user", parts: [{ text: chatText }] }],
          'Create a FAQ Q&A pair from this conversation history. Format: {"question":"...", "answer":"..."}. Respond with JSON only.',
          256
        );
        const reply = (result.reply || "").trim();
        const jsonMatch = reply.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          if (parsed.question && parsed.answer) {
            data.faqs.push({
              id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
              question: String(parsed.question).slice(0, 500),
              answer: String(parsed.answer).slice(0, 1000),
              ticketId: ticket.id,
              status: "pending",
              createdAt: nowIso()
            });
            generated++;
          }
        }
      } catch (err) { logger.warn("autoFAQ", "Generation skip", err); }
    }

    saveSuggestedFAQs(data);
    return res.json({
      ok: true,
      generated,
      message: generated > 0 ? `${generated} FAQ suggestion(s) generated.` : "No FAQ could be generated from the selected conversations.",
      stats: getSuggestedFaqStats(data, db),
    });
  });

  // ── Auto-FAQ: List ──────────────────────────────────────────────────────
  app.get("/api/admin/auto-faq", requireAdminAccess, (_req, res) => {
    const data = loadSuggestedFAQs();
    const db = loadTicketsDb();
    return res.json({
      ok: true,
      faqs: (data.faqs || []).filter(f => f.status === "pending"),
      stats: getSuggestedFaqStats(data, db),
    });
  });

  // ── Auto-FAQ: Approve ───────────────────────────────────────────────────
  app.post("/api/admin/auto-faq/:id/approve", requireAdminAccess, async (req, res) => {
    const data = loadSuggestedFAQs();
    const faq = data.faqs.find(f => f.id === req.params.id);
    if (!faq) return res.status(404).json({ error: "FAQ not found." });

    const rows = loadCSVData();
    rows.push({ question: faq.question, answer: faq.answer, source: "auto-faq" });
    saveCSVData(rows);
    await reingestKnowledgeBase();

    faq.status = "approved";
    saveSuggestedFAQs(data);
    const clientIp = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.socket?.remoteAddress || "";
    recordAuditEvent("faq_approved", faq.question.slice(0, 100), clientIp);
    return res.json({ ok: true });
  });

  // ── Auto-FAQ: Reject ────────────────────────────────────────────────────
  app.post("/api/admin/auto-faq/:id/reject", requireAdminAccess, (req, res) => {
    const data = loadSuggestedFAQs();
    const faq = data.faqs.find(f => f.id === req.params.id);
    if (!faq) return res.status(404).json({ error: "FAQ not found." });
    faq.status = "rejected";
    saveSuggestedFAQs(data);
    return res.json({ ok: true });
  });

  // ── Content Gaps ────────────────────────────────────────────────────────
  app.get("/api/admin/content-gaps", requireAdminAccess, (_req, res) => {
    const report = typeof getContentGapReport === "function"
      ? getContentGapReport({ limit: 100 })
      : { summary: { rawCount: (loadContentGaps()?.gaps || []).length }, gaps: (loadContentGaps()?.gaps || []).slice(0, 100), filtered: [] };
    return res.json({ ok: true, ...report });
  });

  app.post("/api/admin/content-gaps/prune", requireAdminAccess, (req, res) => {
    if (typeof pruneContentGaps !== "function") {
      return res.status(400).json({ error: "Content gap pruning is unavailable." });
    }
    const result = pruneContentGaps();
    const clientIp = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.socket?.remoteAddress || "";
    recordAuditEvent("content_gap_prune", `removed=${result.removedCount}`, clientIp);
    return res.json({ ok: true, ...result });
  });

  app.post("/api/admin/content-gaps/handle", requireAdminAccess, (req, res) => {
    if (typeof handleContentGap !== "function") {
      return adminError(res, req, 400, "contentGaps.handleUnavailable");
    }

    const query = String(req.body?.query || "").trim();
    if (!query) {
      return adminError(res, req, 400, "contentGaps.queryRequired");
    }

    const action = String(req.body?.action || "resolved").trim().toLowerCase();
    if (!["resolved", "dismissed"].includes(action)) {
      return adminError(res, req, 400, "contentGaps.invalidAction");
    }

    const result = handleContentGap(query, action);
    if (!result) {
      return adminError(res, req, 404, "contentGaps.recordNotFound");
    }

    const clientIp = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.socket?.remoteAddress || "";
    recordAuditEvent("content_gap_handle", `${action}:${result.normalizedQuery}`, clientIp);
    const report = getContentGapReport({ limit: 100 });
    return res.json({ ok: true, handled: result, ...report });
  });

  // ── Feedback ────────────────────────────────────────────────────────────
  app.get("/api/admin/feedback", requireAdminAccess, (_req, res) => {
    const data = loadFeedback();
    return res.json({ ok: true, entries: (data.entries || []).slice(-100).reverse() });
  });
}

module.exports = { mount };

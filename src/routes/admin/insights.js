"use strict";

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
    saveContentGaps,
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
      return res.status(400).json({ error: "LLM API key gerekli." });
    }

    const db = loadTicketsDb();
    const resolved = db.tickets
      .filter(t => t.status === "handoff_success" && Array.isArray(t.chatHistory) && t.chatHistory.length >= 3)
      .slice(-10);

    if (!resolved.length) {
      return res.json({ ok: true, generated: 0, message: "Uygun cozulmus ticket bulunamadi." });
    }

    const data = loadSuggestedFAQs();
    let generated = 0;

    for (const ticket of resolved.slice(0, 5)) {
      const chatText = ticket.chatHistory
        .map(m => `${m.role === "user" ? "Kullanici" : "Bot"}: ${(m.content || "").slice(0, 300)}`)
        .join("\n");

      try {
        const result = await callLLM(
          [{ role: "user", parts: [{ text: chatText }] }],
          'Bu konusma gecmisinden bir FAQ Q&A cifti olustur. Format: {"question":"...", "answer":"..."}. Turkce yaz. Sadece JSON yaz.',
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
    return res.json({ ok: true, generated });
  });

  // ── Auto-FAQ: List ──────────────────────────────────────────────────────
  app.get("/api/admin/auto-faq", requireAdminAccess, (_req, res) => {
    const data = loadSuggestedFAQs();
    return res.json({ ok: true, faqs: (data.faqs || []).filter(f => f.status === "pending") });
  });

  // ── Auto-FAQ: Approve ───────────────────────────────────────────────────
  app.post("/api/admin/auto-faq/:id/approve", requireAdminAccess, async (req, res) => {
    const data = loadSuggestedFAQs();
    const faq = data.faqs.find(f => f.id === req.params.id);
    if (!faq) return res.status(404).json({ error: "FAQ bulunamadi." });

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
    if (!faq) return res.status(404).json({ error: "FAQ bulunamadi." });
    faq.status = "rejected";
    saveSuggestedFAQs(data);
    return res.json({ ok: true });
  });

  // ── Content Gaps ────────────────────────────────────────────────────────
  app.get("/api/admin/content-gaps", requireAdminAccess, (_req, res) => {
    const data = loadContentGaps();
    const sorted = (data.gaps || []).sort((a, b) => b.count - a.count).slice(0, 100);
    return res.json({ ok: true, gaps: sorted });
  });

  app.delete("/api/admin/content-gaps/:index", requireAdminAccess, (req, res) => {
    const data = loadContentGaps();
    const idx = Number(req.params.index);
    const sorted = (data.gaps || []).sort((a, b) => b.count - a.count);
    if (idx >= 0 && idx < sorted.length) {
      const query = sorted[idx].query;
      data.gaps = data.gaps.filter(g => g.query !== query);
      saveContentGaps(data);
    }
    return res.json({ ok: true });
  });

  // ── Feedback ────────────────────────────────────────────────────────────
  app.get("/api/admin/feedback", requireAdminAccess, (_req, res) => {
    const data = loadFeedback();
    return res.json({ ok: true, entries: (data.entries || []).slice(-100).reverse() });
  });
}

module.exports = { mount };

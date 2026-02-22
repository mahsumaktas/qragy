"use strict";

/**
 * Admin Ticket Routes — CRUD, bulk operations, export, assign, notes, priority, prompt versions
 */
function mount(app, deps) {
  const {
    requireAdminAccess,
    loadTicketsDb,
    saveTicketsDb,
    sanitizeTicketForList,
    nowIso,
    calculateQualityScore,
    recordAuditEvent,
    safeError,
    Papa,
    // Prompt versioning
    savePromptVersion,
    loadPromptVersions,
    fs,
    path,
    AGENT_DIR,
    loadAllAgentConfig,
  } = deps;

  // ── Tickets List ────────────────────────────────────────────────────────
  app.get("/api/admin/tickets", requireAdminAccess, (req, res) => {
    const limit = Math.max(1, Math.min(500, Number(req.query.limit) || 100));
    const offset = Math.max(0, Number(req.query.offset) || 0);
    const statusFilter = String(req.query.status || "").trim();
    const searchQuery = String(req.query.q || "").trim().toLowerCase();
    const sourceFilter = String(req.query.source || "").trim();
    const includeEvents = /^(1|true|yes)$/i.test(String(req.query.includeEvents || ""));

    const db = loadTicketsDb();
    let tickets = [...db.tickets];
    tickets.sort((a, b) => Date.parse(b.createdAt || "") - Date.parse(a.createdAt || ""));

    if (statusFilter) {
      tickets = tickets.filter((ticket) => ticket.status === statusFilter);
    }

    if (sourceFilter) {
      tickets = tickets.filter((ticket) => (ticket.source || "web") === sourceFilter);
    }

    if (searchQuery) {
      tickets = tickets.filter((ticket) => {
        const fields = [
          ticket.id, ticket.branchCode, ticket.issueSummary,
          ticket.companyName, ticket.fullName, ticket.phone, ticket.status
        ].filter(Boolean).join(" ").toLowerCase();
        if (fields.includes(searchQuery)) return true;
        if (Array.isArray(ticket.chatHistory)) {
          return ticket.chatHistory.some((msg) =>
            String(msg.content || "").toLowerCase().includes(searchQuery)
          );
        }
        return false;
      });
    }

    const total = tickets.length;
    const page = tickets.slice(offset, offset + limit);

    return res.json({
      ok: true,
      total,
      limit,
      offset,
      tickets: page.map((ticket) => {
        const base = sanitizeTicketForList(ticket);
        if (includeEvents) {
          base.events = Array.isArray(ticket.events) ? ticket.events : [];
        }
        return base;
      })
    });
  });

  // ── Ticket Detail ───────────────────────────────────────────────────────
  app.get("/api/admin/tickets/:ticketId", requireAdminAccess, (req, res) => {
    const ticketId = String(req.params.ticketId || "").trim();
    const db = loadTicketsDb();
    const ticket = db.tickets.find((item) => item.id === ticketId);

    if (!ticket) {
      return res.status(404).json({ error: "Ticket bulunamadi." });
    }

    return res.json({
      ok: true,
      ticket: {
        ...sanitizeTicketForList(ticket),
        supportSnapshot: ticket.supportSnapshot || {},
        events: Array.isArray(ticket.events) ? ticket.events : [],
        chatHistory: Array.isArray(ticket.chatHistory) ? ticket.chatHistory : [],
        internalNotes: Array.isArray(ticket.internalNotes) ? ticket.internalNotes : []
      }
    });
  });

  // ── Bulk Ticket Operations ──────────────────────────────────────────────
  app.post("/api/admin/tickets/bulk", requireAdminAccess, (req, res) => {
    const { ticketIds, action, value } = req.body || {};
    if (!Array.isArray(ticketIds) || !ticketIds.length) {
      return res.status(400).json({ error: "ticketIds dizisi zorunludur." });
    }
    const validActions = ["close", "assign", "priority"];
    if (!validActions.includes(action)) {
      return res.status(400).json({ error: "action: close/assign/priority olmalidir." });
    }

    const db = loadTicketsDb();
    const clientIp = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.socket?.remoteAddress || "unknown";
    let updated = 0;

    for (const ticketId of ticketIds.slice(0, 100)) {
      const ticket = db.tickets.find(t => t.id === ticketId);
      if (!ticket) continue;

      const timestamp = nowIso();
      ticket.updatedAt = timestamp;
      ticket.events = Array.isArray(ticket.events) ? ticket.events : [];

      if (action === "close") {
        ticket.status = "handoff_success";
        ticket.resolvedAt = timestamp;
        ticket.qualityScore = calculateQualityScore(ticket);
        ticket.events.push({ at: timestamp, type: "bulk_closed", message: "Toplu islemle kapatildi." });
      } else if (action === "assign") {
        ticket.assignedTo = String(value || "").trim().slice(0, 100);
        ticket.events.push({ at: timestamp, type: "bulk_assigned", message: `Toplu islemle ${ticket.assignedTo || "?"} atandi.` });
      } else if (action === "priority") {
        const validPriority = ["low", "normal", "high"];
        if (validPriority.includes(value)) {
          ticket.priority = value;
          ticket.events.push({ at: timestamp, type: "bulk_priority", message: `Toplu islemle oncelik ${value} yapildi.` });
        }
      }
      updated++;
    }

    saveTicketsDb(db);
    recordAuditEvent("bulk_" + action, `${updated} ticket guncellendi`, clientIp);
    return res.json({ ok: true, updated });
  });

  // ── Export (CSV/JSON) ───────────────────────────────────────────────────
  app.get("/api/admin/tickets/export", requireAdminAccess, (req, res) => {
    const format = String(req.query.format || "json").toLowerCase();
    const status = String(req.query.status || "").trim();
    const db = loadTicketsDb();
    let tickets = db.tickets;
    if (status) tickets = tickets.filter(t => t.status === status);

    const exportData = tickets.map(t => ({
      id: t.id, status: t.status, createdAt: t.createdAt, updatedAt: t.updatedAt,
      branchCode: t.branchCode, issueSummary: t.issueSummary, companyName: t.companyName || "",
      fullName: t.fullName || "", phone: t.phone || "", source: t.source || "",
      priority: t.priority || "normal", assignedTo: t.assignedTo || "",
      csatRating: t.csatRating || "", sentiment: t.sentiment || "",
      qualityScore: t.qualityScore || ""
    }));

    if (format === "csv") {
      const csv = Papa.unparse(exportData, { header: true });
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename=tickets-${new Date().toISOString().slice(0, 10)}.csv`);
      return res.send("\uFEFF" + csv);
    }

    res.setHeader("Content-Type", "application/json");
    res.setHeader("Content-Disposition", `attachment; filename=tickets-${new Date().toISOString().slice(0, 10)}.json`);
    return res.json(exportData);
  });

  // ── Ticket: Assign ──────────────────────────────────────────────────────
  app.put("/api/admin/tickets/:ticketId/assign", requireAdminAccess, (req, res) => {
    const ticketId = String(req.params.ticketId || "").trim();
    const { assignedTo } = req.body || {};
    const db = loadTicketsDb();
    const ticket = db.tickets.find(t => t.id === ticketId);
    if (!ticket) return res.status(404).json({ error: "Ticket bulunamadi." });
    ticket.assignedTo = String(assignedTo || "").trim();
    ticket.updatedAt = nowIso();
    if (!ticket.firstResponseAt) ticket.firstResponseAt = ticket.updatedAt;
    ticket.events = Array.isArray(ticket.events) ? ticket.events : [];
    ticket.events.push({ at: ticket.updatedAt, type: "assigned", message: `Ticket ${ticket.assignedTo || "kimseye"} atandi.` });
    saveTicketsDb(db);
    const clientIp = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.socket?.remoteAddress || "";
    recordAuditEvent("ticket_assign", `${ticketId} -> ${ticket.assignedTo}`, clientIp);
    return res.json({ ok: true, ticket: sanitizeTicketForList(ticket) });
  });

  // ── Ticket: Notes ───────────────────────────────────────────────────────
  app.post("/api/admin/tickets/:ticketId/notes", requireAdminAccess, (req, res) => {
    const ticketId = String(req.params.ticketId || "").trim();
    const { note, author } = req.body || {};
    if (!note) return res.status(400).json({ error: "note zorunludur." });
    const db = loadTicketsDb();
    const ticket = db.tickets.find(t => t.id === ticketId);
    if (!ticket) return res.status(404).json({ error: "Ticket bulunamadi." });
    if (!Array.isArray(ticket.internalNotes)) ticket.internalNotes = [];
    const entry = { at: nowIso(), note: String(note).slice(0, 2000), author: String(author || "admin").slice(0, 100) };
    ticket.internalNotes.push(entry);
    ticket.updatedAt = entry.at;
    saveTicketsDb(db);
    return res.json({ ok: true, note: entry });
  });

  // ── Ticket: Priority ────────────────────────────────────────────────────
  app.put("/api/admin/tickets/:ticketId/priority", requireAdminAccess, (req, res) => {
    const ticketId = String(req.params.ticketId || "").trim();
    const { priority } = req.body || {};
    const valid = ["low", "normal", "high"];
    if (!valid.includes(priority)) return res.status(400).json({ error: "priority: low/normal/high olmalidir." });
    const db = loadTicketsDb();
    const ticket = db.tickets.find(t => t.id === ticketId);
    if (!ticket) return res.status(404).json({ error: "Ticket bulunamadi." });
    ticket.priority = priority;
    ticket.updatedAt = nowIso();
    ticket.events = Array.isArray(ticket.events) ? ticket.events : [];
    ticket.events.push({ at: ticket.updatedAt, type: "priority_changed", message: `Oncelik ${priority} olarak degistirildi.` });
    saveTicketsDb(db);
    const clientIp = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.socket?.remoteAddress || "";
    recordAuditEvent("ticket_priority", `${ticketId} -> ${priority}`, clientIp);
    return res.json({ ok: true, ticket: sanitizeTicketForList(ticket) });
  });

  // ── Prompt Versioning ───────────────────────────────────────────────────
  app.get("/api/admin/prompt-versions", requireAdminAccess, (_req, res) => {
    const data = loadPromptVersions();
    return res.json({ ok: true, versions: data.versions || [] });
  });

  app.post("/api/admin/prompt-versions/:id/rollback", requireAdminAccess, (req, res) => {
    const data = loadPromptVersions();
    const version = data.versions.find(v => v.id === req.params.id);
    if (!version) return res.status(404).json({ error: "Versiyon bulunamadi." });
    const filePath = path.join(AGENT_DIR, version.filename);
    try {
      if (fs.existsSync(filePath)) {
        savePromptVersion(version.filename, fs.readFileSync(filePath, "utf8"));
      }
      fs.writeFileSync(filePath, version.content, "utf8");
      loadAllAgentConfig();
      return res.json({ ok: true, message: `${version.filename} geri alindi.` });
    } catch (err) {
      return res.status(500).json({ error: safeError(err, "api") });
    }
  });
}

module.exports = { mount };

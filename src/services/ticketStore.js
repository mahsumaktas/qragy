"use strict";

/**
 * Ticket Store Service
 *
 * Ticket CRUD operations, duplicate detection, handoff result handling.
 * Wraps sqliteDb and ticketHelpers with runtime config injection.
 * Factory pattern — deps injected.
 */
function createTicketStore(deps) {
  const {
    fs,
    sqliteDb,
    logger,
    ticketHelpers,
    getGoogleModel,
    getSupportTimezone,
    dataDir,
    csvExampleFile,
    csvFile,
  } = deps;

  const {
    TICKET_STATUS, HANDOFF_RESULT_STATUS_MAP, ACTIVE_TICKET_STATUSES,
    nowIso: nowIsoHelper,
    createTicketId: createTicketIdHelper,
    buildTicketRecord: buildTicketRecordHelper,
    findRecentDuplicateTicket: findRecentDuplicateTicketHelper,
    getAdminSummary: getAdminSummaryHelper,
    sanitizeTicketForList: sanitizeTicketForListHelper,
  } = ticketHelpers;

  function nowIso() {
    return nowIsoHelper();
  }

  function ensureDataDir() {
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    if (!fs.existsSync(csvFile) && fs.existsSync(csvExampleFile)) {
      fs.copyFileSync(csvExampleFile, csvFile);
    }
  }

  function loadTicketsDb() {
    try {
      return sqliteDb.loadTicketsDb();
    } catch (err) {
      logger.warn("loadTicketsDb", "Error", err);
      return { tickets: [] };
    }
  }

  function saveTicketsDb(data) {
    try {
      sqliteDb.saveTicketsDb(data);
    } catch (err) { logger.warn("saveTicketsDb", "Error", err); }
  }

  function createTicketId() {
    return createTicketIdHelper();
  }

  function buildTicketRecord(memory, supportAvailability, context = {}) {
    return buildTicketRecordHelper(memory, supportAvailability, context, {
      supportTimezone: getSupportTimezone(),
      googleModel: getGoogleModel(),
    });
  }

  function findRecentDuplicateTicket(tickets, memory) {
    return findRecentDuplicateTicketHelper(tickets, memory);
  }

  function createOrReuseTicket(memory, supportAvailability, context = {}) {
    const db = loadTicketsDb();
    const duplicate = findRecentDuplicateTicket(db.tickets, memory);
    if (duplicate) {
      if (Array.isArray(context.chatHistory) && context.chatHistory.length) {
        duplicate.chatHistory = context.chatHistory;
        saveTicketsDb(db);
      }
      return { ticket: duplicate, created: false };
    }

    const ticket = buildTicketRecord(memory, supportAvailability, context);
    db.tickets.push(ticket);
    saveTicketsDb(db);
    return { ticket, created: true };
  }

  function updateTicketHandoffResult(ticketId, resultStatus, detail = "", meta = {}) {
    const normalizedStatus = HANDOFF_RESULT_STATUS_MAP[resultStatus];
    if (!normalizedStatus) {
      return { error: "Gecersiz handoff status degeri." };
    }

    const db = loadTicketsDb();
    const ticket = db.tickets.find((item) => item.id === ticketId);
    if (!ticket) {
      return { error: "Ticket bulunamadi." };
    }

    const timestamp = nowIso();
    ticket.status = normalizedStatus;
    ticket.updatedAt = timestamp;
    ticket.handoffAttempts = Number(ticket.handoffAttempts || 0) + 1;
    ticket.lastHandoffAt = timestamp;
    ticket.events = Array.isArray(ticket.events) ? ticket.events : [];
    ticket.events.push({
      at: timestamp,
      type: "handoff_result",
      message: detail || resultStatus,
      status: normalizedStatus,
      meta: meta && typeof meta === "object" ? meta : {}
    });

    saveTicketsDb(db);
    return { ticket };
  }

  function getAdminSummary(tickets) {
    return getAdminSummaryHelper(tickets);
  }

  function sanitizeTicketForList(ticket) {
    return sanitizeTicketForListHelper(ticket);
  }

  return {
    TICKET_STATUS,
    HANDOFF_RESULT_STATUS_MAP,
    ACTIVE_TICKET_STATUSES,
    nowIso,
    ensureDataDir,
    loadTicketsDb,
    saveTicketsDb,
    createTicketId,
    buildTicketRecord,
    findRecentDuplicateTicket,
    createOrReuseTicket,
    updateTicketHandoffResult,
    getAdminSummary,
    sanitizeTicketForList,
  };
}

module.exports = { createTicketStore };

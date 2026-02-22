const TICKET_STATUS = {
  HANDOFF_PENDING: "handoff_pending",
  QUEUED_AFTER_HOURS: "queued_after_hours",
  HANDOFF_SUCCESS: "handoff_success",
  HANDOFF_FAILED: "handoff_failed",
  HANDOFF_PARENT_POSTED: "handoff_parent_posted",
  HANDOFF_OPENED_NO_SUMMARY: "handoff_opened_no_summary",
};

const HANDOFF_RESULT_STATUS_MAP = {
  success: TICKET_STATUS.HANDOFF_SUCCESS,
  failed: TICKET_STATUS.HANDOFF_FAILED,
  parent_posted: TICKET_STATUS.HANDOFF_PARENT_POSTED,
  opened_no_summary: TICKET_STATUS.HANDOFF_OPENED_NO_SUMMARY,
};

const ACTIVE_TICKET_STATUSES = new Set([
  TICKET_STATUS.HANDOFF_PENDING,
  TICKET_STATUS.QUEUED_AFTER_HOURS,
  TICKET_STATUS.HANDOFF_FAILED,
  TICKET_STATUS.HANDOFF_OPENED_NO_SUMMARY,
]);

const DUPLICATE_TICKET_WINDOW_MS = 20 * 60 * 1000;

function nowIso() {
  return new Date().toISOString();
}

function createTicketId() {
  const randomPart = Math.floor(Math.random() * 9000 + 1000);
  return `TK-${Date.now()}-${randomPart}`;
}

function buildTicketRecord(memory, supportAvailability, context = {}, defaults = {}) {
  const timestamp = nowIso();
  const initialStatus = supportAvailability?.isOpen
    ? TICKET_STATUS.HANDOFF_PENDING
    : TICKET_STATUS.QUEUED_AFTER_HOURS;

  return {
    id: createTicketId(),
    status: initialStatus,
    createdAt: timestamp,
    updatedAt: timestamp,
    branchCode: memory.branchCode || "",
    issueSummary: memory.issueSummary || "",
    companyName: memory.companyName || "",
    fullName: memory.fullName || "",
    phone: memory.phone || "",
    supportSnapshot: {
      enabled: Boolean(supportAvailability?.enabled),
      isOpen: Boolean(supportAvailability?.isOpen),
      timezone: supportAvailability?.timezone || defaults.supportTimezone || "Europe/Istanbul",
      openHour: Number(supportAvailability?.openHour),
      closeHour: Number(supportAvailability?.closeHour),
      openDays: Array.isArray(supportAvailability?.openDays) ? supportAvailability.openDays : [],
    },
    source: context.source || "chat-api",
    model: context.model || defaults.googleModel || "",
    sentiment: context.sentiment || "neutral",
    qualityScore: null,
    firstResponseAt: null,
    resolvedAt: null,
    handoffAttempts: 0,
    lastHandoffAt: "",
    chatHistory: context.chatHistory || [],
    events: [
      {
        at: timestamp,
        type: "ticket_created",
        message:
          initialStatus === TICKET_STATUS.HANDOFF_PENDING
            ? "Talep oluşturuldu ve temsilci aktarımı için hazır."
            : "Talep oluşturuldu, mesai dışı olduğu için sıraya alındı.",
      },
    ],
  };
}

function findRecentDuplicateTicket(tickets, memory) {
  if (!memory.branchCode || !memory.issueSummary) {
    return null;
  }

  const now = Date.now();
  for (let i = tickets.length - 1; i >= 0; i -= 1) {
    const ticket = tickets[i];
    if (ticket.branchCode !== memory.branchCode || ticket.issueSummary !== memory.issueSummary) {
      continue;
    }

    const createdAtMs = Date.parse(ticket.createdAt || "");
    if (!Number.isFinite(createdAtMs)) {
      continue;
    }

    if (now - createdAtMs > DUPLICATE_TICKET_WINDOW_MS) {
      continue;
    }

    if (!ACTIVE_TICKET_STATUSES.has(ticket.status)) {
      continue;
    }

    return ticket;
  }

  return null;
}

function getAdminSummary(tickets) {
  const now = Date.now();
  const last24h = tickets.filter((ticket) => {
    const createdAtMs = Date.parse(ticket.createdAt || "");
    return Number.isFinite(createdAtMs) && now - createdAtMs <= 24 * 60 * 60 * 1000;
  }).length;

  const byStatus = {
    [TICKET_STATUS.HANDOFF_PENDING]: 0,
    [TICKET_STATUS.QUEUED_AFTER_HOURS]: 0,
    [TICKET_STATUS.HANDOFF_SUCCESS]: 0,
    [TICKET_STATUS.HANDOFF_FAILED]: 0,
    [TICKET_STATUS.HANDOFF_PARENT_POSTED]: 0,
    [TICKET_STATUS.HANDOFF_OPENED_NO_SUMMARY]: 0,
  };

  for (const ticket of tickets) {
    if (Object.prototype.hasOwnProperty.call(byStatus, ticket.status)) {
      byStatus[ticket.status] += 1;
    }
  }

  return { total: tickets.length, last24h, byStatus };
}

function sanitizeTicketForList(ticket) {
  return {
    id: ticket.id,
    status: ticket.status,
    createdAt: ticket.createdAt,
    updatedAt: ticket.updatedAt,
    branchCode: ticket.branchCode,
    issueSummary: ticket.issueSummary,
    companyName: ticket.companyName || "",
    fullName: ticket.fullName || "",
    phone: ticket.phone || "",
    handoffAttempts: Number(ticket.handoffAttempts || 0),
    lastHandoffAt: ticket.lastHandoffAt || "",
    source: ticket.source || "web",
    priority: ticket.priority || "normal",
    assignedTo: ticket.assignedTo || "",
    csatRating: ticket.csatRating || null,
  };
}

module.exports = {
  TICKET_STATUS,
  HANDOFF_RESULT_STATUS_MAP,
  ACTIVE_TICKET_STATUSES,
  DUPLICATE_TICKET_WINDOW_MS,
  nowIso,
  createTicketId,
  buildTicketRecord,
  findRecentDuplicateTicket,
  getAdminSummary,
  sanitizeTicketForList,
};

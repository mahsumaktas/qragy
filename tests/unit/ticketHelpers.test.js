describe("ticketHelpers", () => {
  const {
    TICKET_STATUS, createTicketId, buildTicketRecord,
    findRecentDuplicateTicket, getAdminSummary, sanitizeTicketForList
  } = require("../../src/utils/ticketHelpers.js");

  it("should create ticket IDs with TK- prefix", () => {
    const id = createTicketId();
    expect(id).toMatch(/^TK-\d+-\d{4}$/);
  });

  it("should create unique ticket IDs", () => {
    const id1 = createTicketId();
    const id2 = createTicketId();
    expect(id1).not.toBe(id2);
  });

  it("should build ticket record with handoff_pending when support is open", () => {
    const ticket = buildTicketRecord(
      { branchCode: "B001", issueSummary: "Test issue" },
      { isOpen: true, enabled: true, timezone: "UTC", openHour: 9, closeHour: 17, openDays: [1, 2, 3, 4, 5] }
    );
    expect(ticket.status).toBe(TICKET_STATUS.HANDOFF_PENDING);
    expect(ticket.branchCode).toBe("B001");
    expect(ticket.events).toHaveLength(1);
  });

  it("should build ticket record with queued_after_hours when support is closed", () => {
    const ticket = buildTicketRecord(
      { branchCode: "B002", issueSummary: "Another issue" },
      { isOpen: false, enabled: true }
    );
    expect(ticket.status).toBe(TICKET_STATUS.QUEUED_AFTER_HOURS);
  });

  it("should find recent duplicate ticket", () => {
    const now = new Date().toISOString();
    const tickets = [
      { branchCode: "B001", issueSummary: "Test", createdAt: now, status: TICKET_STATUS.HANDOFF_PENDING }
    ];
    const result = findRecentDuplicateTicket(tickets, { branchCode: "B001", issueSummary: "Test" });
    expect(result).not.toBeNull();
    expect(result.branchCode).toBe("B001");
  });

  it("should return null when no duplicate found", () => {
    const result = findRecentDuplicateTicket([], { branchCode: "B001", issueSummary: "Test" });
    expect(result).toBeNull();
  });

  it("should return null when memory has no branchCode", () => {
    const result = findRecentDuplicateTicket([{ branchCode: "B001" }], { issueSummary: "Test" });
    expect(result).toBeNull();
  });

  it("should calculate admin summary", () => {
    const now = new Date().toISOString();
    const tickets = [
      { status: TICKET_STATUS.HANDOFF_PENDING, createdAt: now },
      { status: TICKET_STATUS.HANDOFF_SUCCESS, createdAt: now },
      { status: TICKET_STATUS.HANDOFF_PENDING, createdAt: now }
    ];
    const summary = getAdminSummary(tickets);
    expect(summary.total).toBe(3);
    expect(summary.last24h).toBe(3);
    expect(summary.byStatus[TICKET_STATUS.HANDOFF_PENDING]).toBe(2);
  });

  it("should sanitize ticket for list", () => {
    const ticket = {
      id: "TK-1", status: "open", createdAt: "2024-01-01", updatedAt: "2024-01-02",
      branchCode: "B001", issueSummary: "Test", internalField: "secret"
    };
    const sanitized = sanitizeTicketForList(ticket);
    expect(sanitized.id).toBe("TK-1");
    expect(sanitized.internalField).toBeUndefined();
  });
});

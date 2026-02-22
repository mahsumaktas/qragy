import { describe, it, expect, vi, beforeEach } from "vitest";

const { createTicketStore } = require("../../src/services/ticketStore.js");

describe("ticketStore", () => {
  let store;
  let mockSqliteDb;
  let mockTicketHelpers;
  let mockFs;

  beforeEach(() => {
    mockSqliteDb = {
      loadTicketsDb: vi.fn(() => ({ tickets: [] })),
      saveTicketsDb: vi.fn(),
    };

    mockTicketHelpers = {
      TICKET_STATUS: {
        HANDOFF_PENDING: "handoff_pending",
        QUEUED_AFTER_HOURS: "queued_after_hours",
        HANDOFF_SUCCESS: "handoff_success",
        HANDOFF_FAILED: "handoff_failed",
        HANDOFF_PARENT_POSTED: "handoff_parent_posted",
        HANDOFF_OPENED_NO_SUMMARY: "handoff_opened_no_summary",
      },
      HANDOFF_RESULT_STATUS_MAP: {
        success: "handoff_success",
        failed: "handoff_failed",
        parent_posted: "handoff_parent_posted",
        opened_no_summary: "handoff_opened_no_summary",
      },
      ACTIVE_TICKET_STATUSES: new Set([
        "handoff_pending",
        "queued_after_hours",
        "handoff_failed",
        "handoff_opened_no_summary",
      ]),
      nowIso: vi.fn(() => "2026-02-22T10:00:00.000Z"),
      createTicketId: vi.fn(() => "TK-123-4567"),
      buildTicketRecord: vi.fn((memory, supportAvailability, context, _defaults) => ({
        id: "TK-123-4567",
        status: supportAvailability?.isOpen ? "handoff_pending" : "queued_after_hours",
        branchCode: memory.branchCode || "",
        issueSummary: memory.issueSummary || "",
        chatHistory: context?.chatHistory || [],
        events: [{ at: "2026-02-22T10:00:00.000Z", type: "ticket_created" }],
      })),
      findRecentDuplicateTicket: vi.fn(() => null),
      getAdminSummary: vi.fn((tickets) => ({
        total: tickets.length,
        last24h: tickets.length,
        byStatus: { handoff_pending: 1 },
      })),
      sanitizeTicketForList: vi.fn((ticket) => ({
        id: ticket.id,
        status: ticket.status,
        branchCode: ticket.branchCode,
      })),
    };

    mockFs = {
      existsSync: vi.fn(() => true),
      mkdirSync: vi.fn(),
      copyFileSync: vi.fn(),
    };

    store = createTicketStore({
      fs: mockFs,
      sqliteDb: mockSqliteDb,
      logger: { warn: vi.fn() },
      ticketHelpers: mockTicketHelpers,
      getGoogleModel: () => "gemini-2.0-flash",
      getSupportTimezone: () => "Europe/Istanbul",
      dataDir: "/tmp/data",
      csvExampleFile: "/tmp/data/example.csv",
      csvFile: "/tmp/data/tickets.csv",
    });
  });

  it("createOrReuseTicket creates new ticket", () => {
    const memory = { branchCode: "EST01", issueSummary: "Yazici sorunu" };
    const result = store.createOrReuseTicket(memory, { isOpen: true });

    expect(result.created).toBe(true);
    expect(result.ticket.id).toBe("TK-123-4567");
    expect(result.ticket.status).toBe("handoff_pending");
    expect(mockSqliteDb.saveTicketsDb).toHaveBeenCalledOnce();
  });

  it("createOrReuseTicket reuses existing duplicate", () => {
    const existingTicket = {
      id: "TK-existing-1111",
      branchCode: "EST01",
      issueSummary: "Yazici sorunu",
      status: "handoff_pending",
      chatHistory: [],
    };
    mockSqliteDb.loadTicketsDb.mockReturnValue({ tickets: [existingTicket] });
    mockTicketHelpers.findRecentDuplicateTicket.mockReturnValue(existingTicket);

    const memory = { branchCode: "EST01", issueSummary: "Yazici sorunu" };
    const result = store.createOrReuseTicket(memory, { isOpen: true });

    expect(result.created).toBe(false);
    expect(result.ticket.id).toBe("TK-existing-1111");
    expect(mockTicketHelpers.buildTicketRecord).not.toHaveBeenCalled();
  });

  it("findRecentDuplicateTicket finds duplicate within 24h", () => {
    const tickets = [
      { branchCode: "EST01", issueSummary: "Yazici sorunu", createdAt: new Date().toISOString(), status: "handoff_pending" },
    ];
    const memory = { branchCode: "EST01", issueSummary: "Yazici sorunu" };

    // The store delegates to ticketHelpers, so we verify the delegation
    mockTicketHelpers.findRecentDuplicateTicket.mockReturnValue(tickets[0]);
    const result = store.findRecentDuplicateTicket(tickets, memory);

    expect(result).not.toBeNull();
    expect(result.branchCode).toBe("EST01");
    expect(mockTicketHelpers.findRecentDuplicateTicket).toHaveBeenCalledWith(tickets, memory);
  });

  it("findRecentDuplicateTicket returns null when no duplicate", () => {
    mockTicketHelpers.findRecentDuplicateTicket.mockReturnValue(null);
    const result = store.findRecentDuplicateTicket([], { branchCode: "EST01", issueSummary: "Test" });

    expect(result).toBeNull();
  });

  it("updateTicketHandoffResult updates status correctly", () => {
    const existingTicket = {
      id: "TK-999-1234",
      status: "handoff_pending",
      handoffAttempts: 0,
      events: [],
    };
    mockSqliteDb.loadTicketsDb.mockReturnValue({ tickets: [existingTicket] });

    const result = store.updateTicketHandoffResult("TK-999-1234", "success", "Basarili aktarim");

    expect(result.ticket).toBeDefined();
    expect(result.ticket.status).toBe("handoff_success");
    expect(result.ticket.handoffAttempts).toBe(1);
    expect(result.ticket.events).toHaveLength(1);
    expect(result.ticket.events[0].type).toBe("handoff_result");
    expect(result.ticket.events[0].message).toBe("Basarili aktarim");
    expect(mockSqliteDb.saveTicketsDb).toHaveBeenCalled();
  });

  it("getAdminSummary counts tickets by status", () => {
    const tickets = [
      { status: "handoff_pending", createdAt: new Date().toISOString() },
      { status: "handoff_success", createdAt: new Date().toISOString() },
    ];

    const summary = store.getAdminSummary(tickets);

    expect(mockTicketHelpers.getAdminSummary).toHaveBeenCalledWith(tickets);
    expect(summary.total).toBe(2);
  });

  it("sanitizeTicketForList removes chatHistory", () => {
    const ticket = {
      id: "TK-1",
      status: "handoff_pending",
      branchCode: "EST01",
      chatHistory: [{ role: "user", content: "test" }],
      internalField: "secret",
    };

    const sanitized = store.sanitizeTicketForList(ticket);

    expect(mockTicketHelpers.sanitizeTicketForList).toHaveBeenCalledWith(ticket);
    expect(sanitized.id).toBe("TK-1");
    expect(sanitized.chatHistory).toBeUndefined();
    expect(sanitized.internalField).toBeUndefined();
  });
});

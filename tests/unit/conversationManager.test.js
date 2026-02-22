import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { createConversationManager } = require("../../src/services/conversationManager.js");

describe("conversationManager", () => {
  let manager;
  let mockSqliteDb;
  let clarificationCounters;

  beforeEach(() => {
    vi.useFakeTimers();

    mockSqliteDb = {
      loadConversations: vi.fn(() => ({ conversations: [] })),
      saveConversations: vi.fn(),
    };

    clarificationCounters = new Map();

    manager = createConversationManager({
      sqliteDb: mockSqliteDb,
      logger: { warn: vi.fn() },
      clarificationCounters,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("upsertConversation creates new conversation", () => {
    const sessionId = "sess-001";
    const messages = [
      { role: "user", content: "merhaba" },
      { role: "assistant", content: "hosgeldiniz" },
    ];
    const memory = { branchCode: "EST01" };

    const conv = manager.upsertConversation(sessionId, messages, memory);

    expect(conv.sessionId).toBe("sess-001");
    expect(conv.status).toBe("active");
    expect(conv.memory.branchCode).toBe("EST01");
    expect(conv.messageCount).toBe(1); // 1 user message
    expect(conv.lastUserMessage).toBe("merhaba");
    expect(mockSqliteDb.saveConversations).toHaveBeenCalledOnce();
  });

  it("upsertConversation updates existing conversation", () => {
    const existingConv = {
      sessionId: "sess-002",
      status: "active",
      createdAt: "2026-02-22T09:00:00.000Z",
      updatedAt: "2026-02-22T09:00:00.000Z",
      messageCount: 1,
      lastUserMessage: "merhaba",
      memory: { branchCode: "EST01" },
      ticketId: "",
      source: "web",
      chatHistory: [{ role: "user", content: "merhaba" }],
      ip: "1.2.3.4",
    };
    mockSqliteDb.loadConversations.mockReturnValue({ conversations: [existingConv] });

    const messages = [
      { role: "user", content: "merhaba" },
      { role: "assistant", content: "hosgeldiniz" },
      { role: "user", content: "yazicim bozuldu" },
    ];
    const memory = { branchCode: "EST01", issueSummary: "Yazici sorunu" };

    const conv = manager.upsertConversation("sess-002", messages, memory);

    expect(conv.sessionId).toBe("sess-002");
    expect(conv.memory.issueSummary).toBe("Yazici sorunu");
    expect(conv.messageCount).toBe(2); // 2 user messages
    expect(conv.lastUserMessage).toBe("yazicim bozuldu");
    expect(mockSqliteDb.saveConversations).toHaveBeenCalled();
  });

  it("loadConversations returns all conversations", () => {
    const mockData = {
      conversations: [
        { sessionId: "s1", updatedAt: new Date().toISOString() },
        { sessionId: "s2", updatedAt: new Date().toISOString() },
      ],
    };
    mockSqliteDb.loadConversations.mockReturnValue(mockData);

    const result = manager.loadConversations();

    expect(result.conversations).toHaveLength(2);
    expect(result.conversations[0].sessionId).toBe("s1");
    expect(mockSqliteDb.loadConversations).toHaveBeenCalledOnce();
  });

  it("saveConversations persists to SQLite", () => {
    const data = { conversations: [{ sessionId: "s1" }] };

    manager.saveConversations(data);

    expect(mockSqliteDb.saveConversations).toHaveBeenCalledWith(data);
  });

  it("getClarificationKey returns correct key format", () => {
    const messages = [
      { role: "user", content: "sube kodum EST01 yazicim calismiyor" },
      { role: "assistant", content: "anladim" },
    ];

    const key = manager.getClarificationKey(messages);

    expect(key).toBe("sube kodum EST01 yazicim calismiyor".slice(0, 50));
  });

  it("incrementClarificationCount increments and returns count", () => {
    const key = "test-key";

    expect(manager.incrementClarificationCount(key)).toBe(1);
    expect(manager.incrementClarificationCount(key)).toBe(2);
    expect(manager.incrementClarificationCount(key)).toBe(3);
    expect(clarificationCounters.get(key)).toBe(3);
  });

  it("resetClarificationCount resets to zero", () => {
    const key = "reset-key";
    manager.incrementClarificationCount(key);
    manager.incrementClarificationCount(key);
    expect(clarificationCounters.get(key)).toBe(2);

    manager.resetClarificationCount(key);

    expect(clarificationCounters.has(key)).toBe(false);
  });
});

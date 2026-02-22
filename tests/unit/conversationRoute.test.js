"use strict";

const { mount } = require("../../src/routes/conversation.js");

function createMockApp() {
  const routes = {};
  return {
    get(p, ...handlers) { routes["GET " + p] = handlers[handlers.length - 1]; },
    post(p, ...handlers) { routes["POST " + p] = handlers[handlers.length - 1]; },
    use() {},
    _call(method, urlPath, body, params = {}) {
      const key = method + " " + urlPath;
      const handler = routes[key];
      if (!handler) throw new Error("No route for " + key);
      let statusCode = 200;
      let responseBody = null;
      const req = { body: body || {}, params };
      const res = {
        status(code) { statusCode = code; return res; },
        json(data) { responseBody = data; },
      };
      handler(req, res);
      return { statusCode, body: responseBody };
    },
    _routes: routes,
  };
}

function makeDeps(overrides = {}) {
  return {
    express: require("express"),
    fs: { existsSync: () => false, readFileSync: () => "[]", writeFileSync: vi.fn() },
    logger: { info() {}, warn() {}, error() {} },
    multer: require("multer"),
    loadTicketsDb: vi.fn(() => ({ tickets: [] })),
    saveTicketsDb: vi.fn(),
    updateTicketHandoffResult: overrides.updateTicketHandoffResult || vi.fn(() => ({ error: null, ticket: { id: "t1", status: "resolved" } })),
    sanitizeTicketForList: vi.fn((t) => t),
    nowIso: () => new Date().toISOString(),
    fireWebhook: vi.fn(),
    loadConversations: overrides.loadConversations || vi.fn(() => ({ conversations: [] })),
    upsertConversation: vi.fn(),
    recordAnalyticsEvent: vi.fn(),
    recordCsatAnalytics: vi.fn(),
    saveAnalyticsData: vi.fn(),
    getAnalyticsData: () => ({ daily: {} }),
    FEEDBACK_FILE: "/tmp/feedback-test.json",
    UPLOADS_DIR: "/tmp/uploads-test",
    ngReflexion: overrides.ngReflexion || null,
    ngGraphBuilder: overrides.ngGraphBuilder || null,
    ...overrides,
  };
}

describe("conversation route - intelligence wiring", () => {
  it("resolved ticket triggers graphBuilder.extractAndStore", () => {
    const extractAndStore = vi.fn().mockResolvedValue();
    const deps = makeDeps({
      ngGraphBuilder: { extractAndStore },
      updateTicketHandoffResult: vi.fn(() => ({
        error: null,
        ticket: { id: "t1", status: "resolved", issueSummary: "Yazici sorunu" },
      })),
    });

    const app = createMockApp();
    mount(app, deps);

    const result = app._call("POST", "/api/tickets/:ticketId/handoff", { status: "resolved" }, { ticketId: "t1" });

    expect(result.statusCode).toBe(200);
    expect(result.body.ok).toBe(true);
    // Fire-and-forget — extractAndStore should be called asynchronously
    // We verify the Promise was created (extractAndStore will be called in next microtask)
    return new Promise((resolve) => setTimeout(resolve, 50)).then(() => {
      expect(extractAndStore).toHaveBeenCalledOnce();
      expect(extractAndStore).toHaveBeenCalledWith(
        expect.objectContaining({ id: "t1", status: "resolved" })
      );
    });
  });

  it("non-resolved ticket does NOT trigger graphBuilder", () => {
    const extractAndStore = vi.fn().mockResolvedValue();
    const deps = makeDeps({
      ngGraphBuilder: { extractAndStore },
      updateTicketHandoffResult: vi.fn(() => ({
        error: null,
        ticket: { id: "t2", status: "pending" },
      })),
    });

    const app = createMockApp();
    mount(app, deps);

    app._call("POST", "/api/tickets/:ticketId/handoff", { status: "pending" }, { ticketId: "t2" });

    return new Promise((resolve) => setTimeout(resolve, 50)).then(() => {
      expect(extractAndStore).not.toHaveBeenCalled();
    });
  });

  it("down feedback triggers reflexion.analyze", () => {
    const analyze = vi.fn().mockResolvedValue();
    const deps = makeDeps({
      ngReflexion: { analyze },
      loadConversations: vi.fn(() => ({
        conversations: [{
          sessionId: "sess-1",
          chatHistory: [
            { role: "user", parts: [{ text: "Kargo nerede?" }] },
            { role: "assistant", parts: [{ text: "Kargo bilginiz bulunmuyor." }] },
          ],
        }],
      })),
    });

    const app = createMockApp();
    mount(app, deps);

    const result = app._call("POST", "/api/chat/feedback", {
      sessionId: "sess-1",
      messageIndex: 1,
      rating: "down",
    });

    expect(result.statusCode).toBe(200);

    return new Promise((resolve) => setTimeout(resolve, 50)).then(() => {
      expect(analyze).toHaveBeenCalledOnce();
      expect(analyze).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionId: "sess-1",
          query: "Kargo nerede?",
          answer: "Kargo bilginiz bulunmuyor.",
        })
      );
    });
  });

  it("up feedback does NOT trigger reflexion.analyze", () => {
    const analyze = vi.fn().mockResolvedValue();
    const deps = makeDeps({
      ngReflexion: { analyze },
    });

    const app = createMockApp();
    mount(app, deps);

    app._call("POST", "/api/chat/feedback", {
      sessionId: "sess-1",
      messageIndex: 0,
      rating: "up",
    });

    return new Promise((resolve) => setTimeout(resolve, 50)).then(() => {
      expect(analyze).not.toHaveBeenCalled();
    });
  });
});

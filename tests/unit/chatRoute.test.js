import { describe, expect, it, vi } from "vitest";
import chatRouteModule from "../../src/routes/chat.js";

const { mount } = chatRouteModule;

function createMockApp() {
  const routes = {};
  return {
    post(path, ...handlers) {
      routes[`POST ${path}`] = handlers[handlers.length - 1];
    },
    _call(method, path, body) {
      const handler = routes[`${method} ${path}`];
      if (!handler) throw new Error(`No route for ${method} ${path}`);
      let statusCode = 200;
      let payload = null;
      const req = {
        body: body || {},
        headers: {},
        socket: { remoteAddress: "127.0.0.1" },
      };
      const res = {
        status(code) { statusCode = code; return res; },
        json(data) { payload = data; return data; },
      };
      return Promise.resolve(handler(req, res)).then(() => ({ statusCode, body: payload }));
    },
  };
}

function makeDeps() {
  return {
    checkRateLimit: () => true,
    RATE_LIMIT_WINDOW_MS: 60000,
    extractTicketMemory: () => ({}),
    splitActiveTicketMessages: (messages) => ({
      activeMessages: messages,
      hasClosedTicketHistory: false,
      lastClosedTicketMemory: null,
    }),
    getUserMessages: (messages) => messages.filter((item) => item.role === "user").map((item) => item.content),
    detectInjection: () => ({ blocked: false, suspicious: false }),
    checkRelevanceLLM: null,
    callLLM: null,
    GENERIC_REPLY: "generic",
    upsertConversation: vi.fn(),
    appendBotResponse: vi.fn(),
    loadConversations: () => ({ conversations: [] }),
    saveConversations: vi.fn(),
    compressConversationHistory: async (messages) => messages,
    buildConversationContext: async () => ({}),
    getSupportAvailability: () => ({}),
    getGoogleModel: () => "test-model",
    recordAnalyticsEvent: vi.fn(),
    recordLLMError: vi.fn(),
    buildMissingFieldsReply: vi.fn(),
    webChatPipeline: {
      runEarlyChecks: () => null,
      handleTicketCreation: async () => null,
      handleEscalation: async () => null,
      handleDeterministicReply: () => ({ reply: "ok" }),
    },
    ngChatPipeline: null,
    USE_ADAPTIVE_PIPELINE: false,
    loadCSVData: () => [],
    validateOutput: () => ({ valid: true }),
    maskCredentials: (text) => text,
    getSoulText: () => "",
    getPersonaText: () => "",
  };
}

describe("chat route payload guards", () => {
  it("rejects overly long user messages", async () => {
    const app = createMockApp();
    mount(app, makeDeps());

    const result = await app._call("POST", "/api/chat", {
      messages: [{ role: "user", content: "x".repeat(1001) }],
    });

    expect(result.statusCode).toBe(400);
    expect(result.body.error).toContain("Maximum 1000 characters");
  });

  it("rejects oversized conversation payloads", async () => {
    const app = createMockApp();
    mount(app, makeDeps());

    const result = await app._call("POST", "/api/chat", {
      messages: Array.from({ length: 13 }, (_, index) => ({
        role: index % 2 === 0 ? "user" : "assistant",
        content: "x".repeat(1000),
      })),
    });

    expect(result.statusCode).toBe(400);
    expect(result.body.error).toContain("Conversation payload too large");
  });
});

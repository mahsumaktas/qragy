import { describe, it, expect, vi } from "vitest";
import express from "express";
import request from "supertest";

describe("E2E Full Flow Tests", () => {
  describe("GET /api/health", () => {
    it("health endpoint returns ok", async () => {
      const app = express();
      const { mount } = await import("../../src/routes/health.js");

      mount(app, {
        getHealthSnapshot: () => ({
          ok: true,
          model: "gemini-2.0-flash",
          hasApiKey: true,
          llmStatus: { ok: true },
          maxOutputTokens: 4096,
          requestTimeoutMs: 30000,
          thinkingBudget: 0,
          deterministicCollectionMode: "hybrid",
          agentFilesLoaded: true,
          topicsLoaded: 2,
          memoryTemplateLoaded: true,
          zendeskEnabled: false,
          zendeskSnippetConfigured: false,
          sunshineEnabled: false,
          sunshineConfigured: false,
          supportAvailability: { isOpen: true, timezone: "Europe/Istanbul" },
          knowledgeBaseLoaded: true,
          adminTokenRequired: true,
          tickets: { total: 5, open: 2, closed: 3 },
        }),
      });

      const res = await request(app).get("/api/health");
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.model).toBe("gemini-2.0-flash");
      expect(res.body.tickets.total).toBe(5);
    });
  });

  describe("GET /api/config", () => {
    it("config endpoint returns widget config", async () => {
      const app = express();
      const { mount } = await import("../../src/routes/widget.js");

      mount(app, {
        getSupportAvailability: () => ({ isOpen: true, timezone: "Europe/Istanbul" }),
        getZendeskEnabled: () => false,
        getZendeskSnippetKey: () => "",
        getZendeskDefaultTags: () => [],
        getAdminToken: () => "test-token",
        getChatFlowConfig: () => ({
          greeting: "Merhaba",
          welcomeMessage: "Hosgeldiniz",
          gibberishMessage: "Anlayamadim",
        }),
        getSiteConfig: () => ({
          name: "TestSite",
          heroTitle: "Destek",
          primaryColor: "#0066cc",
        }),
      });

      const res = await request(app).get("/api/config");
      expect(res.status).toBe(200);
      expect(res.body.zendesk.enabled).toBe(false);
      expect(res.body.admin.tokenRequired).toBe(true);
      expect(res.body.chatFlow.welcomeMessage).toBe("Hosgeldiniz");
      expect(res.body.site.primaryColor).toBe("#0066cc");
      expect(res.body.support.isOpen).toBe(true);
    });
  });

  describe("GET /api/setup/status", () => {
    it("setup status returns boolean", async () => {
      const app = express();
      const { mount } = await import("../../src/routes/setup.js");

      mount(app, {
        isSetupComplete: () => false,
        markSetupComplete: vi.fn(),
        saveSiteConfig: vi.fn(),
        saveChatFlowConfig: vi.fn(),
        loadTemplate: vi.fn(() => null),
      });

      const res = await request(app).get("/api/setup/status");
      expect(res.status).toBe(200);
      expect(res.body.setupComplete).toBe(false);
    });
  });

  describe("POST /api/setup/complete", () => {
    it("setup complete with valid data", async () => {
      const app = express();
      app.use(express.json());
      const { mount } = await import("../../src/routes/setup.js");

      const saveSiteConfig = vi.fn();
      const saveChatFlowConfig = vi.fn();
      const markSetupComplete = vi.fn();

      mount(app, {
        isSetupComplete: () => false,
        markSetupComplete,
        saveSiteConfig,
        saveChatFlowConfig,
        loadTemplate: vi.fn(() => null),
      });

      const res = await request(app)
        .post("/api/setup/complete")
        .send({
          companyName: "TestCo",
          sector: "teknoloji",
          logoUrl: "https://example.com/logo.png",
        });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(saveSiteConfig).toHaveBeenCalledWith(
        expect.objectContaining({
          heroTitle: "TestCo Destek",
          headerTitle: "TestCo Destek",
          logoUrl: "https://example.com/logo.png",
        })
      );
      expect(saveChatFlowConfig).toHaveBeenCalledWith(
        expect.objectContaining({
          welcomeMessage: expect.stringContaining("TestCo"),
        })
      );
      expect(markSetupComplete).toHaveBeenCalledWith(
        expect.objectContaining({
          companyName: "TestCo",
          sector: "teknoloji",
        })
      );
    });
  });

  describe("POST /api/chat", () => {
    it("chat endpoint handles message", async () => {
      const app = express();
      app.use(express.json());
      const { mount } = await import("../../src/routes/chat.js");

      const mockPipeline = {
        runEarlyChecks: vi.fn(() => ({
          reply: "Merhaba, size nasil yardimci olabilirim?",
          source: "gibberish",
          model: "gemini-2.0-flash",
          support: { isOpen: true },
          handoffReady: false,
        })),
        handleTicketCreation: vi.fn(async () => null),
        handleEscalation: vi.fn(async () => null),
        handleDeterministicReply: vi.fn(() => null),
        generateAIResponse: vi.fn(async () => ({
          reply: "AI yaniti",
          source: "gemini",
        })),
      };

      mount(app, {
        checkRateLimit: vi.fn(() => true),
        RATE_LIMIT_WINDOW_MS: 60000,
        extractTicketMemory: vi.fn(() => ({ branchCode: "", issueSummary: "" })),
        splitActiveTicketMessages: vi.fn((msgs) => ({
          activeMessages: msgs,
          hasClosedTicketHistory: false,
          lastClosedTicketMemory: null,
        })),
        getUserMessages: vi.fn((msgs) =>
          msgs.filter((m) => m.role === "user").map((m) => m.content)
        ),
        detectInjection: vi.fn(() => ({ blocked: false })),
        GENERIC_REPLY: "Yardimci olabilir miyim?",
        upsertConversation: vi.fn(),
        loadConversations: vi.fn(() => ({ conversations: [] })),
        saveConversations: vi.fn(),
        compressConversationHistory: vi.fn(async (msgs) => msgs),
        buildConversationContext: vi.fn(async () => ({
          conversationState: "topic_detection",
          currentTopic: null,
        })),
        getSupportAvailability: vi.fn(() => ({ isOpen: true })),
        getGoogleModel: vi.fn(() => "gemini-2.0-flash"),
        recordAnalyticsEvent: vi.fn(),
        recordLLMError: vi.fn(),
        buildMissingFieldsReply: vi.fn(() => "Fallback mesaji"),
        webChatPipeline: mockPipeline,
      });

      const res = await request(app)
        .post("/api/chat")
        .send({
          messages: [{ role: "user", content: "merhaba" }],
          sessionId: "test-session-1",
        });

      expect(res.status).toBe(200);
      expect(res.body.reply).toBeDefined();
      expect(typeof res.body.reply).toBe("string");
      expect(res.body.sessionId).toBe("test-session-1");
    });
  });
});

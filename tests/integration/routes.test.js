import { describe, it, expect } from "vitest";
import express from "express";
import request from "supertest";

describe("Route Integration Tests", () => {
  describe("GET /api/health", () => {
    it("should return 200 with health status", async () => {
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
          topicsLoaded: 1,
          memoryTemplateLoaded: true,
          zendeskEnabled: false,
          zendeskSnippetConfigured: false,
          sunshineEnabled: false,
          sunshineConfigured: false,
          supportAvailability: { isOpen: true, timezone: "UTC" },
          knowledgeBaseLoaded: true,
          adminTokenRequired: false,
          tickets: { total: 0, open: 0, closed: 0 },
        }),
      });

      const res = await request(app).get("/api/health");
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.model).toBe("gemini-2.0-flash");
      expect(res.body.hasApiKey).toBe(true);
      expect(res.body.topicsLoaded).toBe(1);
      expect(res.body.agentFilesLoaded).toBe(true);
    });
  });

  describe("GET /api/config", () => {
    it("should return 200 with widget config", async () => {
      const app = express();
      const { mount } = await import("../../src/routes/widget.js");

      mount(app, {
        getSupportAvailability: () => ({ isOpen: true }),
        getZendeskEnabled: () => true,
        getZendeskSnippetKey: () => "snippet-123",
        getZendeskDefaultTags: () => ["support"],
        getAdminToken: () => "tok",
        getChatFlowConfig: () => ({ greeting: "Merhaba" }),
        getSiteConfig: () => ({ name: "Test" }),
      });

      const res = await request(app).get("/api/config");
      expect(res.status).toBe(200);
      expect(res.body.zendesk.enabled).toBe(true);
      expect(res.body.zendesk.snippetKey).toBe("snippet-123");
      expect(res.body.admin.tokenRequired).toBe(true);
      expect(res.body.chatFlow.greeting).toBe("Merhaba");
    });
  });

  describe("404 handling", () => {
    it("should return 404 for unknown API routes", async () => {
      const app = express();
      app.use(express.json());

      // Mount health route only
      const { mount } = await import("../../src/routes/health.js");
      mount(app, {
        getHealthSnapshot: () => ({ ok: false }),
      });

      // 404 handler
      app.use((_req, res) => {
        res.status(404).json({ error: "Not found" });
      });

      const res = await request(app).get("/api/nonexistent");
      expect(res.status).toBe(404);
    });
  });
});

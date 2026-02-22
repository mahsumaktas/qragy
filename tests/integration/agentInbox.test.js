import { describe, it, expect, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

const Database = require("better-sqlite3");
const { createAgentQueue } = require("../../src/services/agentQueue");
const { mount } = require("../../src/routes/agentInbox");

function createTestApp() {
  const app = express();
  app.use(express.json());

  const db = new Database(":memory:");
  db.exec(`CREATE TABLE IF NOT EXISTS agent_queue (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sessionId TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL DEFAULT 'handoff_pending',
    assignedTo TEXT,
    customerName TEXT,
    topic TEXT,
    summary TEXT,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL
  )`);

  const mockLogger = { warn: () => {}, info: () => {} };
  const agentQueue = createAgentQueue({
    sqliteDb: { getDb: () => db },
    logger: mockLogger,
  });

  const conversations = {
    "test-session-1": {
      sessionId: "test-session-1",
      status: "active",
      chatHistory: [
        { role: "user", content: "Merhaba" },
        { role: "assistant", content: "Hosgeldiniz" },
      ],
    },
  };

  const requireAdminAccess = (_req, _res, next) => next();
  const loadConversations = () => conversations;

  mount(app, { requireAdminAccess, agentQueue, loadConversations, logger: mockLogger });

  return { app, agentQueue, db };
}

describe("Agent Inbox Routes", () => {
  let app;
  let agentQueue;

  beforeEach(() => {
    const ctx = createTestApp();
    app = ctx.app;
    agentQueue = ctx.agentQueue;
  });

  it("GET /api/admin/inbox returns pending and active", async () => {
    agentQueue.enqueue("session-a", { customerName: "Ali" });
    agentQueue.enqueue("session-b", { customerName: "Veli" });
    const idB = agentQueue.getBySessionId("session-b").id;
    agentQueue.claim(idB, "admin");

    const res = await request(app).get("/api/admin/inbox");
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.pending).toHaveLength(1);
    expect(res.body.active).toHaveLength(1);
    expect(res.body.pending[0].sessionId).toBe("session-a");
    expect(res.body.active[0].sessionId).toBe("session-b");
  });

  it("POST /api/admin/inbox/:id/claim claims conversation", async () => {
    agentQueue.enqueue("session-c", { customerName: "Mehmet" });
    const item = agentQueue.getBySessionId("session-c");

    const res = await request(app)
      .post("/api/admin/inbox/" + item.id + "/claim")
      .send({ agentName: "agent-1" });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);

    const updated = agentQueue.getById(item.id);
    expect(updated.status).toBe("agent_active");
    expect(updated.assignedTo).toBe("agent-1");
  });

  it("POST /api/admin/inbox/:id/message validates message", async () => {
    agentQueue.enqueue("test-session-1", {});
    const item = agentQueue.getBySessionId("test-session-1");
    agentQueue.claim(item.id, "admin");

    // Empty message should fail
    const res1 = await request(app)
      .post("/api/admin/inbox/" + item.id + "/message")
      .send({ message: "" });
    expect(res1.status).toBe(400);

    // Missing message should fail
    const res2 = await request(app)
      .post("/api/admin/inbox/" + item.id + "/message")
      .send({});
    expect(res2.status).toBe(400);

    // Valid message should succeed
    const res3 = await request(app)
      .post("/api/admin/inbox/" + item.id + "/message")
      .send({ message: "Merhaba musteri" });
    expect(res3.status).toBe(200);
    expect(res3.body.ok).toBe(true);
  });

  it("SSE stream endpoint sets correct headers", async () => {
    const res = await request(app)
      .get("/api/admin/inbox/stream")
      .buffer(false)
      .parse((sseRes, callback) => {
        let data = "";
        sseRes.on("data", (chunk) => {
          data += chunk.toString();
          // Close after first event
          sseRes.destroy();
        });
        sseRes.on("end", () => callback(null, data));
        sseRes.on("error", () => callback(null, data));
      });

    expect(res.headers["content-type"]).toBe("text/event-stream");
    expect(res.headers["cache-control"]).toBe("no-cache");
  });
});

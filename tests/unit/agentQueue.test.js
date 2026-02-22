import { describe, it, expect, beforeEach } from "vitest";
const Database = require("better-sqlite3");
const { createAgentQueue } = require("../../src/services/agentQueue");

describe("Agent Queue Service", () => {
  let queue;
  let db;

  beforeEach(() => {
    db = new Database(":memory:");
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

    const mockSqliteDb = { getDb: () => db };
    const mockLogger = { warn: () => {}, info: () => {} };
    queue = createAgentQueue({ sqliteDb: mockSqliteDb, logger: mockLogger });
  });

  it("enqueue adds item to queue", () => {
    const id = queue.enqueue("session-1", { customerName: "Ahmet", topic: "fatura" });
    expect(id).toBeTruthy();

    const item = queue.getBySessionId("session-1");
    expect(item).not.toBeNull();
    expect(item.sessionId).toBe("session-1");
    expect(item.status).toBe("handoff_pending");
    expect(item.customerName).toBe("Ahmet");
    expect(item.topic).toBe("fatura");
  });

  it("listPending returns pending items", () => {
    queue.enqueue("session-1", { customerName: "Ali" });
    queue.enqueue("session-2", { customerName: "Veli" });

    const pending = queue.listPending();
    expect(pending).toHaveLength(2);
    expect(pending[0].sessionId).toBe("session-1");
    expect(pending[1].sessionId).toBe("session-2");
  });

  it("claim changes status to agent_active", () => {
    const id = queue.enqueue("session-1", {});
    const success = queue.claim(id, "agent-ali");
    expect(success).toBe(true);

    const item = queue.getById(id);
    expect(item.status).toBe("agent_active");
    expect(item.assignedTo).toBe("agent-ali");

    // Should not appear in pending anymore
    expect(queue.listPending()).toHaveLength(0);
    // Should appear in active
    expect(queue.listActive()).toHaveLength(1);
  });

  it("release removes item from queue", () => {
    const id = queue.enqueue("session-1", {});
    queue.claim(id, "admin");
    const released = queue.release(id);
    expect(released).toBe(true);

    const item = queue.getById(id);
    expect(item).toBeNull();
    expect(queue.listActive()).toHaveLength(0);
  });

  it("enqueue is idempotent for same sessionId", () => {
    const id1 = queue.enqueue("session-1", { customerName: "Ali" });
    const id2 = queue.enqueue("session-1", { customerName: "Ali" });
    expect(id1).toBe(id2);

    // Should have only one item
    const pending = queue.listPending();
    expect(pending).toHaveLength(1);
  });

  it("claim fails for already claimed item", () => {
    const id = queue.enqueue("session-1", {});
    const first = queue.claim(id, "agent-1");
    expect(first).toBe(true);

    const second = queue.claim(id, "agent-2");
    expect(second).toBe(false);
  });
});

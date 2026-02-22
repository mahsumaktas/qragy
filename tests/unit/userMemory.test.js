import { describe, it, expect, beforeEach } from "vitest";
const Database = require("better-sqlite3");
const { createUserMemory } = require("../../src/services/userMemory");

describe("User Memory Service", () => {
  let userMem;
  let db;

  beforeEach(() => {
    db = new Database(":memory:");
    db.exec(`CREATE TABLE IF NOT EXISTS user_memory (
      userId TEXT NOT NULL,
      key TEXT NOT NULL,
      value TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      PRIMARY KEY (userId, key)
    )`);

    const mockSqliteDb = { getDb: () => db };
    const mockLogger = { warn: () => {} };
    userMem = createUserMemory({ sqliteDb: mockSqliteDb, logger: mockLogger });
  });

  it("save and get a value", () => {
    userMem.save("user1", "name", "Ahmet");
    expect(userMem.get("user1", "name")).toBe("Ahmet");
  });

  it("getAll returns all keys for user", () => {
    userMem.save("user1", "name", "Mehmet");
    userMem.save("user1", "branch", "IST-001");
    userMem.save("user1", "phone", "5551234567");

    const all = userMem.getAll("user1");
    expect(Object.keys(all)).toHaveLength(3);
    expect(all.name).toBe("Mehmet");
    expect(all.branch).toBe("IST-001");
    expect(all.phone).toBe("5551234567");
  });

  it("save updates existing key", () => {
    userMem.save("user1", "name", "Ali");
    userMem.save("user1", "name", "Veli");
    expect(userMem.get("user1", "name")).toBe("Veli");
  });

  it("get returns null for non-existent key", () => {
    expect(userMem.get("user1", "nonexistent")).toBeNull();
    expect(userMem.get("nonexistent-user", "name")).toBeNull();
  });

  it("prune keeps only MAX_KEYS_PER_USER entries", () => {
    // Insert more than MAX_KEYS_PER_USER entries
    for (let i = 0; i < userMem.MAX_KEYS_PER_USER + 10; i++) {
      // Use direct db insert to bypass sanitization and set controlled timestamps
      db.prepare(
        "INSERT OR REPLACE INTO user_memory (userId, key, value, updatedAt) VALUES (?, ?, ?, ?)"
      ).run("user1", `key${String(i).padStart(3, "0")}`, `value${i}`, new Date(Date.now() + i * 1000).toISOString());
    }

    // Verify we have more than limit
    const countBefore = db.prepare("SELECT COUNT(*) as cnt FROM user_memory WHERE userId = ?").get("user1").cnt;
    expect(countBefore).toBe(userMem.MAX_KEYS_PER_USER + 10);

    userMem.prune("user1");

    const countAfter = db.prepare("SELECT COUNT(*) as cnt FROM user_memory WHERE userId = ?").get("user1").cnt;
    expect(countAfter).toBe(userMem.MAX_KEYS_PER_USER);
  });

  it("prompt injection guard - sanitizes key names", () => {
    userMem.save("user1", "valid-key_123", "ok");
    expect(userMem.get("user1", "valid-key_123")).toBe("ok");

    // Special characters should be stripped
    userMem.save("user1", "key'; DROP TABLE --", "hacked");
    // After sanitization, the key becomes "keyDROPTABLE--"
    const sanitized = "keyDROPTABLE--".replace(/[^a-zA-Z0-9_-]/g, "");
    const result = userMem.get("user1", sanitized);
    expect(result).toBe("hacked");

    // Pure special characters key should be silently ignored
    userMem.save("user1", "!!!@@@", "ignored");
    expect(userMem.get("user1", "")).toBeNull();
  });

  it("MAX_VALUE_LENGTH truncation", () => {
    const longValue = "x".repeat(2000);
    userMem.save("user1", "longval", longValue);
    const stored = userMem.get("user1", "longval");
    expect(stored.length).toBe(userMem.MAX_VALUE_LENGTH);
  });

  it("separate users have separate memory", () => {
    userMem.save("userA", "name", "Alice");
    userMem.save("userB", "name", "Bob");

    expect(userMem.get("userA", "name")).toBe("Alice");
    expect(userMem.get("userB", "name")).toBe("Bob");

    const allA = userMem.getAll("userA");
    const allB = userMem.getAll("userB");
    expect(Object.keys(allA)).toHaveLength(1);
    expect(Object.keys(allB)).toHaveLength(1);
    expect(allA.name).toBe("Alice");
    expect(allB.name).toBe("Bob");
  });
});

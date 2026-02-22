import { describe, it, expect, vi, beforeEach } from "vitest";
const { createCoreMemory, CORE_MEMORY_TOKEN_BUDGET, CHARS_PER_TOKEN } = require("../../src/services/memory/coreMemory");

function makeDeps(overrides = {}) {
  const memoryStore = {};
  return {
    sqliteDb: {
      getUserMemory: vi.fn((userId) => memoryStore[userId] || {}),
      saveUserMemory: vi.fn((userId, key, value) => {
        if (!memoryStore[userId]) memoryStore[userId] = {};
        memoryStore[userId][key] = value;
      }),
    },
    callLLM: vi.fn(async () => ({ reply: "{}" })),
    getProviderConfig: vi.fn(() => ({ provider: "openai", apiKey: "test-key" })),
    logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
    _memoryStore: memoryStore,
    ...overrides,
  };
}

describe("Core Memory Service", () => {
  let deps;
  let coreMem;

  beforeEach(() => {
    deps = makeDeps();
    coreMem = createCoreMemory(deps);
  });

  it("load returns user profile from SQLite", () => {
    deps._memoryStore["user1"] = { name: "Ahmet", branch: "IST-001" };

    const profile = coreMem.load("user1");

    expect(deps.sqliteDb.getUserMemory).toHaveBeenCalledWith("user1");
    expect(profile).toEqual({ name: "Ahmet", branch: "IST-001" });
  });

  it("load returns empty object for unknown user", () => {
    const profile = coreMem.load("unknown-user");

    expect(deps.sqliteDb.getUserMemory).toHaveBeenCalledWith("unknown-user");
    expect(profile).toEqual({});
  });

  it("save persists key-value to SQLite", () => {
    coreMem.save("user1", "name", "Mehmet");

    expect(deps.sqliteDb.saveUserMemory).toHaveBeenCalledWith("user1", "name", "Mehmet");
  });

  it("autoExtract extracts profile from chat history", async () => {
    const chatHistory = [
      { role: "user", parts: [{ text: "Merhaba, ben Ahmet. ABC sirketinden ariyorum." }] },
      { role: "assistant", parts: [{ text: "Merhaba Ahmet, size nasil yardimci olabilirim?" }] },
      { role: "user", content: "IST-001 subemden ariyorum." },
    ];

    deps.callLLM.mockResolvedValue({
      reply: JSON.stringify({ name: "Ahmet", company: "ABC", branch: "IST-001" }),
    });

    await coreMem.autoExtract("user1", chatHistory);

    expect(deps.callLLM).toHaveBeenCalledTimes(1);
    // Verify save was called for each extracted field
    expect(deps.sqliteDb.saveUserMemory).toHaveBeenCalledWith("user1", "name", "Ahmet");
    expect(deps.sqliteDb.saveUserMemory).toHaveBeenCalledWith("user1", "company", "ABC");
    expect(deps.sqliteDb.saveUserMemory).toHaveBeenCalledWith("user1", "branch", "IST-001");
  });

  it("autoExtract handles LLM failure gracefully", async () => {
    const chatHistory = [
      { role: "user", parts: [{ text: "Merhaba" }] },
    ];

    deps.callLLM.mockRejectedValue(new Error("LLM timeout"));

    // Should not throw
    await expect(coreMem.autoExtract("user1", chatHistory)).resolves.toBeUndefined();
    expect(deps.logger.warn).toHaveBeenCalledWith(
      "coreMemory",
      "autoExtract failed",
      expect.any(Error)
    );
  });

  it("formatForPrompt returns formatted string within token budget", () => {
    deps._memoryStore["user1"] = {
      name: "Ahmet",
      branch: "IST-001",
      company: "ABC Ltd",
      phone: "5551234567",
    };

    const result = coreMem.formatForPrompt("user1");

    expect(result).toContain("--- KULLANICI PROFILI ---");
    expect(result).toContain("name: Ahmet");
    expect(result).toContain("branch: IST-001");

    // Respect token budget
    const maxChars = Math.floor(CORE_MEMORY_TOKEN_BUDGET * CHARS_PER_TOKEN);
    expect(result.length).toBeLessThanOrEqual(maxChars);
  });
});

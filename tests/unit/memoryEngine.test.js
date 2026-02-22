const { createMemoryEngine } = require("../../src/services/memory/memoryEngine.js");

function makeMocks() {
  const coreMemory = {
    load: vi.fn().mockResolvedValue({ name: "Ahmet", branch: "IST-01" }),
    save: vi.fn().mockResolvedValue(undefined),
    autoExtract: vi.fn().mockResolvedValue(undefined),
    formatForPrompt: vi.fn().mockResolvedValue("[Core: Ahmet, IST-01]"),
  };

  const recallMemory = {
    save: vi.fn().mockResolvedValue(undefined),
    search: vi.fn().mockResolvedValue([]),
    formatForPrompt: vi.fn().mockResolvedValue("[Recall: onceki yazici sorunu]"),
  };

  const logger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };

  return { coreMemory, recallMemory, logger };
}

describe("MemoryEngine", () => {
  it("loadContext returns core + recall memory when requiresMemory is true", async () => {
    const mocks = makeMocks();
    const engine = createMemoryEngine(mocks);

    const result = await engine.loadContext("user-1", "yazici sorunu", { requiresMemory: true });

    expect(result.coreMemory).toBe("[Core: Ahmet, IST-01]");
    expect(result.recallMemory).toBe("[Recall: onceki yazici sorunu]");
    expect(mocks.coreMemory.formatForPrompt).toHaveBeenCalledWith("user-1", 500);
    expect(mocks.recallMemory.formatForPrompt).toHaveBeenCalledWith("yazici sorunu", "user-1", 1000);
  });

  it("loadContext skips recall when requiresMemory is false", async () => {
    const mocks = makeMocks();
    const engine = createMemoryEngine(mocks);

    const result = await engine.loadContext("user-1", "merhaba", { requiresMemory: false });

    expect(result.coreMemory).toBe("[Core: Ahmet, IST-01]");
    expect(result.recallMemory).toBe("");
    expect(mocks.coreMemory.formatForPrompt).toHaveBeenCalled();
    expect(mocks.recallMemory.formatForPrompt).not.toHaveBeenCalled();
  });

  it("updateAfterConversation calls autoExtract and saves recall", async () => {
    const mocks = makeMocks();
    const engine = createMemoryEngine(mocks);

    const chatHistory = [
      { role: "user", content: "Yazicim calismiyor" },
      { role: "assistant", content: "Anladim, kontrol edelim" },
    ];

    await engine.updateAfterConversation("user-1", "sess-1", chatHistory, "Yazici sorunu bildirdi");

    expect(mocks.coreMemory.autoExtract).toHaveBeenCalledWith("user-1", chatHistory);
    expect(mocks.recallMemory.save).toHaveBeenCalledWith("user-1", "sess-1", "Yazici sorunu bildirdi");
  });

  it("getCoreProfile returns user profile", async () => {
    const mocks = makeMocks();
    const engine = createMemoryEngine(mocks);

    const profile = await engine.getCoreProfile("user-1");

    expect(profile).toEqual({ name: "Ahmet", branch: "IST-01" });
    expect(mocks.coreMemory.load).toHaveBeenCalledWith("user-1");
  });
});

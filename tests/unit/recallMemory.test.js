import { describe, it, expect, vi, beforeEach } from "vitest";
const { createRecallMemory } = require("../../src/services/memory/recallMemory");

describe("Recall Memory Service", () => {
  let recallMemory;
  let mockSqliteDb;
  let mockLogger;

  beforeEach(() => {
    mockSqliteDb = {
      saveRecallMemory: vi.fn(),
      searchRecallMemory: vi.fn().mockReturnValue([]),
    };
    mockLogger = { warn: vi.fn() };
    recallMemory = createRecallMemory({ sqliteDb: mockSqliteDb, logger: mockLogger });
  });

  it("save stores conversation summary", () => {
    recallMemory.save("user1", "sess-1", "Musteri fatura sorunu bildirdi", "summary");

    expect(mockSqliteDb.saveRecallMemory).toHaveBeenCalledTimes(1);
    const args = mockSqliteDb.saveRecallMemory.mock.calls[0];
    expect(args[0]).toMatch(/^rm-[a-f0-9]{8}$/);
    expect(args[1]).toBe("user1");
    expect(args[2]).toBe("sess-1");
    expect(args[3]).toBe("summary");
    expect(args[4]).toBe("Musteri fatura sorunu bildirdi");
  });

  it("search returns FTS5 results", () => {
    const mockResults = [
      { id: "rm-abc12345", userId: "user1", type: "summary", content: "Fatura ile ilgili konusma" },
      { id: "rm-def67890", userId: "user1", type: "summary", content: "Fatura odeme sorunu" },
    ];
    mockSqliteDb.searchRecallMemory.mockReturnValue(mockResults);

    const results = recallMemory.search("fatura", "user1");

    expect(mockSqliteDb.searchRecallMemory).toHaveBeenCalledWith("fatura", "user1", 5);
    expect(results).toHaveLength(2);
    expect(results[0].content).toContain("Fatura");
  });

  it("search returns empty on no match", () => {
    mockSqliteDb.searchRecallMemory.mockReturnValue([]);

    const results = recallMemory.search("nonexistent", "user1");

    expect(results).toEqual([]);
  });

  it("formatForPrompt returns formatted recall results", () => {
    mockSqliteDb.searchRecallMemory.mockReturnValue([
      { id: "rm-1", userId: "user1", type: "summary", content: "Musteri kargo durumunu sordu" },
      { id: "rm-2", userId: "user1", type: "complaint", content: "Geciken siparis hakkinda sikayet" },
    ]);

    const prompt = recallMemory.formatForPrompt("kargo", "user1");

    expect(prompt).toContain("GECMIS KONUSMALAR");
    expect(prompt).toContain("[summary] Musteri kargo durumunu sordu");
    expect(prompt).toContain("[complaint] Geciken siparis hakkinda sikayet");
    expect(prompt.startsWith("--- GECMIS KONUSMALAR ---")).toBe(true);
    expect(prompt.endsWith("---")).toBe(true);
  });

  it("formatForPrompt returns empty string when no results", () => {
    mockSqliteDb.searchRecallMemory.mockReturnValue([]);

    const prompt = recallMemory.formatForPrompt("nonexistent", "user1");

    expect(prompt).toBe("");
  });
});

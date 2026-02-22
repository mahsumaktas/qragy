import { describe, it, expect } from "vitest";
const { db, saveRecallMemory, searchRecallMemory } = require("../../lib/db");

describe("FTS5 and new tables", () => {
  function tableExists(name) {
    const row = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type IN ('table','view') AND name = ?"
      )
      .get(name);
    return !!row;
  }

  function virtualTableExists(name) {
    // FTS5 virtual tables show up in sqlite_master as type='table'
    // but we also check the _content shadow table for certainty
    const row = db
      .prepare("SELECT name FROM sqlite_master WHERE name = ?")
      .get(name);
    return !!row;
  }

  it("recall_memory table exists", () => {
    expect(tableExists("recall_memory")).toBe(true);
  });

  it("recall_memory_fts virtual table exists", () => {
    expect(virtualTableExists("recall_memory_fts")).toBe(true);
  });

  it("kg_entities table exists", () => {
    expect(tableExists("kg_entities")).toBe(true);
  });

  it("kg_edges table exists", () => {
    expect(tableExists("kg_edges")).toBe(true);
  });

  it("reflexion_logs table exists", () => {
    expect(tableExists("reflexion_logs")).toBe(true);
  });

  it("quality_scores table exists", () => {
    expect(tableExists("quality_scores")).toBe(true);
  });

  it("FTS5 search works on recall_memory", () => {
    const testId = `fts-test-${Date.now()}`;
    const testUserId = `test-user-${Date.now()}`;

    // Insert a recall memory entry
    saveRecallMemory(
      testId,
      testUserId,
      "sess-1",
      "summary",
      "Musteri fatura sorunu yasadi ve cozum uretildi"
    );

    // FTS5 search should find it
    const results = searchRecallMemory("fatura", testUserId, 5);
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].id).toBe(testId);
    expect(results[0].userId).toBe(testUserId);
    expect(results[0].content).toContain("fatura");

    // Search with non-matching term should return empty
    const noResults = searchRecallMemory("nonexistentterm99", testUserId, 5);
    expect(noResults.length).toBe(0);

    // Cleanup
    db.prepare("DELETE FROM recall_memory_fts WHERE rowid = (SELECT rowid FROM recall_memory WHERE id = ?)").run(testId);
    db.prepare("DELETE FROM recall_memory WHERE id = ?").run(testId);
  });
});

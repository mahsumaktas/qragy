const { createGraphQuery } = require("../../src/services/intelligence/graphQuery.js");

const noopLogger = { info() {}, warn() {}, error() {} };

const sampleEdges = [
  { sourceName: "ZT-400", sourceType: "product", relation: "has_issue", targetName: "Kagit Sikismasi", targetType: "issue_type" },
  { sourceName: "ZT-400", sourceType: "product", relation: "located_at", targetName: "Sube-42", targetType: "branch" },
];

describe("graphQuery", () => {
  it("query returns related entities", async () => {
    const queryEdgesByEntity = vi.fn().mockResolvedValue(sampleEdges);

    const gq = createGraphQuery({
      sqliteDb: { queryEdgesByEntity },
      logger: noopLogger,
    });

    const result = await gq.query("ZT-400");

    expect(queryEdgesByEntity).toHaveBeenCalledWith("ZT-400", 10);
    expect(result).toHaveLength(2);
    expect(result[0].relation).toBe("has_issue");
    expect(result[1].targetName).toBe("Sube-42");
  });

  it("formatForPrompt returns formatted graph context", async () => {
    const queryEdgesByEntity = vi.fn().mockResolvedValue(sampleEdges);

    const gq = createGraphQuery({
      sqliteDb: { queryEdgesByEntity },
      logger: noopLogger,
    });

    const prompt = await gq.formatForPrompt("ZT-400");

    expect(prompt).toContain("BILGI GRAFI");
    expect(prompt).toContain("ZT-400");
    expect(prompt).toContain("Kagit Sikismasi");
    expect(prompt).toContain("has_issue");
    expect(prompt).toContain("Sube-42");
    expect(prompt).toContain("--[");
    expect(prompt).toContain("]--> ");
    expect(prompt).toContain("---");
  });

  it("returns empty for unknown entity", async () => {
    const queryEdgesByEntity = vi.fn().mockResolvedValue([]);

    const gq = createGraphQuery({
      sqliteDb: { queryEdgesByEntity },
      logger: noopLogger,
    });

    const result = await gq.query("BilinmeyenEntity");
    expect(result).toEqual([]);

    const prompt = await gq.formatForPrompt("BilinmeyenEntity");
    expect(prompt).toBe("");
  });
});

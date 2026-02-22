const { createGraphBuilder } = require("../../src/services/intelligence/graphBuilder.js");

const noopLogger = { info() {}, warn() {}, error() {} };

function makeLLMResponse(entities, relationships) {
  return {
    reply: JSON.stringify({ entities, relationships }),
  };
}

describe("graphBuilder", () => {
  it("extractAndStore extracts entities and edges from ticket", async () => {
    const entities = [
      { name: "ZT-400", type: "product" },
      { name: "Kagit Sikismasi", type: "issue_type" },
      { name: "Sube-42", type: "branch" },
    ];
    const relationships = [
      { source: "ZT-400", target: "Kagit Sikismasi", relation: "has_issue" },
      { source: "Sube-42", target: "ZT-400", relation: "has_device" },
    ];

    const callLLM = vi.fn().mockResolvedValue(makeLLMResponse(entities, relationships));
    const getProviderConfig = vi.fn().mockReturnValue({ provider: "test" });

    let entityIdCounter = 1;
    const upsertEntity = vi.fn().mockImplementation((name, type) => ({
      id: entityIdCounter++,
      name,
      type,
    }));
    const insertEdge = vi.fn().mockResolvedValue({});

    const builder = createGraphBuilder({
      callLLM,
      getProviderConfig,
      sqliteDb: { upsertEntity, insertEdge },
      logger: noopLogger,
    });

    await builder.extractAndStore({ summary: "ZT-400 kagit sikismasi, Sube-42", branchCode: "42" });

    expect(callLLM).toHaveBeenCalledOnce();
    expect(upsertEntity).toHaveBeenCalledTimes(3);
    expect(upsertEntity).toHaveBeenCalledWith("ZT-400", "product", {});
    expect(upsertEntity).toHaveBeenCalledWith("Kagit Sikismasi", "issue_type", {});
    expect(upsertEntity).toHaveBeenCalledWith("Sube-42", "branch", {});

    expect(insertEdge).toHaveBeenCalledTimes(2);
    // First edge: ZT-400 (id=1) -> Kagit Sikismasi (id=2), relation=has_issue
    expect(insertEdge).toHaveBeenCalledWith(1, 2, "has_issue", 1.0, { branchCode: "42" });
    // Second edge: Sube-42 (id=3) -> ZT-400 (id=1) — but ZT-400 already upserted, gets id=1
    // Actually upsert is called again for ZT-400 in edge lookup from entityMap
    // entityMap is built from upsert results: ZT-400->id=1, Kagit Sikismasi->id=2, Sube-42->id=3
    expect(insertEdge).toHaveBeenCalledWith(3, 1, "has_device", 1.0, { branchCode: "42" });
  });

  it("handles LLM failure gracefully", async () => {
    const callLLM = vi.fn().mockRejectedValue(new Error("LLM timeout"));
    const getProviderConfig = vi.fn().mockReturnValue({});
    const upsertEntity = vi.fn();
    const insertEdge = vi.fn();
    const warnSpy = vi.fn();

    const builder = createGraphBuilder({
      callLLM,
      getProviderConfig,
      sqliteDb: { upsertEntity, insertEdge },
      logger: { ...noopLogger, warn: warnSpy },
    });

    // Should not throw
    await builder.extractAndStore({ summary: "test", branchCode: "1" });

    expect(upsertEntity).not.toHaveBeenCalled();
    expect(insertEdge).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalled();
  });
});

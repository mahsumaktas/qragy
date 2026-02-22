const { createReflexion } = require("../../src/services/intelligence/reflexion.js");

function makeDeps(overrides = {}) {
  return {
    callLLM: overrides.callLLM || vi.fn(),
    getProviderConfig: overrides.getProviderConfig || vi.fn(() => ({
      model: "test-model",
      apiKey: "test-key",
      provider: "test",
    })),
    sqliteDb: overrides.sqliteDb || {
      saveReflexionLog: vi.fn(),
      searchReflexionByTopic: vi.fn().mockResolvedValue([]),
    },
    logger: { info() {}, warn() {}, error() {} },
  };
}

describe("reflexion", () => {
  it("analyze creates reflexion log from negative feedback", async () => {
    const saveReflexionLog = vi.fn();
    const callLLM = vi.fn().mockResolvedValue({
      reply: JSON.stringify({
        topic: "kargo takip",
        errorType: "wrong_info",
        analysis: "Yanlis kargo kodu verilmis",
        correctInfo: "Kargo kodu 5 haneli olmalidir",
      }),
    });

    const reflexion = createReflexion(makeDeps({
      callLLM,
      sqliteDb: {
        saveReflexionLog,
        searchReflexionByTopic: vi.fn(),
      },
    }));

    await reflexion.analyze({
      sessionId: "sess-1",
      query: "kargo kodum nedir",
      answer: "Kargo kodunuz 123",
      ragResults: [{ answer: "Kargo kodlari 5 haneli olur" }],
    });

    expect(callLLM).toHaveBeenCalledOnce();
    expect(saveReflexionLog).toHaveBeenCalledOnce();

    const saved = saveReflexionLog.mock.calls[0][0];
    expect(saved.sessionId).toBe("sess-1");
    expect(saved.topic).toBe("kargo takip");
    expect(saved.errorType).toBe("wrong_info");
    expect(saved.analysis).toBe("Yanlis kargo kodu verilmis");
    expect(saved.correctInfo).toBe("Kargo kodu 5 haneli olmalidir");
    expect(saved.createdAt).toBeDefined();
  });

  it("getWarnings returns past reflexion for similar topic", async () => {
    const searchReflexionByTopic = vi.fn().mockResolvedValue([
      {
        topic: "iade sureci",
        analysis: "Iade suresi 14 gun degil 30 gun",
        correctInfo: "Iade suresi 30 gundur",
      },
      {
        topic: "iade kosullari",
        analysis: "Urun acilmamis olmali",
        correctInfo: "Ambalaj bozulmamis olmali",
      },
    ]);

    const reflexion = createReflexion(makeDeps({
      sqliteDb: {
        saveReflexionLog: vi.fn(),
        searchReflexionByTopic,
      },
    }));

    const result = await reflexion.getWarnings("iade");

    expect(searchReflexionByTopic).toHaveBeenCalledWith("iade", 3);
    expect(result).toContain("GECMIS HATALAR (Reflexion)");
    expect(result).toContain("DIKKAT: Iade suresi 14 gun degil 30 gun");
    expect(result).toContain("Dogru bilgi: Iade suresi 30 gundur");
    expect(result).toContain("DIKKAT: Urun acilmamis olmali");
    expect(result).toContain("Dogru bilgi: Ambalaj bozulmamis olmali");
  });

  it("getWarnings finds partial topic matches via LIKE", async () => {
    const searchReflexionByTopic = vi.fn().mockResolvedValue([
      { id: 1, topic: "kargo takip sureci", analysis: "Yanlis bilgi", correctInfo: "Dogru bilgi" },
    ]);

    const reflexion = createReflexion(makeDeps({
      sqliteDb: { saveReflexionLog: vi.fn(), searchReflexionByTopic },
    }));

    const result = await reflexion.getWarnings("kargo");

    expect(searchReflexionByTopic).toHaveBeenCalledWith("kargo", 3);
    expect(result).toContain("DIKKAT: Yanlis bilgi");
  });

  it("getWarnings searches both topic and standaloneQuery", async () => {
    const searchReflexionByTopic = vi.fn()
      .mockResolvedValueOnce([{ id: 1, topic: "iade", analysis: "A1", correctInfo: "" }])
      .mockResolvedValueOnce([{ id: 2, topic: "geri gonder", analysis: "A2", correctInfo: "" }]);

    const reflexion = createReflexion(makeDeps({
      sqliteDb: { saveReflexionLog: vi.fn(), searchReflexionByTopic },
    }));

    const result = await reflexion.getWarnings("iade", { standaloneQuery: "urunu geri gonder" });

    expect(searchReflexionByTopic).toHaveBeenCalledTimes(2);
    expect(result).toContain("A1");
    expect(result).toContain("A2");
  });

  it("getWarnings deduplicates results from topic and standaloneQuery", async () => {
    const sharedResult = { id: 1, topic: "iade", analysis: "Ayni", correctInfo: "" };
    const searchReflexionByTopic = vi.fn()
      .mockResolvedValueOnce([sharedResult])
      .mockResolvedValueOnce([sharedResult]);

    const reflexion = createReflexion(makeDeps({
      sqliteDb: { saveReflexionLog: vi.fn(), searchReflexionByTopic },
    }));

    const result = await reflexion.getWarnings("iade", { standaloneQuery: "iade islemi" });

    // Should only appear once despite being returned by both searches
    const matches = result.match(/DIKKAT: Ayni/g);
    expect(matches).toHaveLength(1);
  });

  it("getWarnings returns empty string when no past reflexion", async () => {
    const searchReflexionByTopic = vi.fn().mockResolvedValue([]);

    const reflexion = createReflexion(makeDeps({
      sqliteDb: {
        saveReflexionLog: vi.fn(),
        searchReflexionByTopic,
      },
    }));

    const result = await reflexion.getWarnings("bilinmeyen konu");

    expect(result).toBe("");
  });

  it("analyze handles LLM failure gracefully", async () => {
    const callLLM = vi.fn().mockRejectedValue(new Error("LLM timeout"));
    const saveReflexionLog = vi.fn();

    const reflexion = createReflexion(makeDeps({
      callLLM,
      sqliteDb: {
        saveReflexionLog,
        searchReflexionByTopic: vi.fn(),
      },
    }));

    // Should not throw
    await reflexion.analyze({
      sessionId: "sess-2",
      query: "test sorusu",
      answer: "test cevabi",
      ragResults: [],
    });

    expect(callLLM).toHaveBeenCalledOnce();
    expect(saveReflexionLog).not.toHaveBeenCalled();
  });
});

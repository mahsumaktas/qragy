const { createQualityScorer } = require("../../src/services/intelligence/qualityScorer.js");

function makeDeps(overrides = {}) {
  return {
    callLLM: overrides.callLLM || vi.fn(),
    getProviderConfig: overrides.getProviderConfig || vi.fn(() => ({
      model: "test-model",
      apiKey: "test-key",
      provider: "test",
    })),
    sqliteDb: overrides.sqliteDb || { saveQualityScore: vi.fn().mockResolvedValue() },
    logger: { info() {}, warn() {}, error() {} },
  };
}

const sampleRagResults = [
  { _rerankScore: 0.9, answer: "Ayarlar > Yazicilar > Ekle ile kurulur" },
  { _rerankScore: 0.7, answer: "Surucu indirilmeli" },
  { _rerankScore: 0.8, answer: "USB ile baglayin" },
];

describe("qualityScorer", () => {
  it("score returns faithfulness, relevancy, confidence", async () => {
    const callLLM = vi.fn().mockResolvedValue({
      reply: JSON.stringify({ faithfulness: 0.9, relevancy: 0.85 }),
    });
    const scorer = createQualityScorer(makeDeps({ callLLM }));

    const result = await scorer.score({
      query: "yazici nasil kurulur",
      answer: "Ayarlar > Yazicilar > Ekle ile kurabilirsiniz",
      ragResults: sampleRagResults,
      sessionId: "sess-1",
      messageId: "msg-1",
    });

    expect(result.faithfulness).toBe(0.9);
    expect(result.relevancy).toBe(0.85);
    expect(result.confidence).toBeGreaterThan(0);
    expect(result.ragResultCount).toBe(3);
    expect(result.avgRerankScore).toBeGreaterThan(0);
    expect(result.isLowQuality).toBe(false);
    expect(result.sessionId).toBe("sess-1");
    expect(result.messageId).toBe("msg-1");
    expect(callLLM).toHaveBeenCalledOnce();
  });

  it("isLowQuality true when scores below threshold", async () => {
    const callLLM = vi.fn().mockResolvedValue({
      reply: JSON.stringify({ faithfulness: 0.3, relevancy: 0.2 }),
    });
    const scorer = createQualityScorer(makeDeps({ callLLM }));

    const result = await scorer.score({
      query: "fatura nasil kesilir",
      answer: "Bilemiyorum",
      ragResults: [{ _rerankScore: 0.1, answer: "Hava durumu gunesli" }],
      sessionId: "sess-2",
      messageId: "msg-2",
    });

    expect(result.faithfulness).toBe(0.3);
    expect(result.relevancy).toBe(0.2);
    expect(result.isLowQuality).toBe(true);
  });

  it("handles LLM failure gracefully", async () => {
    const callLLM = vi.fn().mockRejectedValue(new Error("LLM timeout"));
    const scorer = createQualityScorer(makeDeps({ callLLM }));

    const result = await scorer.score({
      query: "kargo nerede",
      answer: "Takip numaranizi girin",
      ragResults: sampleRagResults,
      sessionId: "sess-3",
      messageId: "msg-3",
    });

    expect(result.faithfulness).toBeNull();
    expect(result.relevancy).toBeNull();
    expect(result.isLowQuality).toBe(false);
    expect(result.confidence).toBeGreaterThan(0);
  });

  it("persists score to SQLite", async () => {
    const callLLM = vi.fn().mockResolvedValue({
      reply: JSON.stringify({ faithfulness: 0.8, relevancy: 0.75 }),
    });
    const saveQualityScore = vi.fn().mockResolvedValue();
    const scorer = createQualityScorer(makeDeps({
      callLLM,
      sqliteDb: { saveQualityScore },
    }));

    await scorer.score({
      query: "iade nasil yapilir",
      answer: "Iade formu doldurmaniz gerekiyor",
      ragResults: sampleRagResults,
      sessionId: "sess-4",
      messageId: "msg-4",
    });

    expect(saveQualityScore).toHaveBeenCalledOnce();
    expect(saveQualityScore).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: "sess-4",
        messageId: "msg-4",
        faithfulness: 0.8,
        relevancy: 0.75,
        ragResultCount: 3,
      }),
    );
  });
});

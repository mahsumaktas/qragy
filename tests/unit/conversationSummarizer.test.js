const { createConversationSummarizer } = require("../../src/services/conversationSummarizer.js");

function makeSummarizer(overrides = {}) {
  return createConversationSummarizer({
    callLLM: overrides.callLLM || vi.fn().mockResolvedValue("Musteri Ankara subesiyle ilgili sorun bildirdi. Sube kodu 123. Temsilci bilgi verdi."),
    getProviderConfig: overrides.getProviderConfig || (() => ({
      model: "test-model",
      apiKey: "test-key",
      provider: "test",
      baseUrl: "",
    })),
    getChatFlowConfig: overrides.getChatFlowConfig || (() => ({
      conversationSummaryEnabled: true,
      summaryThreshold: 15,
    })),
    logger: { info() {}, warn() {}, error() {} },
  });
}

function buildHistory(count) {
  const history = [];
  for (let i = 0; i < count; i++) {
    history.push({
      role: i % 2 === 0 ? "user" : "assistant",
      content: `Mesaj ${i + 1}`,
    });
  }
  return history;
}

describe("conversationSummarizer", () => {
  it("does not summarize below threshold", async () => {
    const summarizer = makeSummarizer();
    const history = buildHistory(10);

    const result = await summarizer.summarize(history);

    expect(result.summary).toBeNull();
    expect(result.trimmedHistory).toEqual(history);
  });

  it("summarizes at threshold", async () => {
    const mockCallLLM = vi.fn().mockResolvedValue("Musteri sube kodu 123 ile ilgili sorun bildirdi. Temsilci bilgi verdi ve cozum onerdi.");
    const summarizer = makeSummarizer({ callLLM: mockCallLLM });
    const history = buildHistory(16);

    const result = await summarizer.summarize(history);

    expect(result.summary).toBeTruthy();
    expect(result.summary.length).toBeGreaterThan(20);
    expect(result.trimmedHistory.length).toBe(9); // 1 summary + 8 recent
    expect(result.trimmedHistory[0].content).toContain("[Konusma ozeti:");
    expect(mockCallLLM).toHaveBeenCalledTimes(1);
  });

  it("returns null summary when disabled", async () => {
    const summarizer = makeSummarizer({
      getChatFlowConfig: () => ({
        conversationSummaryEnabled: false,
        summaryThreshold: 15,
      }),
    });
    const history = buildHistory(20);

    const result = await summarizer.summarize(history);

    expect(result.summary).toBeNull();
    expect(result.trimmedHistory).toEqual(history);
  });

  it("handles empty history", async () => {
    const summarizer = makeSummarizer();

    const result = await summarizer.summarize([]);
    expect(result.summary).toBeNull();
    expect(result.trimmedHistory).toEqual([]);

    const resultNull = await summarizer.summarize(null);
    expect(resultNull.summary).toBeNull();
    expect(resultNull.trimmedHistory).toEqual([]);
  });

  it("fallback when LLM fails", async () => {
    const mockCallLLM = vi.fn().mockRejectedValue(new Error("API timeout"));
    const summarizer = makeSummarizer({ callLLM: mockCallLLM });
    const history = buildHistory(16);

    const result = await summarizer.summarize(history);

    expect(result.summary).toBeNull();
    expect(result.trimmedHistory).toEqual(history);
  });

  it("custom threshold from config", async () => {
    const summarizer = makeSummarizer({
      getChatFlowConfig: () => ({
        conversationSummaryEnabled: true,
        summaryThreshold: 20,
      }),
    });

    // 18 messages - below custom threshold of 20
    const historyBelow = buildHistory(18);
    const resultBelow = await summarizer.summarize(historyBelow);
    expect(resultBelow.summary).toBeNull();

    // 22 messages - above custom threshold of 20
    const mockCallLLM = vi.fn().mockResolvedValue("Uzun konusma ozeti burada yer almaktadir.");
    const summarizerAbove = makeSummarizer({
      callLLM: mockCallLLM,
      getChatFlowConfig: () => ({
        conversationSummaryEnabled: true,
        summaryThreshold: 20,
      }),
    });
    const historyAbove = buildHistory(22);
    const resultAbove = await summarizerAbove.summarize(historyAbove);
    expect(resultAbove.summary).toBeTruthy();
    expect(resultAbove.trimmedHistory.length).toBe(9); // 1 summary + 8 recent
  });

  it("shouldSummarize returns correct boolean", async () => {
    const summarizer = makeSummarizer();

    expect(await summarizer.shouldSummarize(buildHistory(10))).toBe(false);
    expect(await summarizer.shouldSummarize(buildHistory(15))).toBe(true);
    expect(await summarizer.shouldSummarize(buildHistory(20))).toBe(true);
    expect(await summarizer.shouldSummarize(null)).toBe(false);
    expect(await summarizer.shouldSummarize([])).toBe(false);
  });

  it("shouldSummarize returns false when disabled", async () => {
    const summarizer = makeSummarizer({
      getChatFlowConfig: () => ({
        conversationSummaryEnabled: false,
        summaryThreshold: 15,
      }),
    });

    expect(await summarizer.shouldSummarize(buildHistory(20))).toBe(false);
  });
});

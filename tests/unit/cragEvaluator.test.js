const { createCragEvaluator, MAX_REWRITE_ATTEMPTS } = require("../../src/services/rag/cragEvaluator.js");

function makeDeps(overrides = {}) {
  return {
    callLLM: overrides.callLLM || vi.fn(),
    getProviderConfig: overrides.getProviderConfig || vi.fn(() => ({
      model: "test-model",
      apiKey: "test-key",
      provider: "test",
    })),
    logger: { info() {}, warn() {}, error() {} },
  };
}

describe("cragEvaluator", () => {
  const sampleResults = [
    { question: "Yazici nasil kurulur?", answer: "Ayarlar > Yazicilar > Ekle" },
    { question: "Hava durumu nasil?", answer: "Bugun gunesli" },
  ];

  it("evaluate classifies results as RELEVANT/PARTIAL/IRRELEVANT", async () => {
    const callLLM = vi.fn().mockResolvedValue({
      reply: JSON.stringify([
        { index: 0, verdict: "RELEVANT" },
        { index: 1, verdict: "IRRELEVANT" },
      ]),
    });
    const evaluator = createCragEvaluator(makeDeps({ callLLM }));

    const result = await evaluator.evaluate("yazici kurulumu", sampleResults);

    expect(result.relevant).toHaveLength(1);
    expect(result.relevant[0].question).toBe("Yazici nasil kurulur?");
    expect(result.irrelevant).toHaveLength(1);
    expect(result.irrelevant[0].question).toBe("Hava durumu nasil?");
    expect(result.partial).toHaveLength(0);
    expect(result.insufficient).toBe(false);
    expect(callLLM).toHaveBeenCalledOnce();
  });

  it("suggestRewrite returns rewritten query", async () => {
    const callLLM = vi.fn().mockResolvedValue({
      reply: '"yazici kurulum adimlari"',
    });
    const evaluator = createCragEvaluator(makeDeps({ callLLM }));

    const rewritten = await evaluator.suggestRewrite("yazici nasil kurulur");

    expect(rewritten).toBe("yazici kurulum adimlari");
    expect(callLLM).toHaveBeenCalledOnce();
  });

  it("returns all as relevant on LLM failure", async () => {
    const callLLM = vi.fn().mockRejectedValue(new Error("LLM timeout"));
    const evaluator = createCragEvaluator(makeDeps({ callLLM }));

    const result = await evaluator.evaluate("yazici kurulumu", sampleResults);

    expect(result.relevant).toHaveLength(2);
    expect(result.partial).toHaveLength(0);
    expect(result.irrelevant).toHaveLength(0);
    expect(result.insufficient).toBe(false);
  });

  it("handles empty results", async () => {
    const evaluator = createCragEvaluator(makeDeps());

    const result = await evaluator.evaluate("yazici kurulumu", []);

    expect(result.relevant).toHaveLength(0);
    expect(result.partial).toHaveLength(0);
    expect(result.irrelevant).toHaveLength(0);
    expect(result.insufficient).toBe(true);
  });

  it("exports MAX_REWRITE_ATTEMPTS as 2", () => {
    expect(MAX_REWRITE_ATTEMPTS).toBe(2);
    const evaluator = createCragEvaluator(makeDeps());
    expect(evaluator.MAX_REWRITE_ATTEMPTS).toBe(2);
  });
});

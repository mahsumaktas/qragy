const { createContextualChunker } = require("../../src/services/rag/contextualChunker.js");

describe("ContextualChunker", () => {
  const noopLogger = { warn: () => {}, info: () => {} };
  const mockProviderConfig = { provider: "test", model: "test-model", apiKey: "key" };

  function buildChunker(overrides = {}) {
    return createContextualChunker({
      callLLM: overrides.callLLM || (async () => ({ reply: "Test baglam cumlesi." })),
      getProviderConfig: overrides.getProviderConfig || (() => mockProviderConfig),
      logger: overrides.logger || noopLogger,
    });
  }

  it("enrichChunk prepends context to chunk text", async () => {
    const contextSentence = "Bu bilgi yazici kurulumu hakkindadir.";
    const chunker = buildChunker({
      callLLM: async () => ({ reply: contextSentence }),
    });

    const chunk = { question: "Yazici nasil kurulur?", answer: "Ayarlar > Yazicilar > Ekle" };
    const result = await chunker.enrichChunk(chunk, "Teknik Destek KB");

    expect(result.enriched).toBe(true);
    expect(result.originalContent).toBe("Yazici nasil kurulur?: Ayarlar > Yazicilar > Ekle");
    expect(result.contextualContent).toContain(contextSentence);
    expect(result.contextualContent).toContain(result.originalContent);
    expect(result.contextualContent).toBe(`${contextSentence}\n${result.originalContent}`);
  });

  it("enrichChunk falls back to original on LLM failure", async () => {
    const chunker = buildChunker({
      callLLM: async () => { throw new Error("LLM timeout"); },
    });

    const chunk = { question: "Fatura nedir?", answer: "Odeme belgesi" };
    const result = await chunker.enrichChunk(chunk, "Fatura KB");

    expect(result.enriched).toBe(false);
    expect(result.originalContent).toBe("Fatura nedir?: Odeme belgesi");
    expect(result.contextualContent).toBe(result.originalContent);
  });

  it("enrichBatch processes multiple chunks", async () => {
    let callCount = 0;
    const chunker = buildChunker({
      callLLM: async () => {
        callCount++;
        return { reply: `Baglam ${callCount}.` };
      },
    });

    const chunks = [
      { question: "Soru 1?", answer: "Cevap 1" },
      { question: "Soru 2?", answer: "Cevap 2" },
    ];

    const results = await chunker.enrichBatch(chunks, "Test KB");

    expect(results).toHaveLength(2);
    expect(results[0].enriched).toBe(true);
    expect(results[1].enriched).toBe(true);
    expect(results[0].contextualContent).toContain("Baglam");
    expect(results[1].contextualContent).toContain("Baglam");
  });
});

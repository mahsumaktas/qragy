const { createReranker } = require("../../src/services/rag/reranker.js");

const mockLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
};

const sampleResults = [
  { question: "Yazici nasil kurulur?", answer: "Ayarlar > Yazicilar > Ekle", rrfScore: 0.3 },
  { question: "Sifre nasil degistirilir?", answer: "Profil > Guvenlik > Sifre Degistir", rrfScore: 0.5 },
  { question: "Rapor nasil alinir?", answer: "Raporlar > Yeni Rapor > Olustur", rrfScore: 0.1 },
];

describe("Reranker", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rerank returns results sorted by relevance score", async () => {
    const callLLM = vi.fn().mockResolvedValue({
      reply: JSON.stringify([
        { index: 0, score: 0.4 },
        { index: 1, score: 0.9 },
        { index: 2, score: 0.7 },
      ]),
      finishReason: "STOP",
    });
    const getProviderConfig = vi.fn().mockReturnValue({});

    const reranker = createReranker({
      callLLM,
      getProviderConfig,
      logger: mockLogger,
      cohereApiKey: null,
    });

    const result = await reranker.rerank("sifre degistir", sampleResults);

    expect(result).toHaveLength(3);
    expect(result[0]._rerankScore).toBe(0.9);
    expect(result[1]._rerankScore).toBe(0.7);
    expect(result[2]._rerankScore).toBe(0.4);
    expect(result[0].question).toContain("Sifre");
    expect(callLLM).toHaveBeenCalledOnce();
  });

  it("rerank returns original results on LLM failure (RRF fallback)", async () => {
    const callLLM = vi.fn().mockRejectedValue(new Error("LLM unavailable"));
    const getProviderConfig = vi.fn().mockReturnValue({});

    const reranker = createReranker({
      callLLM,
      getProviderConfig,
      logger: mockLogger,
      cohereApiKey: null,
    });

    const result = await reranker.rerank("bir soru", sampleResults);

    expect(result).toHaveLength(3);
    // RRF fallback uses rrfScore
    result.forEach((r) => {
      expect(r._rerankScore).toBeDefined();
      expect(typeof r._rerankScore).toBe("number");
    });
    // Should be sorted by rrfScore desc (0.5, 0.3, 0.1)
    expect(result[0].rrfScore).toBe(0.5);
    expect(result[1].rrfScore).toBe(0.3);
    expect(result[2].rrfScore).toBe(0.1);
    expect(mockLogger.warn).toHaveBeenCalled();
  });

  it("rerank handles empty results", async () => {
    const callLLM = vi.fn();
    const getProviderConfig = vi.fn().mockReturnValue({});

    const reranker = createReranker({
      callLLM,
      getProviderConfig,
      logger: mockLogger,
      cohereApiKey: null,
    });

    const result = await reranker.rerank("herhangi bir sey", []);
    expect(result).toEqual([]);
    expect(callLLM).not.toHaveBeenCalled();
  });

  it("rerank with Cohere API when key is set", async () => {
    const originalFetch = globalThis.fetch;

    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        results: [
          { index: 2, relevance_score: 0.95 },
          { index: 0, relevance_score: 0.8 },
          { index: 1, relevance_score: 0.6 },
        ],
      }),
    }));

    const callLLM = vi.fn();
    const getProviderConfig = vi.fn().mockReturnValue({});

    const reranker = createReranker({
      callLLM,
      getProviderConfig,
      logger: mockLogger,
      cohereApiKey: "test-cohere-key",
    });

    const result = await reranker.rerank("rapor", sampleResults);

    expect(result).toHaveLength(3);
    expect(result[0]._rerankScore).toBe(0.95);
    expect(result[0].question).toContain("Rapor");
    expect(result[1]._rerankScore).toBe(0.8);
    expect(result[2]._rerankScore).toBe(0.6);
    expect(callLLM).not.toHaveBeenCalled();

    // Fetch'in Cohere endpoint'ine cagrildigini dogrula
    expect(globalThis.fetch).toHaveBeenCalledOnce();
    const fetchCall = globalThis.fetch.mock.calls[0];
    expect(fetchCall[0]).toBe("https://api.cohere.com/v1/rerank");
    expect(fetchCall[1].headers.Authorization).toBe("Bearer test-cohere-key");

    globalThis.fetch = originalFetch;
  });

  it("falls back to LLM reranker when Cohere fails", async () => {
    const originalFetch = globalThis.fetch;

    globalThis.fetch = vi.fn(async () => ({
      ok: false,
      status: 500,
      text: async () => "Internal Server Error",
    }));

    const callLLM = vi.fn().mockResolvedValue({
      reply: '```json\n[{"index": 0, "score": 0.5}, {"index": 1, "score": 0.8}, {"index": 2, "score": 0.3}]\n```',
      finishReason: "STOP",
    });
    const getProviderConfig = vi.fn().mockReturnValue({});

    const reranker = createReranker({
      callLLM,
      getProviderConfig,
      logger: mockLogger,
      cohereApiKey: "test-cohere-key",
    });

    const result = await reranker.rerank("sifre", sampleResults);

    expect(result).toHaveLength(3);
    // LLM fallback kullanildi
    expect(callLLM).toHaveBeenCalledOnce();
    expect(result[0]._rerankScore).toBe(0.8);
    expect(result[0].question).toContain("Sifre");
    expect(mockLogger.warn).toHaveBeenCalledWith(
      "reranker",
      "Cohere basarisiz, LLM fallback",
      expect.objectContaining({ error: expect.any(String) })
    );

    globalThis.fetch = originalFetch;
  });
});

const { createChatPipeline } = require("../../src/services/pipeline/chatPipeline.js");

// ── Helpers ─────────────────────────────────────────────────────────────

function makeAnalysis(overrides = {}) {
  return {
    route: "STANDARD",
    standaloneQuery: "test sorusu",
    complexity: "medium",
    intent: "product_support",
    requiresMemory: false,
    requiresGraph: false,
    subQueries: [],
    ...overrides,
  };
}

function makeDeps(overrides = {}) {
  const defaultAnalysis = overrides._analysis || makeAnalysis();

  return {
    queryAnalyzer: overrides.queryAnalyzer || {
      analyze: vi.fn().mockResolvedValue(defaultAnalysis),
    },
    searchEngine: overrides.searchEngine || {
      hybridSearch: vi.fn().mockResolvedValue([
        { question: "Soru 1", answer: "Cevap 1", rrfScore: 0.9 },
        { question: "Soru 2", answer: "Cevap 2", rrfScore: 0.7 },
      ]),
      formatCitations: vi.fn().mockReturnValue([
        { index: 1, title: "Soru 1", source: "Bilgi Tabani", snippet: "Cevap 1" },
        { index: 2, title: "Soru 2", source: "Bilgi Tabani", snippet: "Cevap 2" },
      ]),
    },
    reranker: overrides.reranker || {
      rerank: vi.fn().mockResolvedValue([
        { question: "Soru 1", answer: "Cevap 1", _rerankScore: 0.95 },
        { question: "Soru 2", answer: "Cevap 2", _rerankScore: 0.6 },
      ]),
    },
    cragEvaluator: overrides.cragEvaluator || {
      evaluate: vi.fn().mockResolvedValue({
        relevant: [{ question: "Soru 1", answer: "Cevap 1" }],
        partial: [],
        irrelevant: [{ question: "Soru 2", answer: "Cevap 2" }],
        insufficient: false,
      }),
      suggestRewrite: vi.fn().mockResolvedValue("yeniden yazilmis sorgu"),
      MAX_REWRITE_ATTEMPTS: 2,
    },
    memoryEngine: overrides.memoryEngine || {
      loadContext: vi.fn().mockResolvedValue({ coreMemory: "", recallMemory: "" }),
      updateAfterConversation: vi.fn().mockResolvedValue(),
    },
    reflexion: overrides.reflexion || {
      getWarnings: vi.fn().mockResolvedValue(""),
    },
    graphQuery: overrides.graphQuery || {
      formatForPrompt: vi.fn().mockResolvedValue(""),
    },
    qualityScorer: overrides.qualityScorer || {
      score: vi.fn().mockResolvedValue({ isLowQuality: false }),
    },
    promptBuilder: overrides.promptBuilder || {
      buildSystemPrompt: vi.fn().mockReturnValue("system prompt"),
    },
    callLLM: overrides.callLLM || vi.fn().mockResolvedValue({
      reply: "Test cevabi",
      finishReason: "stop",
    }),
    getProviderConfig: overrides.getProviderConfig || vi.fn(() => ({
      model: "test-model",
      apiKey: "test-key",
      provider: "test",
      maxOutputTokens: 2048,
    })),
    logger: { info() {}, warn() {}, error() {} },
  };
}

function makeInput(overrides = {}) {
  return {
    userMessage: "Test mesaji",
    chatHistory: [],
    sessionId: "sess-1",
    userId: "user-1",
    knowledgeBase: [{ question: "Q", answer: "A" }],
    kbSize: 10,
    memory: {},
    conversationContext: {},
    options: {},
    ...overrides,
  };
}

// ── Tests ───────────────────────────────────────────────────────────────

describe("chatPipeline", () => {
  it("FAST route: skips retrieval for simple greetings", async () => {
    const analysis = makeAnalysis({ route: "FAST", intent: "greeting", complexity: "simple" });
    const deps = makeDeps({ _analysis: analysis });
    const pipeline = createChatPipeline(deps);

    const result = await pipeline.process(makeInput({ userMessage: "Merhaba" }));

    expect(result.route).toBe("FAST");
    expect(deps.searchEngine.hybridSearch).not.toHaveBeenCalled();
    expect(deps.reranker.rerank).not.toHaveBeenCalled();
    expect(deps.callLLM).toHaveBeenCalledOnce();
    expect(result.reply).toBe("Test cevabi");
    expect(result.ragResults).toEqual([]);
    expect(result.citations).toEqual([]);
  });

  it("STANDARD route: search + rerank + generate", async () => {
    const analysis = makeAnalysis({ route: "STANDARD" });
    const deps = makeDeps({ _analysis: analysis });
    const pipeline = createChatPipeline(deps);

    const result = await pipeline.process(makeInput());

    expect(result.route).toBe("STANDARD");
    expect(deps.searchEngine.hybridSearch).toHaveBeenCalledOnce();
    expect(deps.reranker.rerank).toHaveBeenCalledOnce();
    expect(deps.cragEvaluator.evaluate).not.toHaveBeenCalled();
    expect(deps.callLLM).toHaveBeenCalledOnce();
    expect(result.ragResults.length).toBeGreaterThan(0);
  });

  it("standardPath filters low-relevance results", async () => {
    const analysis = makeAnalysis({ route: "STANDARD" });
    const reranker = {
      rerank: vi.fn().mockResolvedValue([
        { question: "Good", answer: "Good answer", _rerankScore: 0.85 },
        { question: "Bad", answer: "Bad answer", _rerankScore: 0.15 },
        { question: "Okay", answer: "Okay answer", _rerankScore: 0.45 },
      ]),
    };
    const deps = makeDeps({ _analysis: analysis, reranker });
    const pipeline = createChatPipeline(deps);

    const result = await pipeline.process(makeInput());

    // _rerankScore < 0.3 should be filtered out
    expect(result.ragResults).toHaveLength(2);
    expect(result.ragResults.every(r => r._rerankScore >= 0.3)).toBe(true);
  });

  it("standardPath keeps at least 1 result even if all below threshold", async () => {
    const analysis = makeAnalysis({ route: "STANDARD" });
    const reranker = {
      rerank: vi.fn().mockResolvedValue([
        { question: "Low", answer: "Low answer", _rerankScore: 0.1 },
        { question: "Lower", answer: "Lower answer", _rerankScore: 0.05 },
      ]),
    };
    const deps = makeDeps({ _analysis: analysis, reranker });
    const pipeline = createChatPipeline(deps);

    const result = await pipeline.process(makeInput());

    // Should keep at least 1 even though all are below threshold
    expect(result.ragResults).toHaveLength(1);
    expect(result.ragResults[0]._rerankScore).toBe(0.1);
  });

  it("DEEP route: search + rerank + CRAG evaluate", async () => {
    const analysis = makeAnalysis({ route: "DEEP", complexity: "complex" });
    const deps = makeDeps({ _analysis: analysis });
    const pipeline = createChatPipeline(deps);

    const result = await pipeline.process(makeInput());

    expect(result.route).toBe("DEEP");
    expect(deps.searchEngine.hybridSearch).toHaveBeenCalled();
    expect(deps.reranker.rerank).toHaveBeenCalled();
    expect(deps.cragEvaluator.evaluate).toHaveBeenCalled();
    expect(deps.callLLM).toHaveBeenCalledOnce();
    expect(result.ragResults.length).toBeGreaterThan(0);
  });

  it("DEEP path processes subQueries and merges results", async () => {
    const analysis = makeAnalysis({
      route: "DEEP",
      complexity: "complex",
      subQueries: ["iPhone fiyat", "iPhone renk secenekleri"],
    });

    const searchEngine = {
      hybridSearch: vi.fn()
        .mockResolvedValueOnce([
          { question: "iPhone 15 fiyati", answer: "35.000 TL", rrfScore: 0.9 },
        ])
        .mockResolvedValueOnce([
          { question: "iPhone fiyat listesi", answer: "30.000-40.000 TL arasi", rrfScore: 0.7 },
        ])
        .mockResolvedValueOnce([
          { question: "iPhone renkleri", answer: "Siyah, beyaz, mavi", rrfScore: 0.8 },
          { question: "iPhone 15 fiyati", answer: "35.000 TL", rrfScore: 0.6 }, // duplicate
        ]),
      formatCitations: vi.fn().mockReturnValue([]),
    };

    const cragEvaluator = {
      evaluate: vi.fn().mockResolvedValue({
        relevant: [
          { question: "iPhone 15 fiyati", answer: "35.000 TL" },
          { question: "iPhone renkleri", answer: "Siyah, beyaz, mavi" },
        ],
        partial: [{ question: "iPhone fiyat listesi", answer: "30.000-40.000 TL arasi" }],
        irrelevant: [],
        insufficient: false,
      }),
      suggestRewrite: vi.fn(),
      MAX_REWRITE_ATTEMPTS: 2,
    };

    const reranker = {
      rerank: vi.fn().mockImplementation((_q, results) =>
        results.map(r => ({ ...r, _rerankScore: 0.8 }))
      ),
    };

    const deps = makeDeps({ _analysis: analysis, searchEngine, cragEvaluator, reranker });
    const pipeline = createChatPipeline(deps);

    const result = await pipeline.process(makeInput());

    // Should call hybridSearch 3 times (main + 2 subQueries)
    expect(searchEngine.hybridSearch).toHaveBeenCalledTimes(3);
    // Duplicate "iPhone 15 fiyati" should be deduplicated
    expect(result.ragResults.length).toBe(3);
    expect(result.route).toBe("DEEP");
  });

  it("DEEP path falls back to normal deepPath when no subQueries", async () => {
    const analysis = makeAnalysis({
      route: "DEEP",
      complexity: "complex",
      subQueries: [],
    });
    const deps = makeDeps({ _analysis: analysis });
    const pipeline = createChatPipeline(deps);

    const result = await pipeline.process(makeInput());

    // Normal DEEP path — single hybridSearch call
    expect(deps.searchEngine.hybridSearch).toHaveBeenCalledOnce();
    expect(result.route).toBe("DEEP");
  });

  it("DEEP route retries on insufficient results", async () => {
    const analysis = makeAnalysis({ route: "DEEP", complexity: "complex" });

    const cragEvaluator = {
      evaluate: vi.fn()
        .mockResolvedValueOnce({
          relevant: [],
          partial: [],
          irrelevant: [{ question: "bad", answer: "bad" }],
          insufficient: true,
        })
        .mockResolvedValueOnce({
          relevant: [{ question: "good", answer: "good" }],
          partial: [],
          irrelevant: [],
          insufficient: false,
        }),
      suggestRewrite: vi.fn().mockResolvedValue("iyilestirilmis sorgu"),
      MAX_REWRITE_ATTEMPTS: 2,
    };

    const searchEngine = {
      hybridSearch: vi.fn().mockResolvedValue([
        { question: "Soru", answer: "Cevap", rrfScore: 0.5 },
      ]),
      formatCitations: vi.fn().mockReturnValue([
        { index: 1, title: "Soru", source: "KB", snippet: "Cevap" },
      ]),
    };

    const deps = makeDeps({ _analysis: analysis, cragEvaluator, searchEngine });
    const pipeline = createChatPipeline(deps);

    const result = await pipeline.process(makeInput());

    expect(result.route).toBe("DEEP");
    expect(cragEvaluator.suggestRewrite).toHaveBeenCalledOnce();
    expect(searchEngine.hybridSearch).toHaveBeenCalledTimes(2);
    expect(cragEvaluator.evaluate).toHaveBeenCalledTimes(2);
    expect(result.ragResults).toEqual([{ question: "good", answer: "good" }]);
  });

  it("awaits quality scoring and calls with correct params", async () => {
    const analysis = makeAnalysis({ route: "FAST" });
    const qualityScorer = {
      score: vi.fn().mockResolvedValue({ isLowQuality: false }),
    };
    const deps = makeDeps({ _analysis: analysis, qualityScorer });
    const pipeline = createChatPipeline(deps);

    const result = await pipeline.process(makeInput());

    expect(qualityScorer.score).toHaveBeenCalledOnce();
    expect(qualityScorer.score).toHaveBeenCalledWith(
      expect.objectContaining({
        query: expect.any(String),
        answer: expect.any(String),
        sessionId: "sess-1",
      }),
    );
    // No disclaimer when not low quality
    expect(result.reply).not.toContain("Bu cevap yetersiz olabilir");
  });

  it("isLowQuality response gets disclaimer appended", async () => {
    const analysis = makeAnalysis({ route: "STANDARD" });
    const qualityScorer = {
      score: vi.fn().mockResolvedValue({ isLowQuality: true }),
    };
    const deps = makeDeps({ _analysis: analysis, qualityScorer });
    const pipeline = createChatPipeline(deps);

    const result = await pipeline.process(makeInput());

    expect(result.reply).toContain("Bu cevap yetersiz olabilir");
    expect(result.reply).toContain("canli destek temsilcimize");
  });

  it("includes memory context when requiresMemory", async () => {
    const analysis = makeAnalysis({ route: "STANDARD", requiresMemory: true });
    const memoryEngine = {
      loadContext: vi.fn().mockResolvedValue({
        coreMemory: "core: kullanici bilgisi",
        recallMemory: "recall: onceki konusmalar",
      }),
      updateAfterConversation: vi.fn().mockResolvedValue(),
    };
    const deps = makeDeps({ _analysis: analysis, memoryEngine });
    const pipeline = createChatPipeline(deps);

    await pipeline.process(makeInput({ userId: "user-42" }));

    expect(memoryEngine.loadContext).toHaveBeenCalledWith(
      "user-42",
      "test sorusu",
      expect.objectContaining({ requiresMemory: true }),
    );
    expect(deps.promptBuilder.buildSystemPrompt).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.objectContaining({
        coreMemoryText: "core: kullanici bilgisi",
        recallMemoryText: "recall: onceki konusmalar",
      }),
    );
  });

  it("standaloneQuery replaces last user message before LLM call", async () => {
    const analysis = makeAnalysis({
      route: "FAST",
      standaloneQuery: "iPhone 15 sepete ekle",
    });
    const callLLM = vi.fn().mockResolvedValue({ reply: "Eklendi", finishReason: "stop" });
    const deps = makeDeps({ _analysis: analysis, callLLM });
    const pipeline = createChatPipeline(deps);

    const chatHistory = [
      { role: "user", parts: [{ text: "iPhone 15 hakkinda bilgi ver" }] },
      { role: "assistant", parts: [{ text: "iPhone 15 ozellikleri..." }] },
      { role: "user", parts: [{ text: "bunu sepete ekle" }] },
    ];

    await pipeline.process(makeInput({
      userMessage: "bunu sepete ekle",
      chatHistory,
    }));

    const sentHistory = callLLM.mock.calls[0][0];
    // Last user message should be replaced with standaloneQuery
    const lastUser = sentHistory.filter(m => m.role === "user").pop();
    expect(lastUser.parts[0].text).toBe("iPhone 15 sepete ekle");
    // Earlier user message should be unchanged
    expect(sentHistory[0].parts[0].text).toBe("iPhone 15 hakkinda bilgi ver");
  });

  it("does not mutate original chatHistory when replacing standaloneQuery", async () => {
    const analysis = makeAnalysis({
      route: "FAST",
      standaloneQuery: "resolved query",
    });
    const deps = makeDeps({ _analysis: analysis });
    const pipeline = createChatPipeline(deps);

    const chatHistory = [
      { role: "user", parts: [{ text: "original message" }] },
    ];

    await pipeline.process(makeInput({
      userMessage: "original message",
      chatHistory,
    }));

    // Original chatHistory must not be mutated
    expect(chatHistory[0].parts[0].text).toBe("original message");
  });

  it("returns citations with response", async () => {
    const analysis = makeAnalysis({ route: "STANDARD" });
    const searchEngine = {
      hybridSearch: vi.fn().mockResolvedValue([
        { question: "Kargo", answer: "2-3 gun", rrfScore: 0.8 },
      ]),
      formatCitations: vi.fn().mockReturnValue([
        { index: 1, title: "Kargo", source: "KB", snippet: "2-3 gun" },
      ]),
    };
    const deps = makeDeps({ _analysis: analysis, searchEngine });
    const pipeline = createChatPipeline(deps);

    const result = await pipeline.process(makeInput());

    expect(searchEngine.formatCitations).toHaveBeenCalledOnce();
    expect(result.citations).toEqual([
      { index: 1, title: "Kargo", source: "KB", snippet: "2-3 gun" },
    ]);
    expect(result.citations.length).toBe(1);
  });
});

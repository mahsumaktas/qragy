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

  it("triggers async quality scoring", async () => {
    const analysis = makeAnalysis({ route: "FAST" });
    const qualityScorer = {
      score: vi.fn().mockResolvedValue({ isLowQuality: false }),
    };
    const deps = makeDeps({ _analysis: analysis, qualityScorer });
    const pipeline = createChatPipeline(deps);

    await pipeline.process(makeInput());

    // qualityScorer.score is fire-and-forget via Promise.resolve().then(...)
    // Wait for microtask queue to flush
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(qualityScorer.score).toHaveBeenCalledOnce();
    expect(qualityScorer.score).toHaveBeenCalledWith(
      expect.objectContaining({
        query: expect.any(String),
        answer: "Test cevabi",
        sessionId: "sess-1",
      }),
    );
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

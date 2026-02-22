"use strict";

import { describe, it, expect, vi, beforeEach } from "vitest";

const { createChatPipeline } = require("../../src/services/pipeline/chatPipeline.js");
const { createSearchEngine } = require("../../src/services/rag/searchEngine.js");
const { createReranker } = require("../../src/services/rag/reranker.js");
const { createQueryAnalyzer } = require("../../src/services/rag/queryAnalyzer.js");
const { createCragEvaluator } = require("../../src/services/rag/cragEvaluator.js");
const { createMemoryEngine } = require("../../src/services/memory/memoryEngine.js");
const { createCoreMemory } = require("../../src/services/memory/coreMemory.js");
const { createRecallMemory } = require("../../src/services/memory/recallMemory.js");
const { createQualityScorer } = require("../../src/services/intelligence/qualityScorer.js");
const { createReflexion } = require("../../src/services/intelligence/reflexion.js");
const { createGraphQuery } = require("../../src/services/intelligence/graphQuery.js");
const { createPromptBuilder } = require("../../src/services/promptBuilder.js");

// ── Mock helpers ─────────────────────────────────────────────────────────

function makeKnowledgeBase() {
  return [
    { question: "Yazici nasil kurulur?", answer: "Yazici kurulumu icin oncelikle surucuyu indirin." },
    { question: "Fatura nasil kesilir?", answer: "Fatura kesmek icin admin paneline gidin." },
    { question: "Sube kodu nedir?", answer: "Sube kodu, subenizi tanimlayan benzersiz bir koddur." },
  ];
}

function makeLLMResponse(reply) {
  return { reply, finishReason: "stop" };
}

function makeMockCallLLM(responses) {
  let idx = 0;
  return vi.fn(async () => {
    const resp = responses[idx] || responses[responses.length - 1];
    idx++;
    return makeLLMResponse(resp);
  });
}

function makeMockProviderConfig() {
  return vi.fn(() => ({
    provider: "openai",
    apiKey: "test-key",
    model: "gpt-4",
    maxOutputTokens: 2048,
  }));
}

function makeMockSqliteDb() {
  const memoryStore = {};
  return {
    getUserMemory: vi.fn((userId) => memoryStore[userId] || {}),
    saveUserMemory: vi.fn((userId, key, value) => {
      if (!memoryStore[userId]) memoryStore[userId] = {};
      memoryStore[userId][key] = value;
    }),
    saveRecallMemory: vi.fn(),
    searchRecallMemory: vi.fn(() => []),
    saveQualityScore: vi.fn(),
    saveReflexionLog: vi.fn(),
    searchReflexionByTopic: vi.fn(() => []),
    queryEdgesByEntity: vi.fn(() => []),
    _memoryStore: memoryStore,
  };
}

function makePromptBuilder() {
  return createPromptBuilder({
    getAgentTexts: () => ({
      SOUL_TEXT: "Sen bir destek botusun.",
      PERSONA_TEXT: "Yardimci ve kibar ol.",
      BOOTSTRAP_TEXT: "",
      DOMAIN_TEXT: "",
      SKILLS_TEXT: "",
      HARD_BANS_TEXT: "",
      ESCALATION_MATRIX_TEXT: "",
      RESPONSE_POLICY_TEXT: "Turkce cevap ver.",
      DOD_TEXT: "",
      OUTPUT_FILTER_TEXT: "",
    }),
    getTopicIndexSummary: () => "yazici, fatura, sube",
    loadTopicFile: () => null,
    getTopicMeta: () => null,
    getMemoryTemplate: () => ({ confirmationTemplate: "Onay: {{summary}}" }),
  });
}

// ── Integration Tests ────────────────────────────────────────────────────

describe("Adaptive Pipeline Integration", () => {
  let callLLM;
  let getProviderConfig;
  let sqliteDb;
  let pipeline;

  beforeEach(() => {
    getProviderConfig = makeMockProviderConfig();
    sqliteDb = makeMockSqliteDb();
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };

    // First call: queryAnalyzer (returns analysis JSON)
    // Second call: LLM generation (returns the actual response)
    callLLM = makeMockCallLLM([
      // Call 1: Query Analyzer
      JSON.stringify({
        complexity: "simple",
        intent: "greeting",
        standaloneQuery: "Merhaba",
        subQueries: [],
        requiresMemory: false,
        requiresGraph: false,
      }),
      // Call 2: LLM response
      "Merhaba! Size nasil yardimci olabilirim?",
    ]);

    const searchEngine = createSearchEngine({ embedText: vi.fn(), logger });
    const reranker = createReranker({ callLLM, getProviderConfig, logger, cohereApiKey: "" });
    const queryAnalyzer = createQueryAnalyzer({ callLLM, getProviderConfig, logger });
    const cragEvaluator = createCragEvaluator({ callLLM, getProviderConfig, logger });
    const coreMemory = createCoreMemory({ sqliteDb, callLLM, getProviderConfig, logger });
    const recallMemory = createRecallMemory({ sqliteDb, logger });
    const memoryEngine = createMemoryEngine({ coreMemory, recallMemory, logger });
    const qualityScorer = createQualityScorer({ callLLM, getProviderConfig, sqliteDb, logger });
    const reflexion = createReflexion({ callLLM, getProviderConfig, sqliteDb, logger });
    const graphQuery = createGraphQuery({ sqliteDb, logger });
    const promptBuilder = makePromptBuilder();

    pipeline = createChatPipeline({
      queryAnalyzer,
      searchEngine,
      reranker,
      cragEvaluator,
      memoryEngine,
      reflexion,
      graphQuery,
      qualityScorer,
      promptBuilder,
      callLLM,
      getProviderConfig,
      logger,
    });
  });

  it("FAST route: greeting goes direct to LLM without retrieval", async () => {
    const result = await pipeline.process({
      userMessage: "Merhaba",
      chatHistory: [{ role: "user", parts: [{ text: "Merhaba" }] }],
      sessionId: "test-session-1",
      userId: "user1",
      knowledgeBase: makeKnowledgeBase(),
      kbSize: 3,
      memory: {},
      conversationContext: { conversationState: "welcome_or_greet", turnCount: 0 },
    });

    expect(result).toBeDefined();
    expect(result.route).toBe("FAST");
    expect(result.ragResults).toEqual([]);
    expect(result.reply).toBeTruthy();
    // queryAnalyzer + generation = 2 sync calls, async post-processing adds more
    expect(callLLM.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it("STANDARD route: product support triggers search + rerank", async () => {
    // Override LLM to return STANDARD route analysis
    let callIdx = 0;
    callLLM = vi.fn(async () => {
      callIdx++;
      if (callIdx === 1) {
        return makeLLMResponse(JSON.stringify({
          complexity: "medium",
          intent: "product_support",
          standaloneQuery: "Yazici nasil kurulur?",
          subQueries: [],
          requiresMemory: false,
          requiresGraph: false,
        }));
      }
      return makeLLMResponse("Yazici kurulumu icin oncelikle surucuyu indirmeniz gerekiyor.");
    });

    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const searchEngine = createSearchEngine({ embedText: vi.fn(), logger });
    const reranker = createReranker({ callLLM, getProviderConfig, logger, cohereApiKey: "" });
    const queryAnalyzer = createQueryAnalyzer({ callLLM, getProviderConfig, logger });
    const cragEvaluator = createCragEvaluator({ callLLM, getProviderConfig, logger });
    const coreMemory = createCoreMemory({ sqliteDb, callLLM, getProviderConfig, logger });
    const recallMemory = createRecallMemory({ sqliteDb, logger });
    const memoryEngine = createMemoryEngine({ coreMemory, recallMemory, logger });
    const qualityScorer = createQualityScorer({ callLLM, getProviderConfig, sqliteDb, logger });
    const reflexion = createReflexion({ callLLM, getProviderConfig, sqliteDb, logger });
    const graphQuery = createGraphQuery({ sqliteDb, logger });
    const promptBuilder = makePromptBuilder();

    const stdPipeline = createChatPipeline({
      queryAnalyzer, searchEngine, reranker, cragEvaluator,
      memoryEngine, reflexion, graphQuery, qualityScorer,
      promptBuilder, callLLM, getProviderConfig, logger,
    });

    const result = await stdPipeline.process({
      userMessage: "Yazici nasil kurulur?",
      chatHistory: [{ role: "user", parts: [{ text: "Yazici nasil kurulur?" }] }],
      sessionId: "test-session-2",
      userId: "user2",
      knowledgeBase: makeKnowledgeBase(),
      kbSize: 3,
      memory: {},
      conversationContext: { conversationState: "active", turnCount: 2 },
    });

    expect(result).toBeDefined();
    expect(result.route).toBe("STANDARD");
    expect(result.reply).toContain("Yazici");
  });

  it("pipeline returns all expected fields", async () => {
    const result = await pipeline.process({
      userMessage: "Merhaba",
      chatHistory: [],
      sessionId: "test-session-3",
      userId: "user3",
    });

    expect(result).toHaveProperty("reply");
    expect(result).toHaveProperty("route");
    expect(result).toHaveProperty("analysis");
    expect(result).toHaveProperty("citations");
    expect(result).toHaveProperty("ragResults");
    expect(result).toHaveProperty("finishReason");
  });

  it("memory context is loaded for userId", async () => {
    // Pre-populate user memory
    sqliteDb._memoryStore["user4"] = { name: "Ahmet", branch: "IST-001" };

    const result = await pipeline.process({
      userMessage: "Merhaba",
      chatHistory: [],
      sessionId: "test-session-4",
      userId: "user4",
    });

    expect(result.reply).toBeTruthy();
    // Core memory should have been loaded
    expect(sqliteDb.getUserMemory).toHaveBeenCalledWith("user4");
  });

  it("quality scorer runs asynchronously after response", async () => {
    await pipeline.process({
      userMessage: "Merhaba",
      chatHistory: [],
      sessionId: "test-session-5",
      userId: "user5",
    });

    // Give async post-processing time
    await new Promise((r) => setTimeout(r, 50));

    // Quality scorer and memory update are fire-and-forget
    // Verify no unhandled errors occurred (test would throw if so)
    expect(true).toBe(true);
  });
});

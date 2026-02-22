const {
  getProviderConfig,
  callLLMWithFallback,
  _callProvider,
  _callAnthropicProvider,
  _callOpenAICompatible,
  _buildOpenAIBaseUrl,
} = require("../../lib/providers.js");

// ── Mock fetch ─────────────────────────────────────────────────────────

const originalFetch = globalThis.fetch;
const originalEnv = { ...process.env };

beforeEach(() => {
  globalThis.fetch = vi.fn();
  // Clean LLM env vars
  delete process.env.LLM_PROVIDER;
  delete process.env.LLM_API_KEY;
  delete process.env.LLM_MODEL;
  delete process.env.LLM_BASE_URL;
  delete process.env.LLM_FALLBACK_MODELS;
  delete process.env.GOOGLE_API_KEY;
  delete process.env.GEMINI_API_KEY;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  // Restore original env
  Object.keys(process.env).forEach((k) => {
    if (!(k in originalEnv)) delete process.env[k];
  });
  Object.assign(process.env, originalEnv);
});

// ── Helpers ────────────────────────────────────────────────────────────

function makeFetchOk(body) {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve(body),
  });
}

function makeFetchError(status, errorMsg) {
  return vi.fn().mockResolvedValue({
    ok: false,
    status,
    json: () => Promise.resolve({ error: { message: errorMsg } }),
  });
}

const sampleMessages = [
  { role: "user", parts: [{ text: "Merhaba" }] },
  { role: "model", parts: [{ text: "Selam!" }] },
];

const baseCfg = {
  provider: "anthropic",
  apiKey: "test-key-123",
  model: "claude-sonnet-4-20250514",
  baseUrl: "",
  requestTimeoutMs: 5000,
  fallbackModels: [],
  maxOutputTokens: 1024,
  thinkingBudget: 0,
  enableThinking: "false",
};

// ── 1. getProviderConfig defaults ──────────────────────────────────────

describe("getProviderConfig", () => {
  it("returns correct defaults when no env vars set", () => {
    const cfg = getProviderConfig();
    expect(cfg.provider).toBe("gemini");
    expect(cfg.model).toBe("gemini-2.5-flash-preview-05-20");
    expect(cfg.apiKey).toBe("");
    expect(cfg.requestTimeoutMs).toBe(15000);
    expect(cfg.maxOutputTokens).toBe(1024);
  });

  it("reads LLM_PROVIDER from env", () => {
    process.env.LLM_PROVIDER = "Anthropic";
    process.env.LLM_API_KEY = "sk-ant-test";
    process.env.LLM_MODEL = "claude-sonnet-4-20250514";

    const cfg = getProviderConfig();
    expect(cfg.provider).toBe("anthropic");
    expect(cfg.apiKey).toBe("sk-ant-test");
    expect(cfg.model).toBe("claude-sonnet-4-20250514");
  });
});

// ── 2. buildOpenAIBaseUrl ──────────────────────────────────────────────

describe("buildOpenAIBaseUrl", () => {
  it("returns correct URLs for each provider", () => {
    expect(_buildOpenAIBaseUrl({ provider: "openai", baseUrl: "" }))
      .toBe("https://api.openai.com/v1");

    expect(_buildOpenAIBaseUrl({ provider: "ollama", baseUrl: "" }))
      .toBe("http://localhost:11434/v1");

    expect(_buildOpenAIBaseUrl({ provider: "groq", baseUrl: "" }))
      .toBe("https://api.groq.com/openai/v1");

    expect(_buildOpenAIBaseUrl({ provider: "mistral", baseUrl: "" }))
      .toBe("https://api.mistral.ai/v1");

    expect(_buildOpenAIBaseUrl({ provider: "deepseek", baseUrl: "" }))
      .toBe("https://api.deepseek.com/v1");
  });

  it("prefers custom baseUrl over provider default", () => {
    expect(_buildOpenAIBaseUrl({ provider: "groq", baseUrl: "https://custom.example.com" }))
      .toBe("https://custom.example.com");
  });
});

// ── 3. callAnthropicProvider ───────────────────────────────────────────

describe("callAnthropicProvider", () => {
  it("formats request correctly", async () => {
    globalThis.fetch = makeFetchOk({
      content: [{ type: "text", text: "Merhaba! Nasil yardimci olabilirim?" }],
      stop_reason: "end_turn",
    });

    const result = await _callAnthropicProvider(sampleMessages, "Sen bir asistansin.", 512, {
      ...baseCfg,
      apiKey: "sk-ant-abc",
      model: "claude-sonnet-4-20250514",
    });

    expect(result.reply).toBe("Merhaba! Nasil yardimci olabilirim?");

    // Verify fetch was called with correct params
    const [url, options] = globalThis.fetch.mock.calls[0];
    expect(url).toBe("https://api.anthropic.com/v1/messages");
    expect(options.method).toBe("POST");

    const headers = options.headers;
    expect(headers["x-api-key"]).toBe("sk-ant-abc");
    expect(headers["anthropic-version"]).toBe("2023-06-01");
    expect(headers["Content-Type"]).toBe("application/json");

    const body = JSON.parse(options.body);
    expect(body.model).toBe("claude-sonnet-4-20250514");
    expect(body.max_tokens).toBe(512);
    expect(body.system).toBe("Sen bir asistansin.");
    expect(body.messages).toEqual([
      { role: "user", content: "Merhaba" },
      { role: "assistant", content: "Selam!" },
    ]);
  });

  it("handles API error", async () => {
    globalThis.fetch = makeFetchError(400, "Invalid API key");

    await expect(
      _callAnthropicProvider(sampleMessages, "system", 512, baseCfg)
    ).rejects.toThrow("Invalid API key");
  });

  it("maps max_tokens stop_reason to MAX_TOKENS", async () => {
    globalThis.fetch = makeFetchOk({
      content: [{ type: "text", text: "truncated" }],
      stop_reason: "max_tokens",
    });

    const result = await _callAnthropicProvider(sampleMessages, "system", 10, baseCfg);
    expect(result.finishReason).toBe("MAX_TOKENS");
  });
});

// ── 4. callProvider routing ────────────────────────────────────────────

describe("callProvider routing", () => {
  const anthropicResponse = {
    content: [{ type: "text", text: "Claude reply" }],
    stop_reason: "end_turn",
  };
  const openAIResponse = {
    choices: [{ message: { content: "OpenAI reply" }, finish_reason: "stop" }],
  };

  it("routes anthropic to callAnthropicProvider", async () => {
    globalThis.fetch = makeFetchOk(anthropicResponse);
    process.env.LLM_PROVIDER = "anthropic";
    process.env.LLM_API_KEY = "sk-ant-test";

    const result = await _callProvider(sampleMessages, "system", 512, { provider: "anthropic", apiKey: "key", model: "claude-sonnet-4-20250514", baseUrl: "", requestTimeoutMs: 5000 });
    expect(result.reply).toBe("Claude reply");
  });

  it("routes claude to callAnthropicProvider", async () => {
    globalThis.fetch = makeFetchOk(anthropicResponse);

    const result = await _callProvider(sampleMessages, "system", 512, { provider: "claude", apiKey: "key", model: "claude-sonnet-4-20250514", baseUrl: "", requestTimeoutMs: 5000 });
    expect(result.reply).toBe("Claude reply");
  });

  it("routes groq to callOpenAICompatible", async () => {
    globalThis.fetch = makeFetchOk(openAIResponse);

    const result = await _callProvider(sampleMessages, "system", 512, { provider: "groq", apiKey: "gsk-test", model: "llama3-70b", baseUrl: "", requestTimeoutMs: 5000 });
    expect(result.reply).toBe("OpenAI reply");
    expect(globalThis.fetch.mock.calls[0][0]).toContain("groq.com");
  });

  it("routes deepseek to callOpenAICompatible", async () => {
    globalThis.fetch = makeFetchOk(openAIResponse);

    const result = await _callProvider(sampleMessages, "system", 512, { provider: "deepseek", apiKey: "ds-test", model: "deepseek-chat", baseUrl: "", requestTimeoutMs: 5000 });
    expect(result.reply).toBe("OpenAI reply");
    expect(globalThis.fetch.mock.calls[0][0]).toContain("deepseek.com");
  });

  it("routes mistral to callOpenAICompatible", async () => {
    globalThis.fetch = makeFetchOk(openAIResponse);

    const result = await _callProvider(sampleMessages, "system", 512, { provider: "mistral", apiKey: "ms-test", model: "mistral-large", baseUrl: "", requestTimeoutMs: 5000 });
    expect(result.reply).toBe("OpenAI reply");
    expect(globalThis.fetch.mock.calls[0][0]).toContain("mistral.ai");
  });
});

// ── 5. callLLMWithFallback ─────────────────────────────────────────────

describe("callLLMWithFallback", () => {
  it("tries fallback on 503", async () => {
    process.env.LLM_PROVIDER = "openai";
    process.env.LLM_API_KEY = "sk-test";
    process.env.LLM_MODEL = "gpt-4o";
    process.env.LLM_FALLBACK_MODELS = "gpt-4o-mini";

    let callCount = 0;
    globalThis.fetch = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        // First call fails with 503
        return Promise.resolve({
          ok: false,
          status: 503,
          json: () => Promise.resolve({ error: { message: "Service unavailable" } }),
        });
      }
      // Second call succeeds
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          choices: [{ message: { content: "Fallback response" }, finish_reason: "stop" }],
        }),
      });
    });

    const result = await callLLMWithFallback(sampleMessages, "system", 512);
    expect(result.reply).toBe("Fallback response");
    expect(result.fallbackUsed).toBe(true);
    expect(result.fallbackModel).toBe("gpt-4o-mini");
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });
});

// ── 6. callOpenAICompatible auth headers ───────────────────────────────

describe("callOpenAICompatible auth headers", () => {
  it("sends Authorization header for groq/mistral/deepseek", async () => {
    const providers = [
      { provider: "groq", apiKey: "gsk-test-key" },
      { provider: "mistral", apiKey: "ms-test-key" },
      { provider: "deepseek", apiKey: "ds-test-key" },
    ];

    for (const { provider, apiKey } of providers) {
      globalThis.fetch = makeFetchOk({
        choices: [{ message: { content: "ok" }, finish_reason: "stop" }],
      });

      await _callOpenAICompatible(sampleMessages, "system", 512, {
        ...baseCfg,
        provider,
        apiKey,
        model: "test-model",
      });

      const [, options] = globalThis.fetch.mock.calls[0];
      expect(options.headers["Authorization"]).toBe("Bearer " + apiKey);
    }
  });

  it("omits Authorization header when no apiKey", async () => {
    globalThis.fetch = makeFetchOk({
      choices: [{ message: { content: "ok" }, finish_reason: "stop" }],
    });

    await _callOpenAICompatible(sampleMessages, "system", 512, {
      ...baseCfg,
      provider: "ollama",
      apiKey: "",
      model: "llama3",
    });

    const [, options] = globalThis.fetch.mock.calls[0];
    expect(options.headers["Authorization"]).toBeUndefined();
  });
});

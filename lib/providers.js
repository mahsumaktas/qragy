/**
 * Multi-model provider abstraction
 *
 * Supports: Gemini (default), OpenAI, Ollama, Anthropic/Claude, Groq, Mistral, DeepSeek
 * Zero new dependencies — all providers use raw fetch()
 */

"use strict";

// ── Config helpers ──────────────────────────────────────────────────────

function getProviderConfig() {
  const provider = (process.env.LLM_PROVIDER || "gemini").toLowerCase();
  const embeddingProvider = (process.env.EMBEDDING_PROVIDER || provider).toLowerCase();

  return {
    // LLM
    provider,
    apiKey: process.env.LLM_API_KEY || process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY || "",
    model: process.env.LLM_MODEL || process.env.GOOGLE_MODEL || "gemini-2.5-flash-preview-05-20",
    baseUrl: (process.env.LLM_BASE_URL || "").replace(/\/+$/, ""),
    fallbackModels: (process.env.LLM_FALLBACK_MODELS || process.env.LLM_FALLBACK_MODEL || process.env.GOOGLE_FALLBACK_MODEL || "")
      .split(",").map(m => m.trim()).filter(Boolean),
    maxOutputTokens: Number(process.env.LLM_MAX_OUTPUT_TOKENS || process.env.GOOGLE_MAX_OUTPUT_TOKENS || 1024),
    thinkingBudget: Number(process.env.GOOGLE_THINKING_BUDGET || 64),
    enableThinking: (process.env.ENABLE_THINKING || "false").toLowerCase(),
    requestTimeoutMs: Number(process.env.LLM_REQUEST_TIMEOUT_MS || process.env.GOOGLE_REQUEST_TIMEOUT_MS || 15000),

    // Embedding
    embeddingProvider,
    embeddingModel: process.env.EMBEDDING_MODEL || "gemini-embedding-001",
    embeddingApiKey: process.env.EMBEDDING_API_KEY || process.env.LLM_API_KEY || process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY || "",
    embeddingBaseUrl: (process.env.EMBEDDING_BASE_URL || "").replace(/\/+$/, ""),
    embeddingDimensions: Number(process.env.EMBEDDING_DIMENSIONS || 0),
  };
}

// ── Gemini Provider ─────────────────────────────────────────────────────

function buildGeminiGenerationConfig(maxOutputTokens, thinkingBudget, withThinking) {
  const config = { temperature: 0.2, maxOutputTokens };
  if (withThinking && thinkingBudget > 0) {
    config.thinkingConfig = { thinkingBudget };
  }
  return config;
}

function isThinkingNotSupportedError(error) {
  const msg = (error?.message || "").toLowerCase();
  return msg.includes("thinking is not supported") || msg.includes("thinking_budget");
}

async function executeGeminiRequest(endpoint, body, cfg) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), cfg.requestTimeoutMs);

  let response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify(body),
    });
  } catch (error) {
    if (error?.name === "AbortError") {
      const te = new Error("LLM request timed out.");
      te.status = 504;
      throw te;
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const err = new Error(payload?.error?.message || "Gemini API error.");
    err.status = response.status;
    throw err;
  }

  const reply = (payload?.candidates?.[0]?.content?.parts || [])
    .map((part) => (typeof part?.text === "string" ? part.text : ""))
    .join("\n")
    .trim();

  return {
    reply,
    finishReason: payload?.candidates?.[0]?.finishReason || "",
    payload,
  };
}

async function callGeminiProvider(messages, systemPrompt, maxOutputTokens, cfg) {
  const endpoint =
    "https://generativelanguage.googleapis.com/v1beta/models/" +
    encodeURIComponent(cfg.model) +
    ":generateContent?key=" +
    encodeURIComponent(cfg.apiKey);

  // enableThinking: "true" = her zaman gonder, "false" = asla, "auto" = dene, hata verirse otomatik kapat
  const enableThinking = (cfg.enableThinking || "auto").toLowerCase();
  const shouldTryThinking = enableThinking !== "false" && cfg.thinkingBudget > 0;

  const body = {
    systemInstruction: { parts: [{ text: systemPrompt }] },
    contents: messages,
    generationConfig: buildGeminiGenerationConfig(maxOutputTokens, cfg.thinkingBudget, shouldTryThinking),
  };

  try {
    return await executeGeminiRequest(endpoint, body, cfg);
  } catch (error) {
    // Auto-fallback: thinking desteklemiyorsa, thinking olmadan tekrar dene
    if (enableThinking === "auto" && shouldTryThinking && isThinkingNotSupportedError(error)) {
      console.warn("[Gemini] Model thinking desteklemiyor, otomatik fallback (thinking kapatildi)");
      body.generationConfig = buildGeminiGenerationConfig(maxOutputTokens, cfg.thinkingBudget, false);
      return await executeGeminiRequest(endpoint, body, cfg);
    }
    throw error;
  }
}

// ── Anthropic (Claude) Provider ──────────────────────────────────────────

async function callAnthropicProvider(messages, systemPrompt, maxOutputTokens, cfg) {
  const baseUrl = cfg.baseUrl || "https://api.anthropic.com";
  const url = baseUrl + "/v1/messages";

  // Convert Gemini message format to Anthropic format
  const anthropicMessages = [];
  for (const msg of messages) {
    const role = msg.role === "model" ? "assistant" : "user";
    const content = (msg.parts || [])
      .map((p) => (typeof p?.text === "string" ? p.text : ""))
      .join("\n")
      .trim();
    if (content) {
      anthropicMessages.push({ role, content });
    }
  }

  const body = {
    model: cfg.model,
    max_tokens: maxOutputTokens,
    system: systemPrompt,
    messages: anthropicMessages,
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), cfg.requestTimeoutMs);

  let response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": cfg.apiKey,
        "anthropic-version": "2023-06-01",
      },
      signal: controller.signal,
      body: JSON.stringify(body),
    });
  } catch (error) {
    if (error?.name === "AbortError") {
      const te = new Error("LLM request timed out.");
      te.status = 504;
      throw te;
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const err = new Error(payload?.error?.message || "Anthropic API error.");
    err.status = response.status;
    throw err;
  }

  const reply = (payload.content || [])
    .filter(block => block.type === "text")
    .map(block => block.text)
    .join("\n")
    .trim();

  const finishReason = payload.stop_reason === "max_tokens" ? "MAX_TOKENS" : (payload.stop_reason || "STOP").toUpperCase();

  return { reply, finishReason, payload };
}

// ── OpenAI-Compatible Provider (OpenAI + Ollama + Groq + Mistral + DeepSeek) ──

function buildOpenAIBaseUrl(cfg) {
  if (cfg.baseUrl) return cfg.baseUrl;
  switch (cfg.provider) {
    case "ollama": return "http://localhost:11434/v1";
    case "groq": return "https://api.groq.com/openai/v1";
    case "mistral": return "https://api.mistral.ai/v1";
    case "deepseek": return "https://api.deepseek.com/v1";
    default: return "https://api.openai.com/v1";
  }
}

async function callOpenAICompatible(messages, systemPrompt, maxOutputTokens, cfg) {
  const baseUrl = buildOpenAIBaseUrl(cfg);
  const url = baseUrl + "/chat/completions";

  // Convert Gemini message format to OpenAI format
  const openAIMessages = [{ role: "system", content: systemPrompt }];

  for (const msg of messages) {
    const role = msg.role === "model" ? "assistant" : "user";
    const content = (msg.parts || [])
      .map((p) => (typeof p?.text === "string" ? p.text : ""))
      .join("\n")
      .trim();
    if (content) {
      openAIMessages.push({ role, content });
    }
  }

  const headers = { "Content-Type": "application/json" };
  if (cfg.apiKey) {
    headers["Authorization"] = "Bearer " + cfg.apiKey;
  }

  const body = {
    model: cfg.model,
    messages: openAIMessages,
    max_tokens: maxOutputTokens,
    temperature: 0.2,
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), cfg.requestTimeoutMs);

  let response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers,
      signal: controller.signal,
      body: JSON.stringify(body),
    });
  } catch (error) {
    if (error?.name === "AbortError") {
      const te = new Error("LLM request timed out.");
      te.status = 504;
      throw te;
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const err = new Error(payload?.error?.message || `${cfg.provider} API error.`);
    err.status = response.status;
    throw err;
  }

  const choice = payload?.choices?.[0] || {};
  const reply = (choice.message?.content || "").trim();
  const finishReason = choice.finish_reason || "";

  // Map OpenAI finish_reason to Gemini-compatible values
  const mappedReason = finishReason === "length" ? "MAX_TOKENS" : finishReason.toUpperCase();

  return { reply, finishReason: mappedReason, payload };
}

// ── Unified LLM Interface ───────────────────────────────────────────────

async function callProvider(messages, systemPrompt, maxOutputTokens, cfgOverride) {
  const cfg = { ...getProviderConfig(), ...cfgOverride };

  switch (cfg.provider) {
    case "anthropic":
    case "claude":
      return callAnthropicProvider(messages, systemPrompt, maxOutputTokens, cfg);
    case "openai":
    case "ollama":
    case "groq":
    case "mistral":
    case "deepseek":
      return callOpenAICompatible(messages, systemPrompt, maxOutputTokens, cfg);
    case "gemini":
    default:
      return callGeminiProvider(messages, systemPrompt, maxOutputTokens, cfg);
  }
}

async function callLLM(messages, systemPrompt, maxOutputTokens, options) {
  return callProvider(messages, systemPrompt, maxOutputTokens, options);
}

const FALLBACK_STATUS_CODES = new Set([404, 429, 500, 503]);

async function callLLMWithFallback(messages, systemPrompt, maxOutputTokens, options) {
  const cfg = { ...getProviderConfig(), ...options };
  const models = [cfg.model, ...cfg.fallbackModels];

  let lastError = null;
  for (let i = 0; i < models.length; i++) {
    try {
      const result = await callProvider(
        messages, systemPrompt, maxOutputTokens,
        { ...options, model: models[i] }
      );
      if (i > 0) {
        console.warn(`[Fallback] ${models[i]} basarili (${i}. yedek)`);
        return { ...result, fallbackUsed: true, fallbackModel: models[i] };
      }
      return result;
    } catch (error) {
      lastError = error;
      const status = Number(error?.status) || 0;
      const canRetry = FALLBACK_STATUS_CODES.has(status) && i < models.length - 1;
      if (canRetry) {
        console.warn(`[Fallback] ${models[i]} basarisiz (${status}), sonraki: ${models[i + 1]}`);
        continue;
      }
      // Tum zincir tukendi — kullanici dostu hata
      if (i > 0) {
        console.error(`[Fallback] Tum modeller basarisiz (${models.join(" → ")})`);
        const friendly = new Error("Tum AI modelleri su an yogun. Lutfen birkaç dakika sonra tekrar deneyin.");
        friendly.status = 503;
        throw friendly;
      }
      throw error;
    }
  }
  throw lastError;
}

// ── Embedding Providers ─────────────────────────────────────────────────

async function embedGemini(text, cfg) {
  const model = cfg.embeddingModel || "gemini-embedding-001";
  const url =
    "https://generativelanguage.googleapis.com/v1beta/models/" +
    encodeURIComponent(model) +
    ":embedContent?key=" +
    encodeURIComponent(cfg.embeddingApiKey);

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content: { parts: [{ text }] } }),
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => "");
    const err = new Error(`Embedding error: ${res.status} - ${errBody}`);
    err.status = res.status;
    throw err;
  }

  const data = await res.json();
  return data.embedding.values;
}

async function embedOpenAI(text, cfg) {
  const baseUrl = cfg.embeddingBaseUrl || "https://api.openai.com/v1";
  const model = cfg.embeddingModel || "text-embedding-3-small";
  const url = baseUrl + "/embeddings";

  const headers = { "Content-Type": "application/json" };
  if (cfg.embeddingApiKey) {
    headers["Authorization"] = "Bearer " + cfg.embeddingApiKey;
  }

  const body = { model, input: text };
  if (cfg.embeddingDimensions) {
    body.dimensions = cfg.embeddingDimensions;
  }

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => "");
    const err = new Error(`Embedding error: ${res.status} - ${errBody}`);
    err.status = res.status;
    throw err;
  }

  const data = await res.json();
  return data?.data?.[0]?.embedding || [];
}

async function embedOllama(text, cfg) {
  const baseUrl = cfg.embeddingBaseUrl || "http://localhost:11434";
  const model = cfg.embeddingModel || "nomic-embed-text";
  const url = baseUrl.replace(/\/v1\/?$/, "") + "/api/embed";

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, input: text }),
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => "");
    const err = new Error(`Embedding error: ${res.status} - ${errBody}`);
    err.status = res.status;
    throw err;
  }

  const data = await res.json();
  // Ollama /api/embed returns { embeddings: [[...]] }
  return data?.embeddings?.[0] || [];
}

async function embedText(text) {
  const cfg = getProviderConfig();

  switch (cfg.embeddingProvider) {
    case "openai":
      return embedOpenAI(text, cfg);
    case "ollama":
      return embedOllama(text, cfg);
    case "gemini":
    default:
      return embedGemini(text, cfg);
  }
}

// ── Exports ─────────────────────────────────────────────────────────────

module.exports = {
  callLLM,
  callLLMWithFallback,
  embedText,
  getProviderConfig,
  // Internal — exposed for testing
  _callProvider: callProvider,
  _callAnthropicProvider: callAnthropicProvider,
  _callOpenAICompatible: callOpenAICompatible,
  _buildOpenAIBaseUrl: buildOpenAIBaseUrl,
};

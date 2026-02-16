/**
 * Multi-model provider abstraction
 *
 * Supports: Gemini (default), OpenAI, Ollama
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
    fallbackModel: process.env.LLM_FALLBACK_MODEL || process.env.GOOGLE_FALLBACK_MODEL || "",
    maxOutputTokens: Number(process.env.LLM_MAX_OUTPUT_TOKENS || process.env.GOOGLE_MAX_OUTPUT_TOKENS || 1024),
    thinkingBudget: Number(process.env.GOOGLE_THINKING_BUDGET || 64),
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

function buildGeminiGenerationConfig(maxOutputTokens, thinkingBudget) {
  const config = { temperature: 0.2, maxOutputTokens };
  if (thinkingBudget > 0) {
    config.thinkingConfig = { thinkingBudget };
  }
  return config;
}

async function callGeminiProvider(messages, systemPrompt, maxOutputTokens, cfg) {
  const endpoint =
    "https://generativelanguage.googleapis.com/v1beta/models/" +
    encodeURIComponent(cfg.model) +
    ":generateContent?key=" +
    encodeURIComponent(cfg.apiKey);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), cfg.requestTimeoutMs);

  let response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: messages,
        generationConfig: buildGeminiGenerationConfig(maxOutputTokens, cfg.thinkingBudget),
      }),
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

// ── OpenAI-Compatible Provider (OpenAI + Ollama) ────────────────────────

function buildOpenAIBaseUrl(cfg) {
  if (cfg.baseUrl) return cfg.baseUrl;
  if (cfg.provider === "ollama") return "http://localhost:11434/v1";
  return "https://api.openai.com/v1";
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
  if (cfg.apiKey && cfg.provider !== "ollama") {
    headers["Authorization"] = "Bearer " + cfg.apiKey;
  } else if (cfg.apiKey && cfg.provider === "ollama") {
    // Ollama may optionally use auth
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
    case "openai":
    case "ollama":
      return callOpenAICompatible(messages, systemPrompt, maxOutputTokens, cfg);
    case "gemini":
    default:
      return callGeminiProvider(messages, systemPrompt, maxOutputTokens, cfg);
  }
}

async function callLLM(messages, systemPrompt, maxOutputTokens, options) {
  return callProvider(messages, systemPrompt, maxOutputTokens, options);
}

async function callLLMWithFallback(messages, systemPrompt, maxOutputTokens, options) {
  try {
    return await callProvider(messages, systemPrompt, maxOutputTokens, options);
  } catch (error) {
    const status = Number(error?.status) || 0;
    const cfg = { ...getProviderConfig(), ...options };

    if (cfg.fallbackModel && (status === 404 || status === 429 || status === 500 || status === 503)) {
      console.warn(`Primary model error (${status}), trying fallback: ${cfg.fallbackModel}`);
      const fallbackResult = await callProvider(
        messages,
        systemPrompt,
        maxOutputTokens,
        { ...options, model: cfg.fallbackModel }
      );
      return { ...fallbackResult, fallbackUsed: true };
    }
    throw error;
  }
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

module.exports = { callLLM, callLLMWithFallback, embedText, getProviderConfig };

"use strict";

/**
 * Cross-encoder Reranker — 3-tier fallback strategy
 *
 * 1. Cohere Rerank API (when cohereApiKey exists)
 * 2. LLM-as-reranker (callLLM ile skor verdir)
 * 3. RRF / text score fallback (son care)
 */

const COHERE_RERANK_URL = "https://api.cohere.com/v1/rerank";
const COHERE_MODEL = "rerank-v3.5";
const COHERE_TIMEOUT_MS = 5000;

// ── Strategy 1: Cohere Rerank API ───────────────────────────────────────

async function cohereRerank(query, results, cohereApiKey, _logger) {
  const documents = results.map(
    (r) => `${r.question || ""} ${r.answer || ""}`.trim()
  );

  const body = {
    model: COHERE_MODEL,
    query,
    documents,
    top_n: results.length,
  };

  const response = await fetch(COHERE_RERANK_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${cohereApiKey}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(COHERE_TIMEOUT_MS),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    throw new Error(`Cohere rerank failed: ${response.status} - ${errText}`);
  }

  const data = await response.json();

  return data.results.map((r) => ({
    ...results[r.index],
    _rerankScore: r.relevance_score,
  }));
}

// ── Strategy 2: LLM-as-reranker ────────────────────────────────────────

const LLM_RERANK_SYSTEM_PROMPT = [
  "Sen bir bilgi bankasi sonuc puanlayicisisin.",
  "Kullanici sorusu ve bilgi bankasi sonuclari verilecek.",
  "Her sonucun soruyla ne kadar ilgili oldugunu 0 ile 1 arasinda puanla.",
  "0 = hic ilgisiz, 1 = tam ilgili.",
  "SADECE JSON array dondur, baska bir sey yazma.",
  'Format: [{"index": 0, "score": 0.95}, {"index": 1, "score": 0.3}]',
].join("\n");

function buildLLMRerankPrompt(query, results) {
  const items = results.map((r, i) => `[${i}] Soru: ${r.question || ""}\nCevap: ${r.answer || ""}`);
  return `Kullanici sorusu: "${query}"\n\nSonuclar:\n${items.join("\n\n")}\n\nHer sonucu 0-1 arasi puanla. JSON array dondur.`;
}

function parseScoresFromLLMReply(reply) {
  // Strip ```json ... ``` markers
  let cleaned = reply.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/, "").replace(/```\s*$/, "");
  }
  return JSON.parse(cleaned);
}

async function llmRerank(query, results, callLLM, getProviderConfig, _logger) {
  const messages = [
    { role: "user", parts: [{ text: buildLLMRerankPrompt(query, results) }] },
  ];

  const providerConfig = getProviderConfig();
  const { reply } = await callLLM(messages, LLM_RERANK_SYSTEM_PROMPT, 1024, providerConfig);
  const scores = parseScoresFromLLMReply(reply);

  // Validate and map
  const scoreMap = new Map();
  for (const item of scores) {
    if (typeof item.index === "number" && typeof item.score === "number") {
      scoreMap.set(item.index, Math.max(0, Math.min(1, item.score)));
    }
  }

  return results.map((r, i) => ({
    ...r,
    _rerankScore: scoreMap.has(i) ? scoreMap.get(i) : 0,
  }));
}

// ── Strategy 3: RRF / text score fallback ───────────────────────────────

function rrfFallback(results) {
  return results.map((r, rank) => ({
    ...r,
    _rerankScore: r.rrfScore || r._textScore || 1 / (60 + rank + 1),
  }));
}

// ── Factory ─────────────────────────────────────────────────────────────

function createReranker(deps) {
  const { callLLM, getProviderConfig, logger, cohereApiKey } = deps;

  async function rerank(query, results) {
    if (!results || results.length === 0) {
      return [];
    }

    // Strategy 1: Cohere
    if (cohereApiKey) {
      try {
        const reranked = await cohereRerank(query, results, cohereApiKey, logger);
        logger.info(`[Reranker] Cohere rerank basarili (${reranked.length} sonuc)`);
        return reranked.sort((a, b) => b._rerankScore - a._rerankScore);
      } catch (err) {
        logger.warn(`[Reranker] Cohere basarisiz, LLM fallback: ${err.message}`);
      }
    }

    // Strategy 2: LLM-as-reranker
    try {
      const reranked = await llmRerank(query, results, callLLM, getProviderConfig, logger);
      logger.info(`[Reranker] LLM rerank basarili (${reranked.length} sonuc)`);
      return reranked.sort((a, b) => b._rerankScore - a._rerankScore);
    } catch (err) {
      logger.warn(`[Reranker] LLM rerank basarisiz, RRF fallback: ${err.message}`);
    }

    // Strategy 3: RRF fallback
    const reranked = rrfFallback(results);
    logger.info(`[Reranker] RRF fallback kullanildi (${reranked.length} sonuc)`);
    return reranked.sort((a, b) => b._rerankScore - a._rerankScore);
  }

  return { rerank };
}

module.exports = { createReranker };

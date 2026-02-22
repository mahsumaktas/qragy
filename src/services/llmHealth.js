/**
 * LLM Health Check Service
 *
 * Encapsulates LLM health status tracking, error logging,
 * and periodic health-check logic behind a factory function.
 *
 * Usage:
 *   const { createLLMHealthService } = require("./src/services/llmHealth");
 *   const llmHealth = createLLMHealthService({ logger, callLLM, getProviderConfig });
 */

function createLLMHealthService({
  logger,
  callLLM,
  getProviderConfig,
  errorWindowMs = 10 * 60 * 1000,
}) {
  // ── Encapsulated state ──────────────────────────────────────────────────
  let llmHealthStatus = {
    ok: false,
    checkedAt: null,
    error: null,
    latencyMs: null,
    provider: null,
  };
  const llmErrorLog = [];

  // ── recordLLMError ──────────────────────────────────────────────────────
  function recordLLMError(error, context) {
    const now = Date.now();
    llmErrorLog.push({
      timestamp: now,
      error: (error?.message || String(error)).slice(0, 200),
      status: Number(error?.status) || 0,
      context,
    });
    // Eski kayitlari temizle (pencere disi)
    while (
      llmErrorLog.length > 0 &&
      llmErrorLog[0].timestamp < now - errorWindowMs
    ) {
      llmErrorLog.shift();
    }
    // Maks 100 kayit tut
    if (llmErrorLog.length > 100) {
      llmErrorLog.splice(0, llmErrorLog.length - 100);
    }
  }

  // ── getLLMErrorSummary ──────────────────────────────────────────────────
  function getLLMErrorSummary() {
    const now = Date.now();
    const recent = llmErrorLog.filter(
      (e) => e.timestamp > now - errorWindowMs
    );
    if (!recent.length) return { recentErrors: 0, lastError: null };
    const statusCounts = {};
    for (const e of recent) {
      const key = e.status || "unknown";
      statusCounts[key] = (statusCounts[key] || 0) + 1;
    }
    return {
      recentErrors: recent.length,
      statusCounts,
      lastError: recent[recent.length - 1].error,
      lastErrorAt: new Date(recent[recent.length - 1].timestamp).toISOString(),
    };
  }

  // ── checkLLMHealth ──────────────────────────────────────────────────────
  async function checkLLMHealth() {
    const start = Date.now();
    const cfg = getProviderConfig();
    try {
      const result = await callLLM(
        [{ role: "user", parts: [{ text: "ping" }] }],
        "Respond with pong. Only say pong, nothing else.",
        128
      );
      const latencyMs = Date.now() - start;
      const reply = (result?.reply || "").trim().toLowerCase();
      // Yanit dogrulamasi — API cevap donmeli (MAX_TOKENS da kabul, onemli olan yanit donmesi)
      if (!reply && result?.finishReason !== "MAX_TOKENS") {
        throw new Error("API yanit donmedi (bos response)");
      }
      const errorSummary = getLLMErrorSummary();
      llmHealthStatus = {
        ok: true,
        checkedAt: new Date().toISOString(),
        error: null,
        latencyMs,
        provider: cfg.provider + " / " + cfg.model,
        recentErrors: errorSummary.recentErrors,
        lastError: errorSummary.lastError,
        lastErrorAt: errorSummary.lastErrorAt || null,
      };
      // Eger son pencerede hatalar varsa uyari ver
      if (errorSummary.recentErrors > 0) {
        llmHealthStatus.warning =
          errorSummary.recentErrors + " hata (son 10dk)";
        logger.warn(
          "llm-health",
          `OK (${latencyMs}ms) — ${errorSummary.recentErrors} hata (son 10dk)`
        );
      } else {
        logger.info("llm-health", `OK (${latencyMs}ms)`);
      }
    } catch (err) {
      recordLLMError(err, "health-check");
      const errorSummary = getLLMErrorSummary();
      llmHealthStatus = {
        ok: false,
        checkedAt: new Date().toISOString(),
        error: err.message || "Bilinmeyen hata",
        latencyMs: null,
        provider: cfg.provider + " / " + cfg.model,
        recentErrors: errorSummary.recentErrors,
        lastError: errorSummary.lastError,
        lastErrorAt: errorSummary.lastErrorAt || null,
      };
      logger.error("llm-health", "FAIL", err);
    }
  }

  // ── Public API ──────────────────────────────────────────────────────────
  return {
    recordLLMError,
    getLLMErrorSummary,
    checkLLMHealth,
    getLlmHealthStatus: () => llmHealthStatus,
  };
}

module.exports = { createLLMHealthService };

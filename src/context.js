function createAppContext() {
  return {
    // LLM health tracking
    llmHealthStatus: { ok: false, checkedAt: null, error: null, latencyMs: null, provider: null },
    llmErrorLog: [],
    LLM_ERROR_WINDOW_MS: 10 * 60 * 1000,

    // Analytics
    analyticsBuffer: [],
    analyticsData: { daily: {} },

    // Conversation state
    clarificationCounters: new Map(),

    // Topic file cache
    topicFileCache: new Map(),
  };
}

module.exports = { createAppContext };

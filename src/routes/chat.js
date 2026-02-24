"use strict";

/**
 * Chat API Route — Main Handler
 *
 * Thin orchestrator for /api/chat endpoint.
 * Delegates processing to webChatPipeline service.
 * mount(app, deps) pattern — all dependencies injected via deps.
 */
function mount(app, deps) {
  const {
    // Rate limiting
    checkRateLimit,
    RATE_LIMIT_WINDOW_MS,

    // Message parsing
    extractTicketMemory,
    splitActiveTicketMessages,
    getUserMessages,

    // Injection guard
    detectInjection,
    checkRelevanceLLM,
    callLLM,
    GENERIC_REPLY,

    // Conversation tracking
    upsertConversation,
    loadConversations,
    saveConversations,

    // Context processing
    compressConversationHistory,
    buildConversationContext,

    // Getters
    getSupportAvailability,
    getGoogleModel,

    // Error handling
    recordAnalyticsEvent,
    recordLLMError,
    buildMissingFieldsReply,

    // Pipeline service (injected)
    webChatPipeline,

    // Adaptive pipeline (feature-flagged)
    ngChatPipeline,
    USE_ADAPTIVE_PIPELINE,
    loadCSVData,
    validateOutput,
    maskCredentials,
    getSoulText,
    getPersonaText,
  } = deps;

  // ── Main Chat Handler ─────────────────────────────────────────────────
  app.post("/api/chat", async (req, res) => {
    const chatStartTime = Date.now();
    try {
      // Rate limiting
      const clientIp = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.socket?.remoteAddress || "unknown";
      if (!checkRateLimit(clientIp)) {
        return res.status(429).json({ error: "Cok fazla istek gonderdiniz. Lutfen biraz bekleyin.", retryAfterMs: RATE_LIMIT_WINDOW_MS });
      }

      const rawMessages = Array.isArray(req.body?.messages) ? req.body.messages : [];
      const sessionId = String(req.body?.sessionId || "").trim() || ("auto-" + clientIp + "-" + Date.now().toString(36));

      if (!rawMessages.length) {
        return res.status(400).json({ error: "messages alani bos olamaz." });
      }

      // Message length limit
      const MAX_MESSAGE_LENGTH = 1000;
      const latestUserMsg = rawMessages[rawMessages.length - 1];
      if (latestUserMsg && latestUserMsg.role === "user" && typeof latestUserMsg.content === "string" && latestUserMsg.content.length > MAX_MESSAGE_LENGTH) {
        return res.status(400).json({ error: `Mesaj cok uzun. Maksimum ${MAX_MESSAGE_LENGTH} karakter gonderilebilir.` });
      }

      // Injection Guard — Layer 1 (input sanitization)
      const latestMsg = rawMessages[rawMessages.length - 1];
      if (latestMsg && latestMsg.role === "user") {
        const injectionCheck = detectInjection(latestMsg.content || "");
        if (injectionCheck.blocked) {
          return res.json({ reply: GENERIC_REPLY, source: "injection-blocked", sessionId });
        }
      }

      // Inject sessionId into all responses
      const originalJson = res.json.bind(res);
      res.json = (data) => {
        if (data && typeof data === "object" && !data.sessionId) {
          data.sessionId = sessionId;
        }
        return originalJson(data);
      };

      // Parse messages and track conversation
      const earlyMemory = extractTicketMemory(rawMessages);
      upsertConversation(sessionId, rawMessages, earlyMemory, { ip: clientIp, source: req.body?.source || "web" });
      const { activeMessages, hasClosedTicketHistory, lastClosedTicketMemory } =
        splitActiveTicketMessages(rawMessages);
      const activeUserMessages = getUserMessages(activeMessages);
      const memory = extractTicketMemory(activeMessages);
      const latestUserMessage = activeUserMessages[activeUserMessages.length - 1] || "";

      // Early detection checks (gibberish, farewell, status followup, post-escalation)
      const earlyResult = webChatPipeline.runEarlyChecks({
        latestUserMessage, activeUserMessages, rawMessages, sessionId,
        memory, hasClosedTicketHistory, lastClosedTicketMemory, chatStartTime
      });
      if (earlyResult) return res.json(earlyResult);

      // Context window compression for long conversations
      let processedMessages = activeMessages;
      if (activeMessages.length > 10) {
        processedMessages = await compressConversationHistory(activeMessages);
      }

      const contents = processedMessages
        .filter((item) => item && typeof item.content === "string" && item.content.trim())
        .map((item) => ({
          role: item.role === "assistant" ? "model" : "user",
          parts: [{ text: item.content.trim() }]
        }));

      if (!contents.length) {
        return res.status(400).json({ error: "Ge\u00e7erli mesaj bulunamad\u0131." });
      }

      const chatHistorySnapshot = activeMessages
        .filter(m => m && m.content)
        .slice(-50)
        .map(m => ({ role: m.role, content: String(m.content).slice(0, 500) }));

      const conversationContext = await buildConversationContext(memory, activeUserMessages);

      // Ticket creation (required fields met)
      const ticketResult = await webChatPipeline.handleTicketCreation({
        contents, memory, conversationContext, sessionId,
        chatHistorySnapshot, hasClosedTicketHistory, chatStartTime
      });
      if (ticketResult) return res.json(ticketResult);

      // Escalation trigger
      const escalationResult = await webChatPipeline.handleEscalation({
        contents, memory, conversationContext, sessionId,
        chatHistorySnapshot, hasClosedTicketHistory, chatStartTime
      });
      if (escalationResult) return res.json(escalationResult);

      // Deterministic reply
      const deterministicResult = webChatPipeline.handleDeterministicReply({
        rawMessages, memory, conversationContext, activeUserMessages,
        hasClosedTicketHistory, chatStartTime
      });
      if (deterministicResult) return res.json(deterministicResult);

      // Relevance guardrail — off-topic mesajlari LLM ile yakala (sadece konu tespit edilemediginde)
      if (!conversationContext.currentTopic && typeof checkRelevanceLLM === "function" && callLLM) {
        const relevanceCheck = await checkRelevanceLLM(latestUserMessage, callLLM);
        if (!relevanceCheck.relevant) {
          recordAnalyticsEvent({ source: "relevance-blocked", reason: relevanceCheck.reason, responseTimeMs: Date.now() - chatStartTime });
          return res.json({ reply: GENERIC_REPLY, source: "relevance-blocked", sessionId, memory, handoffReady: false });
        }
      }

      // AI response generation — adaptive pipeline or legacy
      if (USE_ADAPTIVE_PIPELINE && ngChatPipeline) {
        const knowledgeBase = typeof loadCSVData === "function" ? loadCSVData() : [];
        const adaptiveResult = await ngChatPipeline.process({
          userMessage: latestUserMessage,
          chatHistory: chatHistorySnapshot,
          sessionId,
          userId: sessionId,
          knowledgeBase,
          kbSize: knowledgeBase.length,
          memory,
          conversationContext,
        });

        let reply = adaptiveResult.reply || "";

        // Output validation (same as legacy pipeline)
        if (typeof validateOutput === "function") {
          const soulText = typeof getSoulText === "function" ? getSoulText() : "";
          const personaText = typeof getPersonaText === "function" ? getPersonaText() : "";
          const systemFragments = [
            (typeof soulText === "string" ? soulText : "").slice(0, 50),
            (typeof personaText === "string" ? personaText : "").slice(0, 50),
          ].filter(Boolean);
          const outputCheck = validateOutput(reply, systemFragments);
          if (!outputCheck.safe) {
            reply = GENERIC_REPLY;
          }
        }

        // Credential masking
        if (typeof maskCredentials === "function") {
          reply = maskCredentials(reply);
        }

        recordAnalyticsEvent({
          source: `adaptive-${adaptiveResult.route}`,
          responseTimeMs: Date.now() - chatStartTime,
        });

        return res.json({
          reply,
          model: getGoogleModel(),
          source: `adaptive-${adaptiveResult.route}`,
          support: getSupportAvailability(),
          memory,
          conversationContext,
          hasClosedTicketHistory,
          handoffReady: false,
          citations: adaptiveResult.citations || [],
          finishReason: adaptiveResult.finishReason,
        });
      }

      // Eval mode: temperature=0 for deterministic LLM output
      const llmOptions = req.headers["x-eval-mode"] === "true" ? { temperature: 0 } : undefined;

      const aiResult = await webChatPipeline.generateAIResponse({
        contents, latestUserMessage, memory, conversationContext,
        hasClosedTicketHistory, chatHistorySnapshot,
        sessionId, chatStartTime, llmOptions
      });
      return res.json(aiResult);

    } catch (error) {
      recordLLMError(error, "web-chat");
      const statusCode = Number(error?.status) || 500;
      if (statusCode >= 500) {
        const rawMessages = Array.isArray(req.body?.messages) ? req.body.messages : [];
        const { activeMessages, hasClosedTicketHistory } = splitActiveTicketMessages(rawMessages);
        const activeUserMessages = getUserMessages(activeMessages);
        const memory = extractTicketMemory(activeMessages);
        const latestUserMessage = activeUserMessages[activeUserMessages.length - 1] || "";
        const supportAvailability = getSupportAvailability();

        return res.json({
          reply: buildMissingFieldsReply(memory, latestUserMessage),
          model: getGoogleModel(),
          source: "fallback-error",
          memory,
          hasClosedTicketHistory,
          handoffReady: false,
          support: supportAvailability,
          warning: error?.message || "Beklenmeyen bir hata olustu."
        });
      }

      return res.status(statusCode).json({
        error: error?.message || "Beklenmeyen bir hata olustu."
      });
    }
  });

  // ── Web Conversation Stale Cleanup (server-side 30-min timeout) ──────────
  function checkWebConversationInactivity() {
    const data = loadConversations();
    const STALE_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
    const now = Date.now();
    let changed = false;

    for (const conv of data.conversations) {
      if (conv.status !== "active" && conv.status !== "ticketed") continue;
      const lastUpdate = Date.parse(conv.updatedAt || conv.createdAt || "");
      if (!Number.isFinite(lastUpdate)) continue;

      if (now - lastUpdate >= STALE_TIMEOUT_MS) {
        conv.status = "closed";
        conv.updatedAt = new Date().toISOString();
        changed = true;
        recordAnalyticsEvent({ source: "chat-closed", reason: "server-stale-timeout" });
      }
    }

    if (changed) saveConversations(data);
  }

  return {
    checkWebConversationInactivity,
  };
}

module.exports = { mount };

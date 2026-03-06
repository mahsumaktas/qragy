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
    appendBotResponse,
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
      // Rate limiting (eval mode from localhost bypasses)
      const clientIp = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.socket?.remoteAddress || "unknown";
      const isLocalEval = req.headers["x-eval-mode"] === "true" && /^(127\.|::1|localhost)/.test(clientIp);
      if (!isLocalEval && !checkRateLimit(clientIp)) {
        return res.status(429).json({ error: "Too many requests. Please wait a moment.", retryAfterMs: RATE_LIMIT_WINDOW_MS });
      }

      const rawMessages = Array.isArray(req.body?.messages) ? req.body.messages : [];
      const sessionId = String(req.body?.sessionId || "").trim() || ("auto-" + clientIp + "-" + Date.now().toString(36));

      if (!rawMessages.length) {
        return res.status(400).json({ error: "messages field cannot be empty." });
      }

      const MAX_MESSAGES_PER_REQUEST = 50;
      if (rawMessages.length > MAX_MESSAGES_PER_REQUEST) {
        return res.status(400).json({ error: `Too many messages. Maximum ${MAX_MESSAGES_PER_REQUEST} messages allowed.` });
      }

      // Message length limit
      const MAX_MESSAGE_LENGTH = 1000;
      const totalChars = rawMessages.reduce((sum, item) => (
        sum + (typeof item?.content === "string" ? item.content.length : 0)
      ), 0);
      const MAX_TOTAL_REQUEST_CHARS = 12000;
      if (totalChars > MAX_TOTAL_REQUEST_CHARS) {
        return res.status(400).json({ error: `Conversation payload too large. Maximum ${MAX_TOTAL_REQUEST_CHARS} characters allowed.` });
      }
      const latestUserMsg = rawMessages[rawMessages.length - 1];
      if (latestUserMsg && latestUserMsg.role === "user" && typeof latestUserMsg.content === "string" && latestUserMsg.content.length > MAX_MESSAGE_LENGTH) {
        return res.status(400).json({ error: `Message too long. Maximum ${MAX_MESSAGE_LENGTH} characters allowed.` });
      }

      // Injection Guard — Layer 1 (input sanitization)
      const latestMsg = rawMessages[rawMessages.length - 1];
      if (latestMsg && latestMsg.role === "user") {
        const injectionCheck = detectInjection(latestMsg.content || "");
        if (injectionCheck.blocked) {
          return res.json({ reply: GENERIC_REPLY, source: "injection-blocked", sessionId });
        }
        // Layer 2: Suspicious flag → force relevance check
        if (injectionCheck.suspicious && typeof checkRelevanceLLM === "function" && callLLM) {
          const relevanceCheck = await checkRelevanceLLM(latestMsg.content, callLLM);
          if (!relevanceCheck.relevant) {
            return res.json({ reply: GENERIC_REPLY, source: "suspicious-blocked", sessionId });
          }
        }
      }

      // Inject sessionId into all responses + save bot reply to chat history
      const originalJson = res.json.bind(res);
      res.json = (data) => {
        if (data && typeof data === "object") {
          if (!data.sessionId) data.sessionId = sessionId;
          if (data.reply) appendBotResponse(sessionId, data.reply);
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
        return res.status(400).json({ error: "No valid messages found." });
      }

      const chatHistorySnapshot = activeMessages
        .filter(m => m && m.content)
        .slice(-50)
        .map(m => ({ role: m.role, content: String(m.content).slice(0, 500) }));

      // Credential masking — mask sensitive data before sending to LLM
      if (typeof maskCredentials === "function") {
        contents.forEach(c => {
          if (c.parts) c.parts.forEach(p => { if (p.text) p.text = maskCredentials(p.text); });
        });
        chatHistorySnapshot.forEach(m => {
          if (m.content) m.content = maskCredentials(m.content);
        });
      }

      const conversationContext = await buildConversationContext(memory, activeUserMessages);

      // Multi-turn topic context persist
      const topicConvData = loadConversations();
      const topicConv = topicConvData.conversations.find(c => c.sessionId === sessionId);
      if (conversationContext.currentTopic) {
        // Topic found — save
        if (topicConv) {
          topicConv.lastDetectedTopic = conversationContext.currentTopic;
          saveConversations(topicConvData);
        }
      } else if (topicConv?.lastDetectedTopic && latestUserMessage.split(/\s+/).length < 8) {
        // Topic not found but previous topic exists + short reply → preserve old topic
        conversationContext.currentTopic = topicConv.lastDetectedTopic;
        conversationContext.topicConfidence = 0.6;
        conversationContext.conversationState = "topic_guided_support";
        if (conversationContext._topicDetection) {
          conversationContext._topicDetection.method = "persisted";
        }
      }

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
        hasClosedTicketHistory, chatStartTime, sessionId
      });
      if (deterministicResult) return res.json(deterministicResult);

      // Relevance guardrail — catch off-topic messages via LLM (only on first turn when no topic detected)
      if (!conversationContext.currentTopic && activeUserMessages.length <= 1 && typeof checkRelevanceLLM === "function" && callLLM) {
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
      // Error categorization for analytics
      const errorType = error?.status === 429 ? "rate-limit"
        : error?.status === 503 ? "service-unavailable"
        : error?.code === "ECONNABORTED" || error?.code === "ETIMEDOUT" ? "timeout"
        : error?.message?.includes("quota") ? "quota-exceeded"
        : "unknown";
      recordLLMError(error, "web-chat");
      recordAnalyticsEvent({ source: "error", errorType, responseTimeMs: Date.now() - chatStartTime });
      const statusCode = Number(error?.status) || 500;
      if (statusCode >= 500) {
        const rawMessages = Array.isArray(req.body?.messages) ? req.body.messages : [];
        const { activeMessages, hasClosedTicketHistory } = splitActiveTicketMessages(rawMessages);
        const activeUserMessages = getUserMessages(activeMessages);
        const memory = extractTicketMemory(activeMessages);
        const latestUserMessage = activeUserMessages[activeUserMessages.length - 1] || "";
        const supportAvailability = getSupportAvailability();

        return res.json({
          reply: buildMissingFieldsReply(memory, latestUserMessage) || GENERIC_REPLY,
          model: getGoogleModel(),
          source: "fallback-error",
          memory,
          hasClosedTicketHistory,
          handoffReady: false,
          support: supportAvailability,
          warning: error?.message || "An unexpected error occurred."
        });
      }

      return res.status(statusCode).json({
        error: error?.message || "An unexpected error occurred."
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

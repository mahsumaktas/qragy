"use strict";

/**
 * Web Chat Pipeline Service
 *
 * Pure processing logic for the /api/chat endpoint.
 * Each function returns a response data object (no req/res coupling).
 * Factory pattern — all dependencies injected via deps.
 */
function createWebChatPipeline(deps) {
  const {
    // Getters for mutable config
    getChatFlowConfig,
    getGoogleModel,
    getGoogleMaxOutputTokens,
    getSupportAvailability,
    getProviderConfig,
    getSoulText,
    getPersonaText,

    // Chat engine helpers
    isGibberishMessage,
    isFarewellMessage,
    hasRequiredFields,
    isNonIssueMessage,
    isStatusFollowupMessage,
    isFieldClarificationMessage,
    normalizeForMatching,
    extractBranchCodeFromText,
    sanitizeAssistantReply,
    getLastAssistantMessage,
    isAssistantEscalationMessage,
    getStatusFollowupMessage,
    getOutsideSupportHoursMessage,

    // Ticket
    loadTicketsDb,
    findRecentDuplicateTicket,
    createOrReuseTicket,
    buildConfirmationMessage,
    buildMissingFieldsReply,
    ACTIVE_TICKET_STATUSES,

    // Conversation
    loadConversations,
    saveConversations,

    // LLM
    callLLM,
    callLLMWithFallback,
    generateEscalationSummary,

    // Knowledge
    searchKnowledge,
    recordContentGap,

    // Prompt & context
    buildSystemPrompt,
    buildDeterministicCollectionReply,

    // Validation
    validateOutput,
    validateBotResponse,
    maskCredentials,

    // Analytics & events
    recordAnalyticsEvent,
    recordLLMError,
    analyzeSentiment,
    fireWebhook,

    // Topic
    getTopicMeta,

    // Clarification
    getClarificationKey,
    incrementClarificationCount,
    resetClarificationCount,

    // Constants
    ESCALATION_MESSAGE_REGEX,
    CONFIRMATION_PREFIX_REGEX,
    NEW_TICKET_INTENT_REGEX,
    ISSUE_HINT_REGEX,
    GENERIC_REPLY,
    POST_ESCALATION_FOLLOWUP_MESSAGE,

    // Citations
    formatCitations,

    // Logger
    logger = { info() {}, warn() {} },
  } = deps;

  // Optional dependencies
  const questionExtractor = deps.questionExtractor || null;
  const chatAuditLog = deps.chatAuditLog || null;

  // ── Shared response builder ────────────────────────────────────────────

  function webResponse(extra) {
    return {
      model: getGoogleModel(),
      support: getSupportAvailability(),
      handoffReady: false,
      ...extra,
    };
  }

  function updateConversationTicket(sessionId, ticketId) {
    if (!sessionId || !ticketId) return;
    const data = loadConversations();
    const conv = data.conversations.find(c => c.sessionId === sessionId);
    if (conv) {
      conv.ticketId = ticketId;
      conv.status = "ticketed";
      conv.updatedAt = new Date().toISOString();
      saveConversations(data);
    }
  }

  // ── Early detection checks ─────────────────────────────────────────────

  function runEarlyChecks({
    latestUserMessage, activeUserMessages, rawMessages, sessionId,
    memory, hasClosedTicketHistory, lastClosedTicketMemory, chatStartTime
  }) {
    const chatFlowConfig = getChatFlowConfig();

    // Gibberish
    if (isGibberishMessage(latestUserMessage)) {
      logger.info("webChatPipeline:earlyCheck", "Gibberish tespit edildi", { sessionId, msgPreview: latestUserMessage.slice(0, 80) });
      recordAnalyticsEvent({ source: "gibberish", responseTimeMs: Date.now() - chatStartTime });
      return webResponse({
        reply: chatFlowConfig.gibberishMessage,
        source: "gibberish",
        memory,
      });
    }

    // Closed followup — user sends message after farewell
    const convData = loadConversations();
    const existingConv = convData.conversations.find(c => c.sessionId === sessionId);
    if (existingConv?.farewellOffered && activeUserMessages.length > 0) {
      // Farewell sonrasi gelen mesaj da farewell ise → konusmayi kapat, uzatma
      if (isFarewellMessage(latestUserMessage, activeUserMessages.length) || isNonIssueMessage(latestUserMessage)) {
        logger.info("webChatPipeline:earlyCheck", "Farewell sonrasi tekrar farewell, konusma kapatiliyor", { sessionId });
        recordAnalyticsEvent({ source: "closing-flow", responseTimeMs: Date.now() - chatStartTime });
        return webResponse({
          reply: chatFlowConfig.farewellMessage,
          source: "closing-flow",
          memory,
          closingFlow: true,
          csatTrigger: chatFlowConfig.csatEnabled,
        });
      }
      logger.info("webChatPipeline:earlyCheck", "Farewell sonrasi yeni mesaj, konusma yeniden acildi", { sessionId });
      existingConv.farewellOffered = false;
      saveConversations(convData);
      return webResponse({
        reply: "Baska bir konuda yardimci olabilir miyim?",
        source: "closed-followup",
        memory,
      });
    }

    // Farewell / closing flow
    if (isFarewellMessage(latestUserMessage, activeUserMessages.length)) {
      logger.info("webChatPipeline:earlyCheck", "Farewell mesaji tespit edildi", { sessionId, msgPreview: latestUserMessage.slice(0, 80) });
      const hasTicket = hasRequiredFields(memory);
      if (existingConv) {
        existingConv.farewellOffered = true;
        saveConversations(convData);
      }

      // Onceki bot mesaji zaten farewell-like ise (rica, yardimci, baska konu) → konusmayi kapat
      const lastBotMsgObj = getLastAssistantMessage(rawMessages);
      const lastBotText = lastBotMsgObj?.content || "";
      const botAlreadyFarewelled = lastBotText && /(?:rica|iyi gunler|yardimci olabileceg|baska.*konu|baska.*soru)/i.test(
        normalizeForMatching(lastBotText)
      );

      if (hasTicket || botAlreadyFarewelled) {
        const ticketsDb = loadTicketsDb();
        const recentTicket = hasTicket ? findRecentDuplicateTicket(ticketsDb.tickets, memory) : null;
        recordAnalyticsEvent({ source: "closing-flow", responseTimeMs: Date.now() - chatStartTime });
        return webResponse({
          reply: chatFlowConfig.farewellMessage,
          source: "closing-flow",
          memory,
          closingFlow: true,
          csatTrigger: chatFlowConfig.csatEnabled,
          ticketId: recentTicket?.id || "",
        });
      }
      recordAnalyticsEvent({ source: "closing-flow", responseTimeMs: Date.now() - chatStartTime });
      return webResponse({
        reply: chatFlowConfig.anythingElseMessage,
        source: "closing-flow",
        memory,
        closingFlow: false,
      });
    }

    // Status followup for closed tickets
    const allMessagesAreStatusLike =
      activeUserMessages.length > 0 &&
      activeUserMessages.every(
        (text) =>
          isNonIssueMessage(text) || isStatusFollowupMessage(text) || isFieldClarificationMessage(text)
      );

    const repeatsClosedTicketBranchWithoutNewIssue =
      activeUserMessages.length > 0 &&
      Boolean(lastClosedTicketMemory?.branchCode) &&
      Boolean(memory.branchCode) &&
      !memory.issueSummary &&
      memory.branchCode === String(lastClosedTicketMemory.branchCode).toUpperCase() &&
      activeUserMessages.every((text) => {
        const extracted = extractBranchCodeFromText(text);
        return (
          isNonIssueMessage(text) ||
          isStatusFollowupMessage(text) ||
          isFieldClarificationMessage(text) ||
          (extracted && extracted === memory.branchCode)
        );
      });

    const maintainClosedTicketContext =
      allMessagesAreStatusLike || repeatsClosedTicketBranchWithoutNewIssue;

    if (
      hasClosedTicketHistory &&
      lastClosedTicketMemory &&
      !hasRequiredFields(memory) &&
      maintainClosedTicketContext &&
      !NEW_TICKET_INTENT_REGEX.test(normalizeForMatching(latestUserMessage))
    ) {
      logger.info("webChatPipeline:earlyCheck", "Ticket status followup", { sessionId, closedBranch: lastClosedTicketMemory.branchCode || "N/A" });
      recordAnalyticsEvent({ source: "ticket-status", responseTimeMs: Date.now() - chatStartTime });
      return webResponse({
        reply: getStatusFollowupMessage(),
        source: "ticket-status",
        memory: lastClosedTicketMemory,
        hasClosedTicketHistory,
        quickReplies: ["Yeni talep olu\u015Ftur"],
      });
    }

    // Post-escalation check
    const lastAssistant = getLastAssistantMessage(rawMessages);
    if (lastAssistant && isAssistantEscalationMessage(lastAssistant)) {
      const isNewIssue = ISSUE_HINT_REGEX.test(normalizeForMatching(latestUserMessage)) &&
        !isStatusFollowupMessage(latestUserMessage);
      if (!isNewIssue) {
        logger.info("webChatPipeline:earlyCheck", "Post-escalation followup (yeni konu degil)", { sessionId });
        recordAnalyticsEvent({ source: "post-escalation", responseTimeMs: Date.now() - chatStartTime });
        return webResponse({
          reply: POST_ESCALATION_FOLLOWUP_MESSAGE,
          source: "post-escalation",
          memory,
          hasClosedTicketHistory,
          handoffReady: true,
          handoffReason: "escalation_active",
        });
      }
    }

    return null;
  }

  // ── Ticket creation (required fields met) ──────────────────────────────

  async function handleTicketCreation({
    contents, memory, conversationContext, sessionId,
    chatHistorySnapshot, hasClosedTicketHistory, chatStartTime
  }) {
    if (!hasRequiredFields(memory)) {
      return null;
    }

    // Topic-guided escalation: topic varken de required fields doluysa ticket olustur
    // (kullanici sube kodu verdikten sonra direkt aktarim)
    // turnCount > 1 kosulu: ilk mesajda sube kodu gecse bile troubleshooting once yapilsin
    const isTopicEscalation = conversationContext.currentTopic
      && hasRequiredFields(memory)
      && conversationContext.turnCount > 1;

    // Topic var ama henuz escalation degil (ilk turda sube kodu gecmis olabilir) → atla
    if (conversationContext.currentTopic && !isTopicEscalation) {
      return null;
    }

    const supportAvailability = getSupportAvailability();
    const aiSummary = await generateEscalationSummary(contents, memory, conversationContext);
    memory.issueSummary = aiSummary;
    const ticketResult = createOrReuseTicket(memory, supportAvailability, {
      source: isTopicEscalation ? "topic-escalation" : "chat-api",
      model: getGoogleModel(),
      chatHistory: chatHistorySnapshot
    });
    const ticket = ticketResult.ticket;
    updateConversationTicket(sessionId, ticket.id);
    const handoffReady = Boolean(supportAvailability.isOpen);

    const ticketsDb = loadTicketsDb();
    const activeCount = ticketsDb.tickets.filter(
      (t) => ACTIVE_TICKET_STATUSES.has(t.status) && t.id !== ticket.id
    ).length;

    recordAnalyticsEvent({ source: isTopicEscalation ? "topic-escalation" : "memory-template", responseTimeMs: Date.now() - chatStartTime, topicId: conversationContext.currentTopic || null });
    if (ticketResult.created) {
      fireWebhook("ticket_created", { ticketId: ticket.id, memory, source: isTopicEscalation ? "topic-escalation" : "memory-template" });
    }
    if (isTopicEscalation && ticketResult.created) {
      fireWebhook("escalation", { ticketId: ticket.id, memory, source: "topic-escalation" });
    }

    // Topic-guided escalation icin ozel reply: "Sizi aktariyorum"
    const reply = isTopicEscalation
      ? "Teşekkür ederim, sizi canlı destek temsilcimize aktarıyorum. Lütfen bekleyiniz."
      : buildConfirmationMessage(memory);

    return webResponse({
      reply,
      source: isTopicEscalation ? "topic-escalation" : "memory-template",
      memory,
      conversationContext,
      ticketId: ticket.id,
      ticketStatus: ticket.status,
      ticketCreated: ticketResult.created,
      hasClosedTicketHistory,
      handoffReady,
      handoffReason: handoffReady ? "" : "outside-support-hours",
      handoffMessage: handoffReady ? "" : getOutsideSupportHoursMessage(),
      queuePosition: activeCount > 0 ? activeCount : 0,
    });
  }

  // ── Escalation trigger ─────────────────────────────────────────────────

  async function handleEscalation({
    contents, memory, conversationContext, sessionId,
    chatHistorySnapshot, hasClosedTicketHistory, chatStartTime
  }) {
    if (!conversationContext.escalationTriggered) return null;

    const supportAvailability = getSupportAvailability();
    const escalationReply = "Sizi canl\u0131 destek temsilcimize aktar\u0131yorum. K\u0131sa s\u00fcrede yard\u0131mc\u0131 olacakt\u0131r.";
    const aiSummary = await generateEscalationSummary(contents, memory, conversationContext);
    const isCredentialEscalation = (conversationContext.escalationReason || "").includes("_credentials");
    const escalationMemory = {
      ...memory,
      issueSummary: isCredentialEscalation ? maskCredentials(aiSummary) : aiSummary
    };
    const ticketResult = createOrReuseTicket(escalationMemory, supportAvailability, {
      source: "escalation-trigger",
      model: getGoogleModel(),
      chatHistory: chatHistorySnapshot
    });
    updateConversationTicket(sessionId, ticketResult.ticket.id);
    const handoffReady = Boolean(supportAvailability.isOpen);
    recordAnalyticsEvent({ source: "escalation-trigger", responseTimeMs: Date.now() - chatStartTime, topicId: conversationContext.currentTopic || null });
    if (ticketResult.created) {
      fireWebhook("ticket_created", { ticketId: ticketResult.ticket.id, memory: escalationMemory, source: "escalation-trigger" });
      fireWebhook("escalation", { ticketId: ticketResult.ticket.id, memory: escalationMemory, reason: conversationContext.escalationReason });
    }

    return webResponse({
      reply: escalationReply,
      source: "escalation-trigger",
      memory: escalationMemory,
      conversationContext,
      hasClosedTicketHistory,
      ticketId: ticketResult.ticket.id,
      ticketStatus: ticketResult.ticket.status,
      ticketCreated: ticketResult.created,
      handoffReady,
      handoffReason: conversationContext.escalationReason,
      handoffMessage: !handoffReady ? getOutsideSupportHoursMessage() : "",
    });
  }

  // ── Deterministic reply ────────────────────────────────────────────────

  function handleDeterministicReply({
    rawMessages, memory, conversationContext, activeUserMessages,
    hasClosedTicketHistory, chatStartTime
  }) {
    const shouldUseDeterministicReply =
      conversationContext.conversationState === "welcome_or_greet" ||
      (conversationContext.conversationState !== "topic_detection" &&
       conversationContext.conversationState !== "topic_guided_support" &&
       !conversationContext.currentTopic);

    if (!shouldUseDeterministicReply) {
      logger.info("webChatPipeline:deterministic", "Deterministic reply kullanilmiyor", {
        state: conversationContext.conversationState,
        topic: conversationContext.currentTopic || null,
      });
      return null;
    }

    const chatFlowConfig = getChatFlowConfig();
    const deterministicReply = buildDeterministicCollectionReply(
      memory,
      activeUserMessages,
      hasClosedTicketHistory
    );
    if (!deterministicReply) {
      logger.info("webChatPipeline:deterministic", "buildDeterministicCollectionReply null dondu, LLM'ye gidilecek");
      return null;
    }

    // Max clarification retry check
    const sessionKey = getClarificationKey(rawMessages);
    const retryCount = incrementClarificationCount(sessionKey);
    if (retryCount > chatFlowConfig.maxClarificationRetries) {
      logger.warn("webChatPipeline:deterministic", "Max clarification retries asildi, escalation", { retryCount, max: chatFlowConfig.maxClarificationRetries });
      resetClarificationCount(sessionKey);
      recordAnalyticsEvent({ source: "max-retries", responseTimeMs: Date.now() - chatStartTime });
      return webResponse({
        reply: "Gerekli bilgileri almakta g\u00fc\u00e7l\u00fck ya\u015f\u0131yorum. Sizi canl\u0131 destek temsilcimize aktar\u0131yorum.",
        source: "max-retries",
        memory,
        conversationContext,
        hasClosedTicketHistory,
        handoffReady: Boolean(getSupportAvailability().isOpen),
        handoffReason: "max-clarification-retries",
      });
    }

    const quickReplies = [];
    if (!memory.branchCode && !memory.issueSummary) {
      // Start state — quick access buttons
    } else if (!memory.branchCode) {
      // Branch code missing
    } else if (!memory.issueSummary) {
      // Issue summary missing
    }

    recordAnalyticsEvent({ source: "rule-engine", responseTimeMs: Date.now() - chatStartTime });
    return webResponse({
      reply: deterministicReply,
      source: "rule-engine",
      memory,
      conversationContext,
      hasClosedTicketHistory,
      quickReplies,
    });
  }

  // ── AI Response Generation ─────────────────────────────────────────────

  async function generateAIResponse({
    contents, latestUserMessage, memory, conversationContext,
    hasClosedTicketHistory, chatHistorySnapshot,
    sessionId, chatStartTime
  }) {
    const supportAvailability = getSupportAvailability();

    // No API key fallback
    if (!getProviderConfig().apiKey && getProviderConfig().provider !== "ollama") {
      return webResponse({
        reply: buildMissingFieldsReply(memory, latestUserMessage),
        source: "fallback-no-key",
        memory,
        conversationContext,
        hasClosedTicketHistory,
      });
    }

    // LLM topic classification artik buildConversationContext icinde yapiliyor (classifyTopicWithLLM callback)

    // Sentiment analysis
    const sentiment = analyzeSentiment(latestUserMessage);

    // RAG: Knowledge base search — extract standalone question for better results
    const GOOGLE_MAX_OUTPUT_TOKENS = getGoogleMaxOutputTokens();
    const chatFlowConfig = getChatFlowConfig();
    let searchQuery = latestUserMessage;
    if (questionExtractor && chatFlowConfig.questionExtractionEnabled && chatHistorySnapshot && chatHistorySnapshot.length > 0) {
      searchQuery = await questionExtractor.extractQuestion(chatHistorySnapshot, latestUserMessage);
    }
    const knowledgeResults = await searchKnowledge(searchQuery);

    logger.info("webChatPipeline:RAG", "KB arama sonucu", {
      sessionId,
      searchQuery: searchQuery.slice(0, 100),
      queryChanged: searchQuery !== latestUserMessage,
      resultCount: knowledgeResults.length,
      topScore: knowledgeResults[0] ? (knowledgeResults[0].rrfScore || knowledgeResults[0].distance || 0).toFixed(3) : "N/A",
      topQ: knowledgeResults[0] ? (knowledgeResults[0].question || "").slice(0, 80) : "N/A",
    });

    if (knowledgeResults.length === 0 && latestUserMessage.length > 10) {
      logger.info("webChatPipeline:RAG", "Content gap kaydedildi", { sessionId, query: latestUserMessage.slice(0, 80) });
      recordContentGap(latestUserMessage);
    }
    const sources = knowledgeResults.map(r => ({
      question: r.question,
      answer: (r.answer || "").slice(0, 200),
      score: r.rrfScore || r.distance || 0
    }));
    const citations = formatCitations ? formatCitations(knowledgeResults) : [];

    const systemPrompt = buildSystemPrompt(memory, conversationContext, knowledgeResults);

    logger.info("webChatPipeline", "LLM cagrisi", {
      sessionId,
      state: conversationContext?.conversationState,
      topic: conversationContext?.currentTopic || null,
      kbResults: knowledgeResults.length,
      promptLen: systemPrompt.length,
      historyMsgs: contents.length,
    });

    let geminiResult = await callLLMWithFallback(contents, systemPrompt, GOOGLE_MAX_OUTPUT_TOKENS);

    if (geminiResult.finishReason === "MAX_TOKENS") {
      logger.warn("webChatPipeline", "MAX_TOKENS, retry 2x", { sessionId });
      geminiResult = await callLLMWithFallback(contents, systemPrompt, GOOGLE_MAX_OUTPUT_TOKENS * 2);
    }
    if (geminiResult.fallbackUsed) {
      logger.warn("webChatPipeline", "Fallback model kullanildi", { sessionId });
      recordLLMError({ message: "Primary model failed, fallback used", status: 429 }, "web-chat-fallback");
    }

    let reply = sanitizeAssistantReply(geminiResult.reply);

    logger.info("webChatPipeline", "LLM cevabi", {
      sessionId,
      finishReason: geminiResult.finishReason,
      replyLen: reply.length,
      replyPreview: reply.slice(0, 150),
    });

    // Injection Guard — Layer 3 (output validation)
    const SOUL_TEXT = getSoulText();
    const PERSONA_TEXT = getPersonaText();
    const systemFragments = [
      (typeof SOUL_TEXT === "string" ? SOUL_TEXT : "").slice(0, 50),
      (typeof PERSONA_TEXT === "string" ? PERSONA_TEXT : "").slice(0, 50),
    ].filter(Boolean);
    const outputCheck = validateOutput(reply, systemFragments);
    if (!outputCheck.safe) {
      logger.warn("webChatPipeline", "Injection guard tetiklendi, genel cevap", { sessionId });
      reply = GENERIC_REPLY;
    }

    // Response quality validation
    const qualityCheck = validateBotResponse(reply, sources);
    if (!qualityCheck.valid) {
      logger.warn("webChatPipeline", "Kalite dogrulama basarisiz", { sessionId, reason: qualityCheck.reason, replyPreview: reply.slice(0, 100) });
      reply = buildMissingFieldsReply(memory, latestUserMessage);
    }

    if (!conversationContext.currentTopic && !hasRequiredFields(memory) && CONFIRMATION_PREFIX_REGEX.test(reply)) {
      logger.warn("webChatPipeline", "LLM onay mesaji uretti ama required fields eksik, fallback", { sessionId, replyPreview: reply.slice(0, 80) });
      reply = buildMissingFieldsReply(memory, latestUserMessage);
    }

    if (!reply) {
      logger.warn("webChatPipeline", "Reply bos, fallback", { sessionId });
      reply = buildMissingFieldsReply(memory, latestUserMessage);
    }

    // Parse dynamic quick replies from LLM response
    let dynamicQuickReplies = [];
    const qrMatch = reply.match(/\[QUICK_REPLIES:\s*(.+?)\]/i);
    if (qrMatch) {
      dynamicQuickReplies = qrMatch[1].split("|").map(s => s.trim()).filter(Boolean).slice(0, 3);
      reply = reply.replace(/\s*\[QUICK_REPLIES:\s*.+?\]/i, "").trim();
    }

    const isEscalationReply = ESCALATION_MESSAGE_REGEX.test(normalizeForMatching(reply));
    const topicMeta = conversationContext.currentTopic ? getTopicMeta(conversationContext.currentTopic) : null;

    // Topic-guided escalation — create ticket
    let ticketId = "";
    let ticketStatus = "";
    let ticketCreated = false;
    if (isEscalationReply) {
      const aiSummary = await generateEscalationSummary(contents, memory, conversationContext);
      const escalationMemory = {
        ...memory,
        issueSummary: aiSummary
      };
      const ticketResult = createOrReuseTicket(escalationMemory, supportAvailability, {
        source: "topic-escalation",
        model: getGoogleModel(),
        chatHistory: chatHistorySnapshot
      });
      ticketId = ticketResult.ticket.id;
      updateConversationTicket(sessionId, ticketId);
      ticketStatus = ticketResult.ticket.status;
      ticketCreated = ticketResult.created;
      memory.issueSummary = aiSummary;
    }

    const handoffReady = isEscalationReply && Boolean(supportAvailability.isOpen);
    const chatSource = conversationContext.currentTopic ? "topic-guided" : "gemini";
    recordAnalyticsEvent({
      source: chatSource,
      responseTimeMs: Date.now() - chatStartTime,
      topicId: conversationContext.currentTopic || null,
      fallbackUsed: Boolean(geminiResult.fallbackUsed),
      sentiment
    });

    if (isEscalationReply && ticketCreated) {
      fireWebhook("escalation", { ticketId, memory, source: chatSource });
    }
    if (ticketCreated) {
      fireWebhook("ticket_created", { ticketId, memory, source: chatSource });
    }

    // Audit log — tam konusma kaydı
    if (chatAuditLog) {
      chatAuditLog.log({
        sessionId,
        userMessage: latestUserMessage,
        reply,
        source: chatSource,
        memory,
        conversationContext,
        ragResults: knowledgeResults,
        promptLen: systemPrompt.length,
        finishReason: geminiResult.finishReason,
        searchQuery: searchQuery !== latestUserMessage ? searchQuery : null,
        topicDetected: conversationContext.currentTopic || null,
        extra: {
          sentiment,
          fallbackUsed: !!geminiResult.fallbackUsed,
          qualityValid: qualityCheck.valid,
          qualityReason: qualityCheck.reason || null,
          isEscalation: isEscalationReply,
          historyMsgs: contents.length,
        },
      });
    }

    return webResponse({
      reply,
      source: chatSource,
      sources: sources.length ? sources : undefined,
      citations: citations.length ? citations : undefined,
      memory,
      conversationContext,
      hasClosedTicketHistory,
      ticketId,
      ticketStatus,
      ticketCreated,
      handoffReady,
      handoffReason: isEscalationReply ? (topicMeta?.id || "ai-escalation") : "",
      handoffMessage: !supportAvailability.isOpen && isEscalationReply ? getOutsideSupportHoursMessage() : "",
      quickReplies: dynamicQuickReplies.length ? dynamicQuickReplies : undefined,
    });
  }

  return {
    runEarlyChecks,
    handleTicketCreation,
    handleEscalation,
    handleDeterministicReply,
    generateAIResponse,
  };
}

module.exports = { createWebChatPipeline };

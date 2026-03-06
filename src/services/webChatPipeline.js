"use strict";

const { shouldEscalateForKnowledgeGap } = require("../utils/knowledgeGuardrail.js");

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
  const qualityScorer = deps.qualityScorer || null;
  const jobQueue = deps.jobQueue || null;
  const cragEvaluator = deps.cragEvaluator || null;

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

    // Escalation session lock: post-escalation messages from same session
    const convDataEarly = loadConversations();
    const existingConvEarly = convDataEarly.conversations.find(c => c.sessionId === sessionId);
    if (existingConvEarly?.escalationStatus === "active") {
      const isNewTopic = ISSUE_HINT_REGEX.test(normalizeForMatching(latestUserMessage)) &&
        !isStatusFollowupMessage(latestUserMessage) &&
        !isNonIssueMessage(latestUserMessage);
      if (isNewTopic) {
        // New topic — remove escalation lock, continue normal flow
        existingConvEarly.escalationStatus = null;
        saveConversations(convDataEarly);
        logger.info("webChatPipeline:earlyCheck", "Escalation lock removed, new topic", { sessionId });
      } else {
        logger.info("webChatPipeline:earlyCheck", "Escalation-locked, post-escalation message", { sessionId });
        recordAnalyticsEvent({ source: "escalation-locked", responseTimeMs: Date.now() - chatStartTime });
        return webResponse({
          reply: POST_ESCALATION_FOLLOWUP_MESSAGE,
          source: "escalation-locked",
          memory,
          hasClosedTicketHistory,
          handoffReady: true,
          handoffReason: "escalation_active",
        });
      }
    }

    // Gibberish
    if (isGibberishMessage(latestUserMessage)) {
      logger.info("webChatPipeline:earlyCheck", "Gibberish detected", { sessionId, msgPreview: latestUserMessage.slice(0, 80) });
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
      // If message after farewell is also farewell → close conversation, don't extend
      if (isFarewellMessage(latestUserMessage, activeUserMessages.length) || isNonIssueMessage(latestUserMessage)) {
        logger.info("webChatPipeline:earlyCheck", "Farewell after farewell, closing conversation", { sessionId });
        recordAnalyticsEvent({ source: "closing-flow", responseTimeMs: Date.now() - chatStartTime });
        return webResponse({
          reply: chatFlowConfig.farewellMessage,
          source: "closing-flow",
          memory,
          closingFlow: true,
          csatTrigger: chatFlowConfig.csatEnabled,
        });
      }
      logger.info("webChatPipeline:earlyCheck", "New message after farewell, conversation reopened", { sessionId });
      existingConv.farewellOffered = false;
      saveConversations(convData);
      return webResponse({
        reply: "Is there anything else I can help you with?",
        source: "closed-followup",
        memory,
      });
    }

    // Farewell / closing flow
    if (isFarewellMessage(latestUserMessage, activeUserMessages.length)) {
      logger.info("webChatPipeline:earlyCheck", "Farewell message detected", { sessionId, msgPreview: latestUserMessage.slice(0, 80) });
      const hasTicket = hasRequiredFields(memory);
      if (existingConv) {
        existingConv.farewellOffered = true;
        saveConversations(convData);
      }

      // If previous bot message was already farewell-like → close conversation
      const lastBotMsgObj = getLastAssistantMessage(rawMessages);
      const lastBotText = lastBotMsgObj?.content || "";
      const botAlreadyFarewelled = lastBotText && /(?:welcome|have a good day|help you with|anything else|another question)/i.test(
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
        quickReplies: ["Create new request"],
      });
    }

    // Post-escalation check
    const lastAssistant = getLastAssistantMessage(rawMessages);
    if (lastAssistant && isAssistantEscalationMessage(lastAssistant)) {
      const isNewIssue = ISSUE_HINT_REGEX.test(normalizeForMatching(latestUserMessage)) &&
        !isStatusFollowupMessage(latestUserMessage);
      if (!isNewIssue) {
        logger.info("webChatPipeline:earlyCheck", "Post-escalation followup (not a new topic)", { sessionId });
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

    // Topic-guided escalation: create ticket when required fields are met even with a topic
    // (direct handoff after user provides branch code)
    // turnCount > 1 condition: even if branch code is in first message, troubleshooting first
    const isTopicEscalation = conversationContext.currentTopic
      && hasRequiredFields(memory)
      && conversationContext.turnCount > 1;

    // Topic exists but not yet escalation (branch code may have been in first turn) → skip
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
    // Escalation session lock for topic-escalation
    if (isTopicEscalation) {
      const tcConvData = loadConversations();
      const tcConv = tcConvData.conversations.find(c => c.sessionId === sessionId);
      if (tcConv) {
        tcConv.escalationStatus = "active";
        saveConversations(tcConvData);
      }
    }
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

    // Special reply for topic-guided escalation: "Connecting you"
    const reply = isTopicEscalation
      ? "Thank you, I'm connecting you with a live support agent. Please hold on."
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
    const CREDENTIAL_WARNING = "For your security, please do not share your password or login credentials via chat. This information has been masked in our system. ";
    const isCredentialEscalation = (conversationContext.escalationReason || "").includes("_credentials");
    const escalationReply = isCredentialEscalation
      ? CREDENTIAL_WARNING + "I'm connecting you with a live support agent. They will assist you shortly."
      : "I'm connecting you with a live support agent. They will assist you shortly.";
    const aiSummary = await generateEscalationSummary(contents, memory, conversationContext);
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
    // Escalation session lock: write escalationStatus to conversation
    const escConvData = loadConversations();
    const escConv = escConvData.conversations.find(c => c.sessionId === sessionId);
    if (escConv) {
      escConv.escalationStatus = "active";
      saveConversations(escConvData);
    }
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

  async function handleKnowledgeGapEscalation({
    contents,
    latestUserMessage,
    memory,
    conversationContext,
    sessionId,
    chatHistorySnapshot,
    hasClosedTicketHistory,
    chatStartTime,
  }) {
    if (!shouldEscalateForKnowledgeGap(latestUserMessage, conversationContext)) {
      return null;
    }

    const supportAvailability = getSupportAvailability();
    conversationContext.escalationTriggered = true;
    if (!conversationContext.escalationReason) {
      conversationContext.escalationReason = conversationContext.currentTopic
        ? "verified-knowledge-missing"
        : "knowledge-not-found";
    }

    const aiSummary = await generateEscalationSummary(contents, memory, conversationContext);
    const escalationMemory = {
      ...memory,
      issueSummary: aiSummary,
    };
    const ticketResult = createOrReuseTicket(escalationMemory, supportAvailability, {
      source: "knowledge-gap-escalation",
      model: getGoogleModel(),
      chatHistory: chatHistorySnapshot,
    });

    updateConversationTicket(sessionId, ticketResult.ticket.id);

    const conversationData = loadConversations();
    const conversation = conversationData.conversations.find((item) => item.sessionId === sessionId);
    if (conversation) {
      conversation.escalationStatus = "active";
      saveConversations(conversationData);
    }

    recordAnalyticsEvent({
      source: "knowledge-gap-escalation",
      responseTimeMs: Date.now() - chatStartTime,
      topicId: conversationContext.currentTopic || null,
    });

    if (ticketResult.created) {
      fireWebhook("ticket_created", { ticketId: ticketResult.ticket.id, memory: escalationMemory, source: "knowledge-gap-escalation" });
      fireWebhook("escalation", { ticketId: ticketResult.ticket.id, memory: escalationMemory, reason: conversationContext.escalationReason });
    }

    const handoffReady = Boolean(supportAvailability.isOpen);
    return webResponse({
      reply: "I don't have verified information on this issue in my knowledge base, so I'm connecting you with a live support agent. They will assist you shortly.",
      source: "knowledge-gap-escalation",
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
    hasClosedTicketHistory, chatStartTime, sessionId
  }) {
    // Deterministic reply now only works for greetings + field collection
    const chatFlowConfig = getChatFlowConfig();
    const deterministicReply = buildDeterministicCollectionReply(
      memory,
      activeUserMessages,
      hasClosedTicketHistory
    );
    if (!deterministicReply) {
      logger.info("webChatPipeline:deterministic", "buildDeterministicCollectionReply returned null, proceeding to LLM");
      return null;
    }

    // Max clarification retry check
    const sessionKey = getClarificationKey(rawMessages, sessionId);
    const retryCount = incrementClarificationCount(sessionKey);
    if (retryCount > chatFlowConfig.maxClarificationRetries) {
      logger.warn("webChatPipeline:deterministic", "Max clarification retries exceeded, escalation", { retryCount, max: chatFlowConfig.maxClarificationRetries });
      resetClarificationCount(sessionKey);
      recordAnalyticsEvent({ source: "max-retries", responseTimeMs: Date.now() - chatStartTime });
      return webResponse({
        reply: "I'm having difficulty collecting the required information. I'm connecting you with a live support agent.",
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

    // Audit log — deterministic reply should also be logged
    if (chatAuditLog) {
      chatAuditLog.log({
        sessionId,
        userMessage: activeUserMessages[activeUserMessages.length - 1] || "",
        reply: deterministicReply,
        source: "rule-engine",
        memory,
        conversationContext,
        topicDetected: conversationContext.currentTopic || null,
        extra: {
          deterministic: true,
          topicDetection: conversationContext._topicDetection || null,
          historyMsgs: rawMessages.length,
        },
      });
    }

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
    sessionId, chatStartTime, llmOptions
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

    // Quality score: read quality from previous turns
    let qualityWarning = null;
    if (qualityScorer && sessionId) {
      try {
        const consecutiveLow = qualityScorer.getConsecutiveLowCount(sessionId);

        if (consecutiveLow >= 3) {
          conversationContext.escalationTriggered = true;
          conversationContext.escalationReason = "consecutive-low-quality";
          logger.warn("webChatPipeline:quality", "3 consecutive low quality, auto-escalation", { sessionId, consecutiveLow });
        } else {
          const lastScores = qualityScorer.getRecentScores(sessionId, 1);
          if (lastScores.length > 0 && lastScores[0].faithfulness !== null && lastScores[0].faithfulness < 0.4) {
            qualityWarning = "## WARNING: LAST RESPONSE QUALITY IS LOW (faithfulness: " +
              lastScores[0].faithfulness.toFixed(2) + ")\n" +
              "- There may NOT be sufficient sources in the knowledge base for this topic.\n" +
              "- Do NOT provide information you are unsure of. Do NOT guess.\n" +
              "- If you don't have the answer, direct the user to a live support agent.";
          }
        }
      } catch (err) {
        logger.warn("webChatPipeline:quality", "Score read error", err);
      }
    }

    // Loop + turn limit combined → force escalation
    if (conversationContext.loopDetected && conversationContext.turnLimitReached && !conversationContext.escalationTriggered) {
      conversationContext.escalationTriggered = true;
      conversationContext.escalationReason = "loop-turn-limit";
      logger.warn("webChatPipeline:loop", "Loop + turn limit, force escalation", { sessionId, turnCount: conversationContext.turnCount });
    }

    // LLM topic classification is now done inside buildConversationContext (classifyTopicWithLLM callback)

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

    // CRAG evaluation — filter irrelevant RAG results
    let ragResults = knowledgeResults;
    if (cragEvaluator && ragResults.length > 0) {
      try {
        const cragResult = await cragEvaluator.evaluate(searchQuery, ragResults);
        if (cragResult.insufficient) {
          // All results irrelevant — try query rewrite
          const rewrittenQuery = await cragEvaluator.suggestRewrite(searchQuery, chatHistorySnapshot);
          if (rewrittenQuery && rewrittenQuery !== searchQuery) {
            ragResults = await searchKnowledge(rewrittenQuery);
            logger.info("webChatPipeline:CRAG", "Query rewrite applied", {
              sessionId, original: searchQuery.slice(0, 80), rewritten: rewrittenQuery.slice(0, 80),
              newResultCount: ragResults.length,
            });
          } else {
            ragResults = [];
          }
        } else {
          // Keep only relevant + partial results
          ragResults = [...cragResult.relevant, ...cragResult.partial];
        }
      } catch (cragErr) {
        logger.warn("webChatPipeline:CRAG", "CRAG evaluator error, using original results", cragErr);
        // Fail-open: use original results
      }
    }

    logger.info("webChatPipeline:RAG", "KB search result", {
      sessionId,
      searchQuery: searchQuery.slice(0, 100),
      queryChanged: searchQuery !== latestUserMessage,
      resultCount: ragResults.length,
      topScore: ragResults[0] ? (ragResults[0].rrfScore || ragResults[0].distance || 0).toFixed(3) : "N/A",
      topQ: ragResults[0] ? (ragResults[0].question || "").slice(0, 80) : "N/A",
    });

    if (ragResults.length === 0 && latestUserMessage.length > 10) {
      logger.info("webChatPipeline:RAG", "Content gap recorded", { sessionId, query: latestUserMessage.slice(0, 80) });
      recordContentGap(latestUserMessage);
    }

    if (ragResults.length === 0) {
      logger.warn("webChatPipeline:RAG", "No verified KB match, escalating", {
        sessionId,
        topic: conversationContext.currentTopic || null,
        query: latestUserMessage.slice(0, 80),
      });
      const escalationResult = await handleKnowledgeGapEscalation({
        contents,
        latestUserMessage,
        memory,
        conversationContext,
        sessionId,
        chatHistorySnapshot,
        hasClosedTicketHistory,
        chatStartTime,
      });
      if (escalationResult) return escalationResult;
    }

    const sources = ragResults.map(r => ({
      question: r.question,
      answer: (r.answer || "").slice(0, 200),
      score: r.rrfScore || r.distance || 0
    }));
    const citations = formatCitations ? formatCitations(ragResults) : [];

    const systemPrompt = buildSystemPrompt(memory, conversationContext, ragResults, { qualityWarning });

    logger.info("webChatPipeline", "LLM call", {
      sessionId,
      state: conversationContext?.conversationState,
      topic: conversationContext?.currentTopic || null,
      kbResults: ragResults.length,
      promptLen: systemPrompt.length,
      historyMsgs: contents.length,
    });

    let geminiResult = await callLLMWithFallback(contents, systemPrompt, GOOGLE_MAX_OUTPUT_TOKENS, llmOptions);

    if (geminiResult.finishReason === "MAX_TOKENS") {
      logger.warn("webChatPipeline", "MAX_TOKENS, retry 2x", { sessionId });
      geminiResult = await callLLMWithFallback(contents, systemPrompt, GOOGLE_MAX_OUTPUT_TOKENS * 2, llmOptions);
    }
    if (geminiResult.fallbackUsed) {
      logger.warn("webChatPipeline", "Fallback model used", { sessionId });
      recordLLMError({ message: "Primary model failed, fallback used", status: 429 }, "web-chat-fallback");
    }

    let reply = sanitizeAssistantReply(geminiResult.reply);

    logger.info("webChatPipeline", "LLM response", {
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
      logger.warn("webChatPipeline", "Injection guard triggered, generic reply", { sessionId });
      reply = GENERIC_REPLY;
    }

    // Response quality validation
    const qualityCheck = validateBotResponse(reply, sources);
    if (!qualityCheck.valid) {
      logger.warn("webChatPipeline", "Quality validation failed", { sessionId, reason: qualityCheck.reason, replyPreview: reply.slice(0, 100) });
      reply = buildMissingFieldsReply(memory, latestUserMessage) || GENERIC_REPLY;
    }

    if (!conversationContext.currentTopic && !hasRequiredFields(memory) && CONFIRMATION_PREFIX_REGEX.test(reply)) {
      logger.warn("webChatPipeline", "LLM produced confirmation message but required fields missing, fallback", { sessionId, replyPreview: reply.slice(0, 80) });
      reply = buildMissingFieldsReply(memory, latestUserMessage) || GENERIC_REPLY;
    }

    if (!reply) {
      logger.warn("webChatPipeline", "Reply empty, fallback", { sessionId });
      reply = GENERIC_REPLY;
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
      // Escalation session lock
      const aiEscConvData = loadConversations();
      const aiEscConv = aiEscConvData.conversations.find(c => c.sessionId === sessionId);
      if (aiEscConv) {
        aiEscConv.escalationStatus = "active";
        saveConversations(aiEscConvData);
      }
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

    // Audit log — full conversation record
    if (chatAuditLog) {
      chatAuditLog.log({
        sessionId,
        userMessage: latestUserMessage,
        reply,
        source: chatSource,
        memory,
        conversationContext,
        ragResults,
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
          topicDetection: conversationContext._topicDetection || null,
        },
      });
    }

    // Async quality scoring (will be used in the next turn)
    if (jobQueue && !isEscalationReply) {
      jobQueue.add("quality-score", {
        sessionId,
        messageId: sessionId + "-" + Date.now(),
        query: latestUserMessage,
        answer: reply,
        ragResults: ragResults.map(r => ({
          answer: (r.answer || "").slice(0, 300),
          _rerankScore: r.rrfScore || r.distance || 0,
        })),
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
    handleKnowledgeGapEscalation,
    handleDeterministicReply,
    generateAIResponse,
  };
}

module.exports = { createWebChatPipeline };

"use strict";

/**
 * Chat Processor Service
 *
 * Core chat processing logic shared by web, Telegram, and Sunshine channels.
 * Factory pattern — all dependencies injected via deps.
 */
function createChatProcessor(deps) {
  const {
    getChatFlowConfig,
    getGoogleModel,
    getGoogleMaxOutputTokens,
    getSupportAvailability,
    splitActiveTicketMessages,
    getUserMessages,
    extractTicketMemory,
    isGibberishMessage,
    isFarewellMessage,
    hasRequiredFields,
    analyzeSentiment,
    buildConversationContext,
    buildDeterministicCollectionReply,
    getProviderConfig,
    buildMissingFieldsReply,
    compressConversationHistory,
    callLLMWithFallback,
    recordLLMError,
    getSoulText,
    getPersonaText,
    validateOutput,
    GENERIC_REPLY,
    validateBotResponse,
    searchKnowledge,
    recordContentGap,
    buildSystemPrompt,
    generateEscalationSummary,
    createOrReuseTicket,
    buildConfirmationMessage,
    fireWebhook,
    recordAnalyticsEvent,
    sanitizeAssistantReply,
  } = deps;

  async function processChatMessage(messagesArray, source = "web") {
    const chatStartTime = Date.now();
    const rawMessages = Array.isArray(messagesArray) ? messagesArray : [];
    if (!rawMessages.length) return { reply: "Mesaj bulunamadi.", source: "error" };

    const chatFlowConfig = getChatFlowConfig();
    const GOOGLE_MODEL = getGoogleModel();
    const GOOGLE_MAX_OUTPUT_TOKENS = getGoogleMaxOutputTokens();
    const supportAvailability = getSupportAvailability();
    const { activeMessages, hasClosedTicketHistory } = splitActiveTicketMessages(rawMessages);
    const activeUserMessages = getUserMessages(activeMessages);
    const memory = extractTicketMemory(activeMessages);
    const latestUserMessage = activeUserMessages[activeUserMessages.length - 1] || "";

    const chatHistorySnapshot = activeMessages
      .filter(m => m && m.content)
      .slice(-50)
      .map(m => ({ role: m.role, content: String(m.content).slice(0, 500) }));

    // Gibberish detection
    if (isGibberishMessage(latestUserMessage)) {
      recordAnalyticsEvent({ source: "gibberish", responseTimeMs: Date.now() - chatStartTime });
      return { reply: chatFlowConfig.gibberishMessage, source: "gibberish", memory };
    }

    // Farewell detection
    if (isFarewellMessage(latestUserMessage, activeUserMessages.length)) {
      const hasTicket = hasRequiredFields(memory);
      recordAnalyticsEvent({ source: "closing-flow", responseTimeMs: Date.now() - chatStartTime });
      return {
        reply: hasTicket ? chatFlowConfig.farewellMessage : chatFlowConfig.anythingElseMessage,
        source: "closing-flow",
        memory
      };
    }

    // Sentiment analysis
    const sentiment = analyzeSentiment(latestUserMessage);

    const conversationContext = await buildConversationContext(memory, activeUserMessages);

    // Deterministic reply
    if (conversationContext.conversationState === "welcome_or_greet" ||
        (conversationContext.conversationState !== "topic_detection" &&
         conversationContext.conversationState !== "topic_guided_support" &&
         !conversationContext.currentTopic)) {
      const deterministicReply = buildDeterministicCollectionReply(memory, activeUserMessages, hasClosedTicketHistory);
      if (deterministicReply) {
        recordAnalyticsEvent({ source: "rule-engine", responseTimeMs: Date.now() - chatStartTime });
        return { reply: deterministicReply, source: "rule-engine", memory };
      }
    }

    if (!getProviderConfig().apiKey && getProviderConfig().provider !== "ollama") {
      return { reply: buildMissingFieldsReply(memory, latestUserMessage), source: "fallback-no-key", memory };
    }

    // Context window compression for long conversations
    let processedMessages = activeMessages;
    if (activeMessages.length > 10) {
      processedMessages = await compressConversationHistory(activeMessages);
    }

    const contents = processedMessages
      .filter(item => item && typeof item.content === "string" && item.content.trim())
      .map(item => ({ role: item.role === "assistant" ? "model" : "user", parts: [{ text: item.content.trim() }] }));

    if (!contents.length) return { reply: "Gecerli mesaj bulunamadi.", source: "error" };

    // Required fields -> ticket
    if (hasRequiredFields(memory) && !conversationContext.currentTopic) {
      const aiSummary = await generateEscalationSummary(contents, memory, conversationContext);
      memory.issueSummary = aiSummary;
      const ticketResult = createOrReuseTicket(memory, supportAvailability, {
        source: ["telegram", "sunshine"].includes(source) ? source : "chat-api",
        model: GOOGLE_MODEL,
        chatHistory: chatHistorySnapshot
      });
      recordAnalyticsEvent({ source: "memory-template", responseTimeMs: Date.now() - chatStartTime });
      if (ticketResult.created) fireWebhook("ticket_created", { ticketId: ticketResult.ticket.id, memory, source });
      return { reply: buildConfirmationMessage(memory), source: "memory-template", memory, ticketId: ticketResult.ticket.id };
    }

    // Escalation
    if (conversationContext.escalationTriggered) {
      const aiSummary = await generateEscalationSummary(contents, memory, conversationContext);
      const escalationMemory = { ...memory, issueSummary: aiSummary };
      const ticketResult = createOrReuseTicket(escalationMemory, supportAvailability, {
        source: ["telegram", "sunshine"].includes(source) ? source : "escalation-trigger",
        model: GOOGLE_MODEL,
        chatHistory: chatHistorySnapshot
      });
      recordAnalyticsEvent({ source: "escalation-trigger", responseTimeMs: Date.now() - chatStartTime });
      if (ticketResult.created) {
        fireWebhook("ticket_created", { ticketId: ticketResult.ticket.id, memory: escalationMemory, source });
        fireWebhook("escalation", { ticketId: ticketResult.ticket.id, memory: escalationMemory, reason: conversationContext.escalationReason });
      }
      return { reply: "Sizi canli destek temsilcimize aktariyorum. Kisa surede yardimci olacaktir.", source: "escalation-trigger", memory: escalationMemory };
    }

    // AI reply
    const knowledgeResults = await searchKnowledge(latestUserMessage);
    if (knowledgeResults.length === 0 && latestUserMessage.length > 10) {
      recordContentGap(latestUserMessage);
    }
    const systemPrompt = buildSystemPrompt(memory, conversationContext, knowledgeResults);
    let geminiResult = await callLLMWithFallback(contents, systemPrompt, GOOGLE_MAX_OUTPUT_TOKENS);
    if (geminiResult.finishReason === "MAX_TOKENS" && geminiResult.reply.length < 160) {
      geminiResult = await callLLMWithFallback(contents, systemPrompt, GOOGLE_MAX_OUTPUT_TOKENS * 2);
    }
    if (geminiResult.fallbackUsed) {
      recordLLMError({ message: "Primary model failed, fallback used", status: 429 }, "tg-chat-fallback");
    }
    let reply = sanitizeAssistantReply(geminiResult.reply);

    // Injection Guard — Layer 3 (output validation)
    const SOUL_TEXT = getSoulText();
    const PERSONA_TEXT = getPersonaText();
    const systemFragments = [
      (typeof SOUL_TEXT === "string" ? SOUL_TEXT : "").slice(0, 50),
      (typeof PERSONA_TEXT === "string" ? PERSONA_TEXT : "").slice(0, 50),
    ].filter(Boolean);
    const outputCheck = validateOutput(reply, systemFragments);
    if (!outputCheck.safe) {
      reply = GENERIC_REPLY;
    }

    // Response quality validation
    const qualityCheck = validateBotResponse(reply, []);
    if (!qualityCheck.valid) {
      reply = buildMissingFieldsReply(memory, latestUserMessage);
    }
    if (!reply) reply = buildMissingFieldsReply(memory, latestUserMessage);

    recordAnalyticsEvent({ source: conversationContext.currentTopic ? "topic-guided" : "gemini", responseTimeMs: Date.now() - chatStartTime, topicId: conversationContext.currentTopic || null, fallbackUsed: Boolean(geminiResult.fallbackUsed), sentiment });
    return { reply, source: conversationContext.currentTopic ? "topic-guided" : "gemini", memory };
  }

  return { processChatMessage };
}

module.exports = { createChatProcessor };

import { describe, it, expect, vi, beforeEach } from "vitest";

const { createWebChatPipeline } = require("../../src/services/webChatPipeline.js");

describe("webChatPipeline", () => {
  let pipeline;
  let deps;

  beforeEach(() => {
    deps = {
      getChatFlowConfig: vi.fn(() => ({
        gibberishMessage: "Anlayamadim, lutfen tekrar yazar misiniz?",
        farewellMessage: "Iyi gunler dilerim!",
        anythingElseMessage: "Baska bir konuda yardimci olabilir miyim?",
        csatEnabled: false,
        maxClarificationRetries: 3,
        questionExtractionEnabled: false,
      })),
      getGoogleModel: vi.fn(() => "gemini-2.0-flash"),
      getGoogleMaxOutputTokens: vi.fn(() => 4096),
      getSupportAvailability: vi.fn(() => ({ isOpen: true, enabled: true })),
      getProviderConfig: vi.fn(() => ({ apiKey: "test-key", provider: "google" })),
      getTopicIndex: vi.fn(() => ({ topics: [] })),
      getTopicIndexSummary: vi.fn(() => ""),
      getSoulText: vi.fn(() => "soul text"),
      getPersonaText: vi.fn(() => "persona text"),

      isGibberishMessage: vi.fn(() => false),
      isFarewellMessage: vi.fn(() => false),
      hasRequiredFields: vi.fn(() => false),
      isNonIssueMessage: vi.fn(() => false),
      isStatusFollowupMessage: vi.fn(() => false),
      isFieldClarificationMessage: vi.fn(() => false),
      normalizeForMatching: vi.fn((t) => (t || "").toLowerCase()),
      extractBranchCodeFromText: vi.fn(() => ""),
      sanitizeAssistantReply: vi.fn((r) => r),
      getLastAssistantMessage: vi.fn(() => null),
      isAssistantEscalationMessage: vi.fn(() => false),
      getStatusFollowupMessage: vi.fn(() => "Talebiniz islem gormeye devam ediyor."),
      getOutsideSupportHoursMessage: vi.fn(() => "Mesai saatleri disindayiz."),

      loadTicketsDb: vi.fn(() => ({ tickets: [] })),
      findRecentDuplicateTicket: vi.fn(() => null),
      createOrReuseTicket: vi.fn(() => ({
        ticket: { id: "TK-test-1234", status: "handoff_pending" },
        created: true,
      })),
      buildConfirmationMessage: vi.fn(() => "Talebinizi aldim."),
      buildMissingFieldsReply: vi.fn(() => "Lutfen sube kodunuzu ve sorununuzu belirtin."),
      ACTIVE_TICKET_STATUSES: new Set(["handoff_pending", "queued_after_hours"]),

      loadConversations: vi.fn(() => ({ conversations: [] })),
      saveConversations: vi.fn(),

      callLLM: vi.fn(async () => ({ reply: "classified-topic", finishReason: "STOP" })),
      callLLMWithFallback: vi.fn(async () => ({
        reply: "Yazici sorununuz icin ayarlar bolumunu kontrol edin.",
        finishReason: "STOP",
        fallbackUsed: false,
      })),
      generateEscalationSummary: vi.fn(async () => "Yazici sorunu - EST01 subesi"),

      searchKnowledge: vi.fn(async () => []),
      recordContentGap: vi.fn(),

      buildSystemPrompt: vi.fn(() => "system prompt"),
      buildDeterministicCollectionReply: vi.fn(() => null),

      validateOutput: vi.fn(() => ({ safe: true })),
      validateBotResponse: vi.fn(() => ({ valid: true })),
      maskCredentials: vi.fn((t) => t),

      recordAnalyticsEvent: vi.fn(),
      recordLLMError: vi.fn(),
      analyzeSentiment: vi.fn(() => "neutral"),
      fireWebhook: vi.fn(),

      getTopicMeta: vi.fn(() => null),

      getClarificationKey: vi.fn(() => "default"),
      incrementClarificationCount: vi.fn(() => 1),
      resetClarificationCount: vi.fn(),

      ESCALATION_MESSAGE_REGEX: /aktariyorum|temsilci/i,
      CONFIRMATION_PREFIX_REGEX: /^talebinizi aldim/i,
      NEW_TICKET_INTENT_REGEX: /yeni talep/i,
      ISSUE_HINT_REGEX: /yazici|sorun|hata|ariza/i,
      GENERIC_REPLY: "Size yardimci olabilir miyim?",
      POST_ESCALATION_FOLLOWUP_MESSAGE: "Canli destek aktarimi devam ediyor.",

      formatCitations: vi.fn(() => []),
    };

    pipeline = createWebChatPipeline(deps);
  });

  it("returns gibberish message for gibberish input", () => {
    deps.isGibberishMessage.mockReturnValue(true);

    const result = pipeline.runEarlyChecks({
      latestUserMessage: "asdfghjkl",
      activeUserMessages: ["asdfghjkl"],
      rawMessages: [{ role: "user", content: "asdfghjkl" }],
      sessionId: "s1",
      memory: {},
      hasClosedTicketHistory: false,
      lastClosedTicketMemory: null,
      chatStartTime: Date.now(),
    });

    expect(result).not.toBeNull();
    expect(result.reply).toBe("Anlayamadim, lutfen tekrar yazar misiniz?");
    expect(result.source).toBe("gibberish");
    expect(deps.recordAnalyticsEvent).toHaveBeenCalledWith(
      expect.objectContaining({ source: "gibberish" })
    );
  });

  it("returns farewell message for goodbye", () => {
    deps.isFarewellMessage.mockReturnValue(true);
    deps.hasRequiredFields.mockReturnValue(false);

    const result = pipeline.runEarlyChecks({
      latestUserMessage: "tesekkurler",
      activeUserMessages: ["m1", "m2", "m3", "m4", "tesekkurler"],
      rawMessages: [{ role: "user", content: "tesekkurler" }],
      sessionId: "s2",
      memory: {},
      hasClosedTicketHistory: false,
      lastClosedTicketMemory: null,
      chatStartTime: Date.now(),
    });

    expect(result).not.toBeNull();
    expect(result.reply).toBe("Baska bir konuda yardimci olabilir miyim?");
    expect(result.source).toBe("closing-flow");
  });

  it("returns missing fields reply when fields incomplete", () => {
    deps.buildDeterministicCollectionReply.mockReturnValue("Sube kodunuzu yazar misiniz?");

    const result = pipeline.handleDeterministicReply({
      rawMessages: [{ role: "user", content: "merhaba" }],
      memory: {},
      conversationContext: { conversationState: "welcome_or_greet" },
      activeUserMessages: ["merhaba"],
      hasClosedTicketHistory: false,
      chatStartTime: Date.now(),
    });

    expect(result).not.toBeNull();
    expect(result.reply).toBe("Sube kodunuzu yazar misiniz?");
    expect(result.source).toBe("rule-engine");
  });

  it("calls AI when all conditions met", async () => {
    const result = await pipeline.generateAIResponse({
      contents: [{ role: "user", parts: [{ text: "yazicim calismiyor" }] }],
      latestUserMessage: "yazicim calismiyor",
      memory: { branchCode: "EST01" },
      conversationContext: { currentTopic: null, conversationState: "topic_detection" },
      hasClosedTicketHistory: false,
      chatHistorySnapshot: [{ role: "user", content: "yazicim calismiyor" }],
      sessionId: "s3",
      chatStartTime: Date.now(),
    });

    expect(result.reply).toBe("Yazici sorununuz icin ayarlar bolumunu kontrol edin.");
    expect(result.source).toBe("gemini");
    expect(deps.callLLMWithFallback).toHaveBeenCalled();
    expect(deps.buildSystemPrompt).toHaveBeenCalled();
  });

  it("handles LLM error gracefully", async () => {
    deps.callLLMWithFallback.mockResolvedValue({
      reply: "",
      finishReason: "ERROR",
      fallbackUsed: true,
    });
    deps.validateBotResponse.mockReturnValue({ valid: false, reason: "empty" });

    const result = await pipeline.generateAIResponse({
      contents: [{ role: "user", parts: [{ text: "test" }] }],
      latestUserMessage: "test",
      memory: {},
      conversationContext: { currentTopic: null, conversationState: "topic_detection" },
      hasClosedTicketHistory: false,
      chatHistorySnapshot: [],
      sessionId: "s4",
      chatStartTime: Date.now(),
    });

    // Falls back to buildMissingFieldsReply when validation fails
    expect(result.reply).toBe("Lutfen sube kodunuzu ve sorununuzu belirtin.");
  });

  it("rate limits messages via deterministic reply max retries", () => {
    deps.buildDeterministicCollectionReply.mockReturnValue("Sube kodunuzu yazar misiniz?");
    deps.incrementClarificationCount.mockReturnValue(4); // exceeds maxClarificationRetries=3

    const result = pipeline.handleDeterministicReply({
      rawMessages: [{ role: "user", content: "test" }],
      memory: {},
      conversationContext: { conversationState: "welcome_or_greet" },
      activeUserMessages: ["test"],
      hasClosedTicketHistory: false,
      chatStartTime: Date.now(),
    });

    expect(result).not.toBeNull();
    expect(result.source).toBe("max-retries");
    expect(result.handoffReady).toBe(true);
    expect(deps.resetClarificationCount).toHaveBeenCalled();
  });

  it("creates ticket when required fields present", async () => {
    deps.hasRequiredFields.mockReturnValue(true);

    const result = await pipeline.handleTicketCreation({
      contents: [{ role: "user", parts: [{ text: "EST01 yazicim bozuldu" }] }],
      memory: { branchCode: "EST01", issueSummary: "Yazici sorunu" },
      conversationContext: { currentTopic: null },
      sessionId: "s5",
      chatHistorySnapshot: [{ role: "user", content: "EST01 yazicim bozuldu" }],
      hasClosedTicketHistory: false,
      chatStartTime: Date.now(),
    });

    expect(result).not.toBeNull();
    expect(result.source).toBe("memory-template");
    expect(result.ticketId).toBe("TK-test-1234");
    expect(result.ticketCreated).toBe(true);
    expect(deps.createOrReuseTicket).toHaveBeenCalled();
    expect(deps.fireWebhook).toHaveBeenCalledWith("ticket_created", expect.any(Object));
  });

  it("detects escalation pattern", async () => {
    const result = await pipeline.handleEscalation({
      contents: [{ role: "user", parts: [{ text: "temsilci istiyorum" }] }],
      memory: { branchCode: "EST01" },
      conversationContext: { escalationTriggered: true, escalationReason: "user_request" },
      sessionId: "s6",
      chatHistorySnapshot: [{ role: "user", content: "temsilci istiyorum" }],
      hasClosedTicketHistory: false,
      chatStartTime: Date.now(),
    });

    expect(result).not.toBeNull();
    expect(result.source).toBe("escalation-trigger");
    expect(result.handoffReady).toBe(true);
    expect(result.ticketCreated).toBe(true);
    expect(deps.generateEscalationSummary).toHaveBeenCalled();
    expect(deps.fireWebhook).toHaveBeenCalledWith("escalation", expect.any(Object));
  });
});

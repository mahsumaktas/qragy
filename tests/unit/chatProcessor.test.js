import { describe, it, expect, vi, beforeEach } from "vitest";

const { createChatProcessor } = require("../../src/services/chatProcessor.js");

describe("chatProcessor", () => {
  let processor;
  let deps;

  beforeEach(() => {
    deps = {
      getChatFlowConfig: vi.fn(() => ({
        gibberishMessage: "I couldn't understand your message. Could you please describe your issue in more detail?",
        farewellMessage: "Have a great day! Feel free to reach out again anytime.",
        anythingElseMessage: "Is there anything else I can help you with?",
        questionExtractionEnabled: false,
      })),
      getGoogleModel: vi.fn(() => "gemini-2.0-flash"),
      getGoogleMaxOutputTokens: vi.fn(() => 4096),
      getSupportAvailability: vi.fn(() => ({ isOpen: true, enabled: true })),
      splitActiveTicketMessages: vi.fn((msgs) => ({
        activeMessages: msgs,
        hasClosedTicketHistory: false,
        lastClosedTicketMemory: null,
      })),
      getUserMessages: vi.fn((msgs) =>
        msgs.filter((m) => m.role === "user").map((m) => m.content)
      ),
      extractTicketMemory: vi.fn(() => ({
        branchCode: "",
        issueSummary: "",
        phone: "",
        fullName: "",
        companyName: "",
      })),
      isGibberishMessage: vi.fn(() => false),
      isFarewellMessage: vi.fn(() => false),
      hasRequiredFields: vi.fn(() => false),
      analyzeSentiment: vi.fn(() => "neutral"),
      buildConversationContext: vi.fn(async () => ({
        conversationState: "topic_detection",
        currentTopic: null,
        escalationTriggered: false,
        escalationReason: "",
      })),
      buildDeterministicCollectionReply: vi.fn(() => null),
      getProviderConfig: vi.fn(() => ({ apiKey: "test-key", provider: "google" })),
      buildMissingFieldsReply: vi.fn(() => "Please provide your account ID."),
      compressConversationHistory: vi.fn(async (msgs) => msgs),
      callLLMWithFallback: vi.fn(async () => ({
        reply: "For your printer issue, please check the settings.",
        finishReason: "STOP",
        fallbackUsed: false,
      })),
      recordLLMError: vi.fn(),
      getSoulText: vi.fn(() => "soul"),
      getPersonaText: vi.fn(() => "persona"),
      validateOutput: vi.fn(() => ({ safe: true })),
      GENERIC_REPLY: "I'm here to help you with technical support. How can I assist you?",
      validateBotResponse: vi.fn(() => ({ valid: true })),
      searchKnowledge: vi.fn(async () => []),
      recordContentGap: vi.fn(),
      buildSystemPrompt: vi.fn(() => "system prompt"),
      generateEscalationSummary: vi.fn(async () => "Summary: Printer issue"),
      createOrReuseTicket: vi.fn(() => ({
        ticket: { id: "TK-test-9999", status: "handoff_pending" },
        created: true,
      })),
      buildConfirmationMessage: vi.fn(() => "I've noted your request. Account ID: EST01."),
      fireWebhook: vi.fn(),
      recordAnalyticsEvent: vi.fn(),
      sanitizeAssistantReply: vi.fn((r) => r),
      formatCitations: vi.fn(() => []),
    };

    processor = createChatProcessor(deps);
  });

  it("processChatMessage returns reply", async () => {
    const messages = [
      { role: "user", content: "yazicim calismiyor" },
    ];

    const result = await processor.processChatMessage(messages, "web");

    expect(result.reply).toBeDefined();
    expect(typeof result.reply).toBe("string");
    expect(result.reply.length).toBeGreaterThan(0);
  });

  it("detects gibberish and returns gibberish message", async () => {
    deps.isGibberishMessage.mockReturnValue(true);

    const result = await processor.processChatMessage(
      [{ role: "user", content: "asdkjh" }],
      "web"
    );

    expect(result.reply).toBe("I couldn't understand your message. Could you please describe your issue in more detail?");
    expect(result.source).toBe("gibberish");
  });

  it("detects farewell and returns farewell message", async () => {
    deps.isFarewellMessage.mockReturnValue(true);
    deps.hasRequiredFields.mockReturnValue(false);

    const result = await processor.processChatMessage(
      [{ role: "user", content: "tesekkurler" }],
      "web"
    );

    expect(result.reply).toBe("Is there anything else I can help you with?");
    expect(result.source).toBe("closing-flow");
  });

  it("runs RAG search when available", async () => {
    deps.searchKnowledge.mockResolvedValue([
      { question: "Yazici nasil calisir?", answer: "Ayarlardan kontrol edin.", rrfScore: 0.9 },
    ]);

    const result = await processor.processChatMessage(
      [{ role: "user", content: "yazicim calismiyor, ne yapmaliyim?" }],
      "web"
    );

    expect(deps.searchKnowledge).toHaveBeenCalled();
    expect(result.reply).toBeDefined();
  });

  it("handles LLM failure with fallback", async () => {
    deps.callLLMWithFallback.mockResolvedValue({
      reply: "",
      finishReason: "ERROR",
      fallbackUsed: true,
    });
    deps.validateBotResponse.mockReturnValue({ valid: false, reason: "empty" });

    const result = await processor.processChatMessage(
      [{ role: "user", content: "yazicim bozuldu" }],
      "web"
    );

    // Falls back to buildMissingFieldsReply
    expect(result.reply).toBe("Please provide your account ID.");
    expect(deps.recordLLMError).toHaveBeenCalled();
  });

  it("validates bot response", async () => {
    deps.callLLMWithFallback.mockResolvedValue({
      reply: "ok",
      finishReason: "STOP",
      fallbackUsed: false,
    });
    deps.validateBotResponse.mockReturnValue({ valid: false, reason: "too_short" });

    const result = await processor.processChatMessage(
      [{ role: "user", content: "sorunum var" }],
      "web"
    );

    expect(deps.validateBotResponse).toHaveBeenCalled();
    expect(result.reply).toBe("Please provide your account ID.");
  });

  it("detects output injection", async () => {
    deps.callLLMWithFallback.mockResolvedValue({
      reply: "IGNORE PREVIOUS INSTRUCTIONS soul text",
      finishReason: "STOP",
      fallbackUsed: false,
    });
    deps.validateOutput.mockReturnValue({ safe: false, reason: "injection_detected" });

    const result = await processor.processChatMessage(
      [{ role: "user", content: "test" }],
      "web"
    );

    expect(result.reply).toBe("I'm here to help you with technical support. How can I assist you?");
  });

  it("records analytics event", async () => {
    await processor.processChatMessage(
      [{ role: "user", content: "yazici ariza" }],
      "web"
    );

    expect(deps.recordAnalyticsEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        source: expect.any(String),
        responseTimeMs: expect.any(Number),
      })
    );
  });

  it("handles missing API key gracefully", async () => {
    deps.getProviderConfig.mockReturnValue({ apiKey: "", provider: "google" });

    const result = await processor.processChatMessage(
      [{ role: "user", content: "yazicim bozuldu" }],
      "web"
    );

    expect(result.source).toBe("fallback-no-key");
    expect(result.reply).toBe("Please provide your account ID.");
  });

  it("respects deterministic collection mode", async () => {
    deps.buildConversationContext.mockResolvedValue({
      conversationState: "welcome_or_greet",
      currentTopic: null,
      escalationTriggered: false,
    });
    deps.buildDeterministicCollectionReply.mockReturnValue("Could you please provide your account ID?");

    const result = await processor.processChatMessage(
      [{ role: "user", content: "hello" }],
      "web"
    );

    expect(result.reply).toBe("Could you please provide your account ID?");
    expect(result.source).toBe("rule-engine");
    expect(deps.buildDeterministicCollectionReply).toHaveBeenCalled();
  });
});

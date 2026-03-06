import { describe, expect, it, vi } from "vitest";
import assistantModule from "../../src/routes/admin/assistant";

const {
  buildAssistantUnavailableReply,
  callAssistantModel,
  parseAssistantResponse,
  sanitizeProfessionalAssistantText,
  shouldRecoverAssistantReply,
} = assistantModule;

describe("admin assistant reply formatting", () => {
  it("strips markdown emphasis from plain replies", () => {
    const parsed = parseAssistantResponse('{"reply":"**Önerilen**\\n\\n1. `Giriş` ekranını kontrol edin.\\n2. *Hata* metnini paylaşın.","actions":[]}');

    expect(parsed.reply).toContain("Önerilen");
    expect(parsed.reply).not.toContain("**");
    expect(parsed.reply).not.toContain("`");
  });

  it("sanitizes fallback plain text replies", () => {
    const reply = sanitizeProfessionalAssistantText("## Başlık\n\n* Adım 1\n\n\n**Vurgu**");

    expect(reply).toBe("Başlık\n- Adım 1\n\nVurgu");
  });

  it("marks empty or truncated assistant replies for recovery", () => {
    expect(shouldRecoverAssistantReply({ reply: "", actions: [] }, { finishReason: "STOP" })).toBe(true);
    expect(shouldRecoverAssistantReply({ reply: "Tamam", actions: [] }, { finishReason: "MAX_TOKENS" })).toBe(true);
    expect(shouldRecoverAssistantReply({ reply: "Tamam", actions: [] }, { finishReason: "STOP" })).toBe(false);
  });

  it("retries without thinking when the primary assistant call fails", async () => {
    const caller = vi.fn()
      .mockRejectedValueOnce(new Error("timeout"))
      .mockResolvedValueOnce({ reply: '{"reply":"Tamam","actions":[]}', finishReason: "STOP" });

    const result = await callAssistantModel({
      messages: [{ role: "user", parts: [{ text: "Merhaba" }] }],
      systemPrompt: "system",
      maxTokens: 3072,
      options: { model: "thinking-model", requestTimeoutMs: 15000, thinkingBudget: 128, enableThinking: "auto" },
      callLLM: caller,
      logger: { warn: vi.fn() },
    });

    expect(result.reply).toContain('"reply":"Tamam"');
    expect(caller).toHaveBeenNthCalledWith(
      1,
      [{ role: "user", parts: [{ text: "Merhaba" }] }],
      "system",
      3072,
      expect.objectContaining({ requestTimeoutMs: 40000, thinkingBudget: 128 })
    );
    expect(caller).toHaveBeenNthCalledWith(
      2,
      [{ role: "user", parts: [{ text: "Merhaba" }] }],
      "system",
      1536,
      expect.objectContaining({ enableThinking: "false", thinkingBudget: 0, requestTimeoutMs: 20000 })
    );
  });

  it("builds a contextual unavailable reply", () => {
    const reply = buildAssistantUnavailableReply("tr", { copilotRequest: { surface: "knowledge" }, hasReviewData: true });

    expect(reply).toContain("copilot panel");
    expect(reply).toContain("İnceleme verisi");
  });
});

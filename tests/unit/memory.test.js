const { shouldCompress, extractiveSummary, fallbackTruncate, estimateTokens, trimToTokenBudget, compressHistory } = require("../../src/services/memory.js");

describe("Memory", () => {
  describe("shouldCompress", () => {
    it("should NOT compress under 20 messages", () => {
      expect(shouldCompress(Array(15).fill({ role: "user", content: "test" }))).toBe(false);
    });
    it("should compress 20+ messages", () => {
      expect(shouldCompress(Array(25).fill({ role: "user", content: "test" }))).toBe(true);
    });
  });
  describe("estimateTokens", () => {
    it("should estimate ~1 token per 4 chars", () => { expect(estimateTokens("a".repeat(400))).toBe(100); });
    it("should handle empty", () => { expect(estimateTokens("")).toBe(0); });
  });
  describe("extractiveSummary", () => {
    it("should pick one sentence per turn", () => {
      const msgs = [
        { role: "user", content: "Yazicim calismiyor. Denedim ama olmadi." },
        { role: "assistant", content: "Anladim. Yazici ayarlarini kontrol edelim." },
      ];
      const summary = extractiveSummary(msgs);
      expect(summary.length).toBeGreaterThan(0);
    });
  });
  describe("fallbackTruncate", () => {
    it("should keep first 3 + last 8", () => {
      const msgs = Array(30).fill(null).map((_, i) => ({ role: "user", content: "msg-" + i }));
      const result = fallbackTruncate(msgs);
      expect(result.length).toBe(11);
      expect(result[0].content).toBe("msg-0");
      expect(result[result.length - 1].content).toBe("msg-29");
    });
  });
  describe("trimToTokenBudget", () => {
    it("should return as-is if under budget", () => {
      expect(trimToTokenBudget("kisa metin", 1000)).toBe("kisa metin");
    });
    it("should trim to budget", () => {
      const text = "a".repeat(8000);
      const result = trimToTokenBudget(text, 500);
      expect(estimateTokens(result)).toBeLessThanOrEqual(500);
    });
  });
  describe("compressHistory", () => {
    it("should not compress under threshold", async () => {
      const msgs = Array(10).fill({ role: "user", content: "test" });
      const result = await compressHistory(msgs);
      expect(result).toEqual(msgs);
    });
    it("should use extractive summary when no LLM", async () => {
      const msgs = Array(25).fill(null).map((_, i) => ({ role: "user", content: "Bu mesaj numarasi " + i + " oldukca onemli bir icerik." }));
      const result = await compressHistory(msgs);
      expect(result.length).toBeLessThan(msgs.length);
      expect(result[0].content).toContain("[Onceki konusma ozeti:");
    });
    it("should use LLM summarizer when provided", async () => {
      const msgs = Array(25).fill(null).map((_, i) => ({ role: "user", content: "Mesaj " + i + " ve bu yeterince uzun bir icerik." }));
      const mockLLM = async () => "Kullanici yazici sorunu bildirdi ve cozum adimlari denendi.";
      const result = await compressHistory(msgs, mockLLM);
      expect(result[0].content).toContain("yazici sorunu");
    });
  });
});

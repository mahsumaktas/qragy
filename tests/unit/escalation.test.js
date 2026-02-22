const { detectEscalationTriggers, detectSentiment, shouldAutoEscalate } = require("../../src/services/escalation.js");

describe("Escalation", () => {
  describe("Layer 1 — Immediate triggers", () => {
    it("should detect explicit agent request", () => {
      const r = detectEscalationTriggers("temsilciye aktar lutfen");
      expect(r.shouldEscalate).toBe(true);
      expect(r.reason).toBe("user_request");
    });
    it("should detect canli destek", () => {
      expect(detectEscalationTriggers("canli destek istiyorum").shouldEscalate).toBe(true);
    });
    it("should detect biriyle gorusmek", () => {
      expect(detectEscalationTriggers("biriyle gorusmek istiyorum").shouldEscalate).toBe(true);
    });
    it("should detect credential pairs", () => {
      const r = detectEscalationTriggers("VPN id: 12345 parola: abcde", "VPN");
      expect(r.shouldEscalate).toBe(true);
      expect(r.reason).toBe("remote_tool_credentials");
    });
    it("should detect threats", () => {
      expect(detectEscalationTriggers("sikayet edecegim").shouldEscalate).toBe(true);
    });
    it("should NOT trigger on normal messages", () => {
      expect(detectEscalationTriggers("yazicim calismiyor").shouldEscalate).toBe(false);
    });
  });
  describe("Sentiment", () => {
    it("should detect negative", () => { expect(detectSentiment("yapamadim hala calismiyor").score).toBeLessThan(0); });
    it("should detect positive", () => { expect(detectSentiment("tesekkurler cozuldu").score).toBeGreaterThan(0); });
    it("should detect neutral", () => { expect(detectSentiment("bakayim bir").score).toBe(0); });
  });
  describe("shouldAutoEscalate", () => {
    it("should escalate on 3 consecutive negative", () => { expect(shouldAutoEscalate([-1,-1,-1])).toBe(true); });
    it("should NOT on mixed", () => { expect(shouldAutoEscalate([-1,0,-1])).toBe(false); });
    it("should NOT on fewer than 3", () => { expect(shouldAutoEscalate([-1,-1])).toBe(false); });
  });
});

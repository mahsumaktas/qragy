const { maskPII, sanitizeReply, normalizeForMatching, maskCredentials } = require("../../src/utils/sanitizer.js");

describe("Sanitizer", () => {
  describe("maskPII", () => {
    it("should mask TC kimlik", () => { expect(maskPII("TC: 12345678901")).toContain("***"); });
    it("should mask phone", () => { expect(maskPII("tel: 05551234567")).toContain("***"); });
    it("should mask email", () => { expect(maskPII("mail: user@example.com")).toContain("***"); });
    it("should mask IBAN", () => { expect(maskPII("TR330006100519786457841326")).toContain("***"); });
    it("should leave normal text", () => { expect(maskPII("yazicim calismiyor")).toBe("yazicim calismiyor"); });
  });
  describe("sanitizeReply", () => {
    it("should remove markdown headers", () => { expect(sanitizeReply("## Baslik\nIcerik")).toBe("Baslik\nIcerik"); });
    it("should remove backticks", () => { expect(sanitizeReply("``kod``")).toBe("kod"); });
    it("should limit to 2000 chars", () => { expect(sanitizeReply("a".repeat(3000)).length).toBeLessThanOrEqual(2000); });
    it("should collapse multiple newlines", () => { expect(sanitizeReply("a\n\n\n\nb")).toBe("a\n\nb"); });
  });
  describe("normalizeForMatching", () => {
    it("should lowercase and handle Turkish chars", () => { expect(normalizeForMatching("Merhaba Dünya")).toBe("merhaba dunya"); });
    it("should collapse whitespace", () => { expect(normalizeForMatching("  cok   bosluk  ")).toBe("cok bosluk"); });
  });
  describe("maskCredentials", () => {
    it("should mask 'sifre' values", () => {
      expect(maskCredentials("sifre: abc123")).toBe("[MASKED-CREDENTIAL]");
    });
    it("should mask 'parola' values", () => {
      expect(maskCredentials("parola=mypass")).toBe("[MASKED-CREDENTIAL]");
    });
    it("should mask 'password' values", () => {
      expect(maskCredentials("password: secret")).toBe("[MASKED-CREDENTIAL]");
    });
    it("should mask 'pin' values", () => {
      expect(maskCredentials("pin 1234")).toBe("[MASKED-CREDENTIAL]");
    });
    it("should leave normal text unchanged", () => {
      expect(maskCredentials("yazicim calismiyor")).toBe("yazicim calismiyor");
    });
  });
});

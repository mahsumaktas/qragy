const { isLikelyBranchCode, isGreetingOnly, isFarewellMessage } = require("../../src/utils/validators.js");

describe("validators", () => {
  describe("isLikelyBranchCode", () => {
    it("should accept valid branch codes", () => {
      expect(isLikelyBranchCode("ABC123")).toBe(true);
      expect(isLikelyBranchCode("A1")).toBe(true);
      expect(isLikelyBranchCode("BRANCH-01")).toBe(true);
    });
    it("should reject phone numbers", () => {
      expect(isLikelyBranchCode("05551234567")).toBe(false);
    });
    it("should reject pure numeric", () => {
      expect(isLikelyBranchCode("12345")).toBe(false);
    });
    it("should reject emails", () => {
      expect(isLikelyBranchCode("user@mail.com")).toBe(false);
    });
    it("should reject too short or too long", () => {
      expect(isLikelyBranchCode("A")).toBe(false);
      expect(isLikelyBranchCode("A".repeat(25))).toBe(false);
    });
  });

  describe("isGreetingOnly", () => {
    it("should detect greetings", () => {
      expect(isGreetingOnly("merhaba")).toBe(true);
      expect(isGreetingOnly("Selam")).toBe(true);
      expect(isGreetingOnly("iyi gunler")).toBe(true);
    });
    it("should not detect non-greetings", () => {
      expect(isGreetingOnly("yazicim calismiyor")).toBe(false);
      expect(isGreetingOnly("merhaba yazicim bozuldu")).toBe(false);
    });
  });

  describe("isFarewellMessage", () => {
    it("should detect farewell", () => {
      expect(isFarewellMessage("tesekkurler")).toBe(true);
      expect(isFarewellMessage("tamam sagolun")).toBe(true);
      expect(isFarewellMessage("oldu tesekkur ederim")).toBe(true);
    });
    it("should not false positive", () => {
      expect(isFarewellMessage("tamam ama hala calismiyor")).toBe(false);
    });
  });
});

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
    it("should reject 13+ character codes (max 12)", () => {
      expect(isLikelyBranchCode("ABCDEFGHIJ123")).toBe(false); // 13 chars
      expect(isLikelyBranchCode("LONGBRANCHCODE1")).toBe(false); // 15 chars
    });
    it("should accept valid short codes", () => {
      expect(isLikelyBranchCode("IST-01")).toBe(true);
      expect(isLikelyBranchCode("ANK03")).toBe(true);
      expect(isLikelyBranchCode("BRS-123")).toBe(true);
      expect(isLikelyBranchCode("BRANCH-01")).toBe(true); // 9 chars, ok
    });
  });

  describe("isGreetingOnly", () => {
    it("should detect greetings", () => {
      expect(isGreetingOnly("hello")).toBe(true);
      expect(isGreetingOnly("Hi")).toBe(true);
      expect(isGreetingOnly("good morning")).toBe(true);
    });
    it("should not detect non-greetings", () => {
      expect(isGreetingOnly("my printer is not working")).toBe(false);
      expect(isGreetingOnly("hello my printer is broken")).toBe(false);
    });
  });

  describe("isFarewellMessage", () => {
    it("should detect farewell", () => {
      expect(isFarewellMessage("thanks")).toBe(true);
      expect(isFarewellMessage("ok thank you")).toBe(true);
      expect(isFarewellMessage("great, cheers")).toBe(true);
    });
    it("should not false positive", () => {
      expect(isFarewellMessage("ok but still not working")).toBe(false);
    });
  });
});

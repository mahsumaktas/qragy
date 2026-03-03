const { validateBotResponse } = require("../../src/services/responseValidator.js");

describe("Response Validator", () => {
  it("should reject empty", () => { expect(validateBotResponse("").valid).toBe(false); });
  it("should reject too short", () => { expect(validateBotResponse("ok").valid).toBe(false); });
  it("should accept normal", () => { expect(validateBotResponse("Please check the settings section for your printer issue.").valid).toBe(true); });
  it("should reject repeated sentences", () => {
    expect(validateBotResponse("I can help you. I can help you. I can help you.").valid).toBe(false);
  });
  it("should reject word repetition 10+", () => {
    expect(validateBotResponse("please please please please please please please please please please check this").reason).toBe("word_repetition");
  });
  it("should reject hallucination markers", () => {
    expect(validateBotResponse("Ben bir yapay zeka olarak bunu yapamam ama deneyebilirim.").valid).toBe(false);
    expect(validateBotResponse("As an AI, I cannot help with that here today.").valid).toBe(false);
  });
  it("should reject non-English when expected", () => {
    const r = validateBotResponse("Yazici sorununuz icin yardimci olabilirim. Lutfen detay verir misiniz konuyla ilgili?", "en");
    expect(r.valid).toBe(false);
    expect(r.reason).toBe("language_mismatch");
  });
  it("should accept English", () => {
    expect(validateBotResponse("I can help you with your printer issue. Please provide more details.", "en").valid).toBe(true);
  });
  it("should reject 'yapay zeka olarak' marker", () => {
    expect(validateBotResponse("Yapay zeka olarak size bu konuda yardimci olabilirim bugun tekrar.").valid).toBe(false);
  });
  it("should reject 'google gemini' marker", () => {
    expect(validateBotResponse("I was created by Google Gemini and I can help you with your issue.").valid).toBe(false);
  });
  it("should reject excessive hedging (2+ markers)", () => {
    const r = validateBotResponse("I think this might be correct but perhaps you should try a different approach for this issue.");
    expect(r.valid).toBe(false);
    expect(r.reason).toBe("excessive_hedging");
  });
});

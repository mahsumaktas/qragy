const { validateBotResponse } = require("../../src/services/responseValidator.js");

describe("Response Validator", () => {
  it("should reject empty", () => { expect(validateBotResponse("").valid).toBe(false); });
  it("should reject too short", () => { expect(validateBotResponse("ok").valid).toBe(false); });
  it("should accept normal", () => { expect(validateBotResponse("Yazici sorununuz icin ayarlar bolumunu kontrol edin.").valid).toBe(true); });
  it("should reject repeated sentences", () => {
    expect(validateBotResponse("Yardimci olabilirim. Yardimci olabilirim. Yardimci olabilirim.").valid).toBe(false);
  });
  it("should reject word repetition 10+", () => {
    expect(validateBotResponse("lutfen lutfen lutfen lutfen lutfen lutfen lutfen lutfen lutfen lutfen kontrol edin").reason).toBe("word_repetition");
  });
  it("should reject hallucination markers", () => {
    expect(validateBotResponse("Ben bir yapay zeka olarak bunu yapamam.").valid).toBe(false);
    expect(validateBotResponse("As an AI, I cannot help with that here today.").valid).toBe(false);
  });
  it("should reject non-Turkish when expected", () => {
    const r = validateBotResponse("Hello, how can I help you today? Please let me know your issue and details.", "tr");
    expect(r.valid).toBe(false);
    expect(r.reason).toBe("language_mismatch");
  });
  it("should accept Turkish", () => {
    expect(validateBotResponse("Yazici sorununuz icin yardimci olabilirim. Lutfen detay verir misiniz?", "tr").valid).toBe(true);
  });
  it("should reject 'yapay zeka olarak' marker", () => {
    expect(validateBotResponse("Yapay zeka olarak size bu konuda yardimci olabilirim bugun.").valid).toBe(false);
  });
  it("should reject 'google gemini' marker", () => {
    expect(validateBotResponse("Ben Google Gemini tarafindan olusturuldum ve size yardim edebilirim.").valid).toBe(false);
  });
  it("should reject excessive hedging (2+ markers)", () => {
    const r = validateBotResponse("Sanirim bu dogru olabilir ama galiba farkli bir yontem denemek lazim olabilir.");
    expect(r.valid).toBe(false);
    expect(r.reason).toBe("excessive_hedging");
  });
});

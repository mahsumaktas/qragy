const { removeStopWords, TURKISH_STOP_WORDS } = require("../../src/utils/stopWords.js");

describe("stopWords", () => {
  it("removes common Turkish stop words", () => {
    expect(removeStopWords("benim internet param neden yavas")).toBe("internet param yavas");
  });
  it("preserves meaningful words", () => {
    expect(removeStopWords("yazici kurulum hatasi")).toBe("yazici kurulum hatasi");
  });
  it("returns original if all words are stop words", () => {
    expect(removeStopWords("bu bir")).toBe("bu bir");
  });
  it("handles empty/null input", () => {
    expect(removeStopWords("")).toBe("");
    expect(removeStopWords(null)).toBe("");
  });
  it("has reasonable number of stop words", () => {
    expect(TURKISH_STOP_WORDS.size).toBeGreaterThanOrEqual(30);
  });
});

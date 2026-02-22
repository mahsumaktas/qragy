const { fullTextSearch, reciprocalRankFusion, filterByRelevance, getAdaptiveTopK, phraseMatch, RAG_DISTANCE_THRESHOLD } = require("../../src/services/rag.js");

describe("RAG", () => {
  const sampleKB = [
    { question: "Yazici nasil kurulur?", answer: "Ayarlar > Yazicilar > Ekle" },
    { question: "Sifre nasil degistirilir?", answer: "Profil > Guvenlik > Sifre Degistir" },
    { question: "Rapor nasil alinir?", answer: "Raporlar > Yeni Rapor > Olustur" },
    { question: "Baglanti kopuyor ne yapmaliyim?", answer: "Ag ayarlarinizi kontrol edin" },
  ];

  describe("fullTextSearch", () => {
    it("should find exact match with high score", () => {
      const results = fullTextSearch(sampleKB, "Yazici nasil kurulur?", 3);
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].question).toContain("Yazici");
    });
    it("should find word matches", () => {
      const results = fullTextSearch(sampleKB, "rapor almak istiyorum", 3);
      expect(results.length).toBeGreaterThan(0);
    });
    it("should return empty for no match", () => {
      expect(fullTextSearch(sampleKB, "uzay mekigi firlatma", 3).length).toBe(0);
    });
  });
  describe("phraseMatch", () => {
    it("should detect 2+ word phrase", () => { expect(phraseMatch("nasil kurulur", "Yazici nasil kurulur?")).toBe(true); });
    it("should return false for single word", () => { expect(phraseMatch("yazici", "Yazici nasil kurulur?")).toBe(false); });
  });
  describe("filterByRelevance", () => {
    it("should export RAG_DISTANCE_THRESHOLD as 0.8", () => {
      expect(RAG_DISTANCE_THRESHOLD).toBe(0.8);
    });
    it("should keep distance <= threshold", () => {
      expect(filterByRelevance([{ question: "t", _distance: 0.3 }]).length).toBe(1);
      expect(filterByRelevance([{ question: "t", _distance: 0.7 }]).length).toBe(1);
      expect(filterByRelevance([{ question: "t", _distance: 0.8 }]).length).toBe(1);
    });
    it("should filter distance > threshold (0.9)", () => {
      expect(filterByRelevance([{ question: "t", _distance: 0.9 }]).length).toBe(0);
    });
    it("should filter distance > threshold (1.5)", () => {
      expect(filterByRelevance([{ question: "t", _distance: 1.5 }]).length).toBe(0);
    });
  });
  describe("reciprocalRankFusion", () => {
    it("should rank shared results higher", () => {
      const vector = [{ question: "A", answer: "a1" }, { question: "B", answer: "b1" }];
      const text = [{ question: "B", answer: "b1" }, { question: "C", answer: "c1" }];
      const fused = reciprocalRankFusion(vector, text);
      expect(fused[0].question).toBe("B");
    });
  });
  describe("getAdaptiveTopK", () => {
    it("small KB", () => { expect(getAdaptiveTopK(30)).toBe(3); });
    it("medium KB", () => { expect(getAdaptiveTopK(200)).toBe(5); });
    it("large KB", () => { expect(getAdaptiveTopK(600)).toBe(7); });
  });
});

const { createSearchEngine } = require("../../src/services/rag/searchEngine.js");

describe("SearchEngine", () => {
  const sampleKB = [
    { question: "Yazici nasil kurulur?", answer: "Ayarlar > Yazicilar > Ekle yolunu izleyin", source: "docs" },
    { question: "Sifre nasil degistirilir?", answer: "Profil > Guvenlik > Sifre Degistir", source: "faq" },
    { question: "Rapor nasil alinir?", answer: "Raporlar > Yeni Rapor > Olustur butonuna basin", source: "docs" },
    { question: "Baglanti kopuyor ne yapmaliyim?", answer: "Ag ayarlarinizi kontrol edin ve modemi yeniden baslatin", source: "support" },
    { question: "Fatura nasil odenir?", answer: "Odeme sayfasindan kredi karti veya havale ile odeme yapabilirsiniz", source: "billing" },
  ];

  const noopLogger = { warn: () => {}, info: () => {} };

  function buildEngine(overrides = {}) {
    return createSearchEngine({
      embedText: overrides.embedText || null,
      knowledgeTable: overrides.knowledgeTable || null,
      ragDistanceThreshold: overrides.ragDistanceThreshold ?? 0.8,
      logger: overrides.logger || noopLogger,
    });
  }

  describe("hybridSearch", () => {
    it("returns fused results from vector + text", async () => {
      const mockVectorResults = [
        { question: "Yazici nasil kurulur?", answer: "Ayarlar > Yazicilar > Ekle yolunu izleyin", source: "docs", _distance: 0.2 },
        { question: "Sifre nasil degistirilir?", answer: "Profil > Guvenlik > Sifre Degistir", source: "faq", _distance: 0.5 },
      ];

      const engine = buildEngine({
        embedText: async () => [0.1, 0.2, 0.3],
        knowledgeTable: {
          vectorSearch: () => ({
            limit: () => ({
              toArray: async () => mockVectorResults,
            }),
          }),
        },
      });

      const results = await engine.hybridSearch("yazici kurulum", {
        knowledgeBase: sampleKB,
        kbSize: 30,
      });

      expect(results.length).toBeGreaterThan(0);
      // En az bir sonuc "Yazici" icermeli (hem vector hem text bunu buluyor)
      const hasYazici = results.some((r) => r.question.includes("Yazici"));
      expect(hasYazici).toBe(true);
      // Fusion uygulandiysa rrfScore olmali
      expect(results[0]).toHaveProperty("rrfScore");
    });

    it("works with only text results when vector fails", async () => {
      const engine = buildEngine({
        embedText: async () => [0.1, 0.2],
        knowledgeTable: {
          vectorSearch: () => ({
            limit: () => ({
              toArray: async () => { throw new Error("Vector DB unavailable"); },
            }),
          }),
        },
      });

      const results = await engine.hybridSearch("rapor almak", {
        knowledgeBase: sampleKB,
        kbSize: 30,
      });

      expect(results.length).toBeGreaterThan(0);
      const hasRapor = results.some((r) => r.question.includes("Rapor"));
      expect(hasRapor).toBe(true);
      // Text-only sonuc — _textScore olmali, rrfScore olmamali
      expect(results[0]).toHaveProperty("_textScore");
    });

    it("returns empty for irrelevant query", async () => {
      const engine = buildEngine();

      const results = await engine.hybridSearch("uzay mekigi firlatma protokolu", {
        knowledgeBase: sampleKB,
        kbSize: 30,
      });

      expect(results).toEqual([]);
    });
  });

  describe("formatCitations", () => {
    it("formats results correctly", () => {
      const engine = buildEngine();
      const input = [
        { question: "Soru 1?", answer: "Cevap bir cok uzun metin olabilir", source: "docs" },
        { question: "Soru 2?", answer: "Kisa cevap" },
      ];

      const citations = engine.formatCitations(input);

      expect(citations).toHaveLength(2);
      expect(citations[0]).toEqual({
        index: 1,
        title: "Soru 1?",
        source: "docs",
        snippet: "Cevap bir cok uzun metin olabilir",
      });
      expect(citations[1]).toEqual({
        index: 2,
        title: "Soru 2?",
        source: "Bilgi Tabani",
        snippet: "Kisa cevap",
      });
    });
  });

  describe("getAdaptiveTopK", () => {
    it("scales with KB size", () => {
      const engine = buildEngine();
      expect(engine.getAdaptiveTopK(30)).toBe(3);
      expect(engine.getAdaptiveTopK(200)).toBe(5);
      expect(engine.getAdaptiveTopK(600)).toBe(7);
    });
  });

  describe("phraseMatch", () => {
    it("detects bi-gram phrases", () => {
      const engine = buildEngine();
      expect(engine.phraseMatch("nasil kurulur", "Yazici nasil kurulur?")).toBe(true);
      expect(engine.phraseMatch("sifre degistir", "Sifre nasil degistirilir?")).toBe(false);
      expect(engine.phraseMatch("tek", "Yazici nasil kurulur?")).toBe(false);
    });
  });

  describe("fullTextSearch", () => {
    it("scores exact match highest", () => {
      const engine = buildEngine();
      const results = engine.fullTextSearch(sampleKB, "Yazici nasil kurulur?", 5);

      expect(results.length).toBeGreaterThan(0);
      // Exact match en yuksek skoru almali (15 puan)
      expect(results[0].question).toBe("Yazici nasil kurulur?");
      expect(results[0]._textScore).toBeGreaterThanOrEqual(15);
    });
  });
});

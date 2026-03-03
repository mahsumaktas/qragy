"use strict";

const { createSearchEngine } = require("../../src/services/rag/searchEngine");
const { formatCitations } = createSearchEngine({});

describe("formatCitations", () => {
  it("formats results correctly", () => {
    const results = [
      { question: "Yazici nasil kurulur?", answer: "Ayarlar > Yazicilar > Ekle yolunu izleyin.", source: "IT Dokumantasyon" },
      { question: "Sifre nasil degistirilir?", answer: "Profil > Guvenlik > Sifre Degistir adimlarini takip edin.", source: "Guvenlik Rehberi" },
    ];

    const citations = formatCitations(results);

    expect(citations).toHaveLength(2);
    expect(citations[0]).toEqual({
      index: 1,
      title: "Yazici nasil kurulur?",
      source: "IT Dokumantasyon",
      snippet: "Ayarlar > Yazicilar > Ekle yolunu izleyin.",
    });
    expect(citations[1]).toEqual({
      index: 2,
      title: "Sifre nasil degistirilir?",
      source: "Guvenlik Rehberi",
      snippet: "Profil > Guvenlik > Sifre Degistir adimlarini takip edin.",
    });
  });

  it("handles empty results", () => {
    expect(formatCitations([])).toEqual([]);
  });

  it("handles missing source — defaults to 'Knowledge Base'", () => {
    const results = [
      { question: "Rapor nasil alinir?", answer: "Raporlar > Yeni Rapor" },
      { question: "Baglanti sorunu", answer: "Ag ayarlarini kontrol edin", source: "" },
    ];

    const citations = formatCitations(results);

    expect(citations[0].source).toBe("Knowledge Base");
    expect(citations[1].source).toBe("Knowledge Base");
  });

  it("handles multiple different sources", () => {
    const results = [
      { question: "S1", answer: "A1", source: "FAQ" },
      { question: "S2", answer: "A2", source: "Technical Support" },
      { question: "S3", answer: "A3", source: "User Guide" },
    ];

    const citations = formatCitations(results);

    expect(citations).toHaveLength(3);
    expect(citations[0].source).toBe("FAQ");
    expect(citations[1].source).toBe("Technical Support");
    expect(citations[2].source).toBe("User Guide");
    // Index'ler dogru siralanmis olmali
    expect(citations.map(c => c.index)).toEqual([1, 2, 3]);
  });

  it("truncates long answers to 200 characters", () => {
    const longAnswer = "A".repeat(300);
    const results = [{ question: "Q", answer: longAnswer }];

    const citations = formatCitations(results);

    expect(citations[0].snippet).toHaveLength(200);
  });

  it("handles non-array input gracefully", () => {
    expect(formatCitations(null)).toEqual([]);
    expect(formatCitations(undefined)).toEqual([]);
  });
});

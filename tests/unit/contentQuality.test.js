import { describe, expect, it } from "vitest";
import {
  getKnowledgeWarnings,
  getTopicCoverage,
  getTopicMatches,
} from "../../admin-ui/src/lib/contentQuality.js";

describe("contentQuality", () => {
  const topics = [
    {
      id: "printer-issue",
      title: "Yazıcı ve Bilet Yazdırma Sorunu",
      description: "Bilet, fiş ve genel yazdırma sorunları.",
      keywords: ["bilet yazdıramıyorum", "yazıcı çalışmıyor", "çıktı alamıyorum"],
      requiresEscalation: true,
      requiredInfo: ["alpemix_id"],
      canResolveDirectly: true,
    },
    {
      id: "login-issue",
      title: "Giriş Yapamıyorum",
      description: "Login hataları ve ekran açılmama durumu.",
      keywords: ["giriş yapamıyorum", "login olamıyorum", "beyaz ekran"],
      requiresEscalation: true,
      requiredInfo: ["firma_adi"],
      canResolveDirectly: false,
    },
  ];

  it("matches topics using keyword phrases and Turkish normalization", () => {
    const matches = getTopicMatches(
      "Bilet yazdiramiyorum ve printer hata veriyor",
      topics,
      "Yazıcı uygulaması açık ama çıktı alamıyorum."
    );

    expect(matches[0]?.id).toBe("printer-issue");
    expect(matches[0]?.matchScore).toBeGreaterThanOrEqual(10);
    expect(matches[0]?.matchConfidence).toMatch(/high|medium/);
  });

  it("uses answer text as secondary signal when question is short", () => {
    const matches = getTopicMatches(
      "Olmuyor",
      topics,
      "Kullanıcı beyaz ekranda kalıyor ve login ekranı açılmıyor."
    );

    expect(matches[0]?.id).toBe("login-issue");
  });

  it("returns knowledge warnings with matched topics", () => {
    const review = getKnowledgeWarnings(
      "Yazıcı çalışmıyor, bilet yazdıramıyorum",
      "1. Yazıcıyı kontrol edin. 2. Sınama sayfası alın. 3. Sorun sürerse Alpemix paylaşın.",
      topics
    );

    expect(review.matches[0]?.id).toBe("printer-issue");
    expect(review.warnings).not.toContain("noTopicMatch");
  });

  it("computes topic coverage with scored KB entries", () => {
    const coverage = getTopicCoverage(
      topics[0],
      [
        {
          question: "Bilet yazdıramıyorum, yazıcı hata veriyor",
          answer: "1. Yazıcı açık mı kontrol edin. 2. Sınama sayfası deneyin.",
        },
        {
          question: "Login ekranı açılmıyor",
          answer: "Beyaz ekranda kalıyor.",
        },
      ],
      "Yazıcı playbook içeriği oldukça detaylı ve burada uzun bir açıklama yer alır. Sorun türünü ayırır, fiziksel kontrolü anlatır, ardından uzaktan bağlantı gerekirse Alpemix ister."
    );

    expect(coverage.matchedEntries).toHaveLength(1);
    expect(coverage.matchedEntries[0].matchScore).toBeGreaterThan(0);
    expect(coverage.warnings).not.toContain("directWithoutKb");
  });
});

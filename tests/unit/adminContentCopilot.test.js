import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import copilotModule from "../../src/services/adminContentCopilot";

const { createAdminContentCopilot } = copilotModule;

function createFixture(callLLM = null) {
  const topicIndex = {
    topics: [
      {
        id: "printer-issue",
        title: "Yazıcı ve Bilet Yazdırma",
        description: "Bilet çıktısı ve yazıcı sorunları.",
        keywords: ["bilet yazdıramıyorum", "yazıcı çalışmıyor", "çıktı alamıyorum"],
        file: "printer-issue.md",
        requiresEscalation: true,
        requiredInfo: ["alpemix_id"],
        canResolveDirectly: true,
      },
      {
        id: "login-issue",
        title: "Giriş Sorunu",
        description: "Login ve beyaz ekran sorunları.",
        keywords: ["giriş yapamıyorum", "login olamıyorum", "beyaz ekran"],
        file: "login-issue.md",
        requiresEscalation: true,
        requiredInfo: [],
        canResolveDirectly: false,
      },
      {
        id: "login-issue-secondary",
        title: "Oturum Hatası",
        description: "Aynı login sorunları için ikinci konu.",
        keywords: ["login olamıyorum", "oturum açılmıyor"],
        file: "login-issue-secondary.md",
        requiresEscalation: false,
        requiredInfo: [],
        canResolveDirectly: false,
      },
    ],
  };

  const textFiles = {
    [path.join("/agent", "bootstrap.md")]: "İlk mesajda direkt escalation yap.",
    [path.join("/agent", "response-policy.md")]: "Kod toplandıktan sonra direkt aktar.",
    [path.join("/agent", "escalation-matrix.md")]: "Yönlendirme öncesi onay alın.",
    [path.join("/agent", "soul.md")]: "OBUS teknik destek asistanı.",
    [path.join("/agent", "domain.md")]: "OBUS operasyon süreçleri.",
    [path.join("/agent", "persona.md")]: "Kısa, resmi ve çözüm odaklı cevap ver.",
    [path.join("/agent", "skills.md")]: "Sorun giderme, bilgilendirme.",
    [path.join("/agent", "hard-bans.md")]: "Kullanıcı şifresi isteme.",
    [path.join("/agent", "output-filter.md")]: "Markdown başlık kullanma.",
    [path.join("/agent", "definition-of-done.md")]: "Kullanıcı ne yapacağını bilmeli.",
    [path.join("/topics", "printer-issue.md")]: "1. Yazıcı durumunu kontrol et.\n2. Test çıktısı al.\n3. Sorun sürerse Alpemix iste.",
    [path.join("/topics", "login-issue.md")]: "Login ekranı açılmıyorsa tarayıcı önbelleğini temizlet. Gerekirse şube kodunu sor.",
    [path.join("/topics", "login-issue-secondary.md")]: "Kısa.",
  };

  const jsonFiles = {
    [path.join("/topics", "_index.json")]: topicIndex,
    [path.join("/memory", "ticket-template.json")]: {
      confirmationTemplate: "Your request is ready.",
    },
    [path.join("/memory", "conversation-schema.json")]: {
      validStates: ["welcome_or_greet", "topic_detection"],
      sessionFields: { conversationState: "welcome" },
    },
  };

  return createAdminContentCopilot({
    fs: {},
    path,
    AGENT_DIR: "/agent",
    TOPICS_DIR: "/topics",
    MEMORY_DIR: "/memory",
    loadCSVData: () => [
      {
        question: "Bilet yazdiramiyorum, yazici hata veriyor",
        answer: "Yazıcı açık mı bak.",
        source: "admin-manual",
      },
      {
        question: "Login olamiyorum",
        answer: "Beyaz ekranda kalıyor.",
        source: "admin-manual",
      },
    ],
    readJsonFileSafe: (filePath, fallback) => jsonFiles[filePath] ?? fallback,
    readTextFileSafe: (filePath, fallback) => textFiles[filePath] ?? fallback,
    callLLM,
    getProviderConfig: () => ({ provider: "test" }),
    logger: { warn: vi.fn() },
  });
}

describe("adminContentCopilot", () => {
  it("reviews knowledge base entries with structured targets", () => {
    const copilot = createFixture();
    const review = copilot.reviewKnowledgeBase();

    expect(review.surface).toBe("knowledge");
    expect(review.summary.totalRecords).toBe(2);
    expect(review.targets[0].meta.matches[0].id).toBe("printer-issue");
    expect(review.targets[0].warningCodes).toContain("answerShort");
  });

  it("reviews topics and detects overlap/missing info", () => {
    const copilot = createFixture();
    const review = copilot.reviewTopics({ selection: { id: "login-issue" } });

    expect(review.targets).toHaveLength(1);
    expect(review.targets[0].warningCodes).toContain("missingRequiredInfo");
    expect(review.targets[0].warningCodes).toContain("keywordOverlap");
  });

  it("reviews bot settings with file-level findings", () => {
    const copilot = createFixture();
    const review = copilot.reviewBotSettings({ selection: { filename: "bootstrap.md" } });

    expect(review.targets).toHaveLength(1);
    expect(review.targets[0].findings[0].messageKey).toBe("botSettings.warning.earlyEscalation");
  });

  it("builds KB draft and retries after invalid JSON once", async () => {
    const callLLM = vi.fn()
      .mockResolvedValueOnce({ reply: "not-json" })
      .mockResolvedValueOnce({
        reply: JSON.stringify({
          question: "**Bilet yazdıramıyorum**, yazıcı hata veriyor",
          answer: "1. **Yazıcının** açık olduğunu kontrol edin.\n2. Test çıktısı alın.\n3. Sorun sürerse `Alpemix ID` paylaşın.",
          rationale: ["Soru varyasyonları netleştirildi.", "Cevap görünür adımlara bölündü."],
          confidence: "high",
        }),
      });

    const copilot = createFixture(callLLM);
    const draft = await copilot.buildKbDraft({
      target: { id: 1 },
      goal: "Cevabı daha net ve adımlı yap",
      locale: "tr",
    });

    expect(callLLM).toHaveBeenCalledTimes(2);
    expect(draft.after.question).not.toContain("**");
    expect(draft.after.answer).toContain("1.");
    expect(draft.after.answer).not.toContain("**");
    expect(draft.after.answer).not.toContain("`");
    expect(draft.applyPayload.auditContext.source).toBe("copilot");
  });
});

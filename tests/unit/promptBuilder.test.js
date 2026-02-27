const { createPromptBuilder } = require("../../src/services/promptBuilder.js");
const { estimateTokens, TOKEN_BUDGETS } = require("../../src/services/memory.js");

/**
 * Minimal mock deps for createPromptBuilder factory.
 */
function makeMockDeps(overrides = {}) {
  return {
    getAgentTexts: () => ({
      SOUL_TEXT: "Sen bir destek botusun.",
      PERSONA_TEXT: "Kibarca yanit ver.",
      BOOTSTRAP_TEXT: "Bootstrap metin.",
      DOMAIN_TEXT: "Domain metin.",
      SKILLS_TEXT: "Skills metin.",
      HARD_BANS_TEXT: "Hard bans.",
      ESCALATION_MATRIX_TEXT: "Escalation matrix.",
      RESPONSE_POLICY_TEXT: "Response policy.",
      DOD_TEXT: "DoD.",
      OUTPUT_FILTER_TEXT: "Output filter.",
    }),
    getTopicIndexSummary: () => "konu1 - Genel Destek",
    loadTopicFile: () => null,
    getTopicMeta: () => null,
    getMemoryTemplate: () => ({ conversationState: "welcome_or_greet" }),
    ...overrides,
  };
}

const DEFAULT_MEMORY = { conversationState: "welcome_or_greet" };
const DEFAULT_CONTEXT = { conversationState: "active", turnCount: 3 };

describe("promptBuilder", () => {
  let builder;

  beforeEach(() => {
    builder = createPromptBuilder(makeMockDeps());
  });

  describe("basic functionality", () => {
    it("returns a non-empty string", () => {
      const prompt = builder.buildSystemPrompt(DEFAULT_MEMORY, DEFAULT_CONTEXT, []);
      expect(typeof prompt).toBe("string");
      expect(prompt.length).toBeGreaterThan(0);
    });

    it("includes soul and persona text", () => {
      const prompt = builder.buildSystemPrompt(DEFAULT_MEMORY, DEFAULT_CONTEXT, []);
      expect(prompt).toContain("Sen bir destek botusun.");
      expect(prompt).toContain("Kibarca yanit ver.");
    });

    it("includes RAG results when provided", () => {
      const knowledge = [{ question: "Soru1", answer: "Cevap1" }];
      const prompt = builder.buildSystemPrompt(DEFAULT_MEMORY, DEFAULT_CONTEXT, knowledge);
      expect(prompt).toContain("Soru1");
      expect(prompt).toContain("Cevap1");
    });

    it("includes userMemory when provided (backward compat)", () => {
      const prompt = builder.buildSystemPrompt(DEFAULT_MEMORY, DEFAULT_CONTEXT, [], {
        userMemory: { isim: "Ahmet", sube: "IST-01" },
      });
      expect(prompt).toContain("isim: Ahmet");
      expect(prompt).toContain("sube: IST-01");
    });
  });

  describe("token budget enforcement", () => {
    it("trims RAG context to budget", () => {
      // 50 buyuk knowledge result olustur — budget'i asacak kadar
      const bigResults = Array.from({ length: 50 }, (_, i) => ({
        question: `Soru ${i}: ${"Bu cok uzun bir soru metnidir ".repeat(10)}`,
        answer: `Cevap ${i}: ${"Bu cok uzun bir cevap metnidir ".repeat(10)}`,
      }));

      const prompt = builder.buildSystemPrompt(DEFAULT_MEMORY, DEFAULT_CONTEXT, bigResults);

      // RAG bolumunu prompt icerisinden cikart
      const ragStart = prompt.indexOf("## Bilgi Taban");
      expect(ragStart).toBeGreaterThan(-1);

      // RAG section'dan sonraki part boundary'yi bul
      // parts.join("\n\n") kullanildigi icin RAG section'dan sonraki "\n\n" sinirimiz
      const afterRag = prompt.indexOf("\n\n", ragStart);
      const ragSection = afterRag > -1
        ? prompt.slice(ragStart, afterRag)
        : prompt.slice(ragStart);

      const ragTokens = estimateTokens(ragSection);
      expect(ragTokens).toBeLessThanOrEqual(TOKEN_BUDGETS.ragContext);
    });

    it("includes core memory section when provided", () => {
      const coreText = "--- CORE MEMORY ---\nKullanici: Mehmet, Sube: ANK-03";
      const prompt = builder.buildSystemPrompt(DEFAULT_MEMORY, DEFAULT_CONTEXT, [], {
        coreMemoryText: coreText,
      });
      expect(prompt).toContain(coreText);
    });

    it("includes recall memory section when provided", () => {
      const recallText = "--- RECALL MEMORY ---\nOnceki konusmada yazici sorunu vardi.";
      const prompt = builder.buildSystemPrompt(DEFAULT_MEMORY, DEFAULT_CONTEXT, [], {
        recallMemoryText: recallText,
      });
      expect(prompt).toContain(recallText);
    });

    it("includes reflexion warnings when provided", () => {
      const warningText = "UYARI: Kullanici daha once yanlis bilgi almisti, dikkatli ol.";
      const prompt = builder.buildSystemPrompt(DEFAULT_MEMORY, DEFAULT_CONTEXT, [], {
        reflexionWarnings: warningText,
      });
      expect(prompt).toContain(warningText);
    });

    it("includes graph context when provided", () => {
      const graphText = "--- GRAPH ---\nKullanici -> Sube(IST-01) -> Bolge(Marmara)";
      const prompt = builder.buildSystemPrompt(DEFAULT_MEMORY, DEFAULT_CONTEXT, [], {
        graphContext: graphText,
      });
      expect(prompt).toContain(graphText);
    });
  });

  describe("quality + loop + turn limit warnings", () => {
    it("includes quality warning when option provided", () => {
      const prompt = builder.buildSystemPrompt(DEFAULT_MEMORY, DEFAULT_CONTEXT, [], {
        qualityWarning: "## UYARI: SON CEVABIN KALITESI DUSUK",
      });
      expect(prompt).toContain("KALITESI DUSUK");
    });

    it("includes loop warning", () => {
      const ctx = { ...DEFAULT_CONTEXT, loopDetected: true, loopRepeatCount: 3 };
      const prompt = builder.buildSystemPrompt(DEFAULT_MEMORY, ctx, [], {});
      expect(prompt).toContain("KONUSMA DONGUSU TESPIT EDILDI");
    });

    it("includes turn limit warning", () => {
      const ctx = { ...DEFAULT_CONTEXT, turnLimitReached: true, turnCount: 8 };
      const prompt = builder.buildSystemPrompt(DEFAULT_MEMORY, ctx, [], {});
      expect(prompt).toContain("KONUSMA UZUN SUREDIR DEVAM EDIYOR");
    });

    it("does NOT include turn limit warning when escalation already triggered", () => {
      const ctx = { ...DEFAULT_CONTEXT, turnLimitReached: true, turnCount: 8, escalationTriggered: true, escalationReason: "test" };
      const prompt = builder.buildSystemPrompt(DEFAULT_MEMORY, ctx, [], {});
      expect(prompt).not.toContain("KONUSMA UZUN SUREDIR DEVAM EDIYOR");
    });
  });
});

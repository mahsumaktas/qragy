const { buildPrompt, trimParts } = require("../../src/prompt/builder.js");
const { estimateTokens } = require("../../src/services/memory.js");

describe("Prompt Builder", () => {
  describe("trimParts", () => {
    it("should keep all parts when under budget", () => {
      const parts = [
        { name: "soul", content: "short", priority: 1 },
        { name: "persona", content: "short", priority: 1 },
      ];
      const result = trimParts(parts, 15000);
      expect(result.every((p) => p.trimmed === false)).toBe(true);
    });
    it("should trim priority 3 first", () => {
      const parts = [
        { name: "soul", content: "a".repeat(4000), priority: 1 },
        { name: "domain", content: "b".repeat(4000), priority: 3 },
        { name: "policy", content: "c".repeat(4000), priority: 2 },
      ];
      const result = trimParts(parts, 2500);
      const soul = result.find((p) => p.name === "soul");
      const domain = result.find((p) => p.name === "domain");
      expect(soul.content.length).toBe(4000); // priority 1 untouched
      expect(domain.content.length).toBeLessThan(4000); // priority 3 trimmed
    });
    it("should never trim priority 1", () => {
      const parts = [
        { name: "soul", content: "a".repeat(2000), priority: 1 },
        { name: "memory", content: "b".repeat(2000), priority: 1 },
      ];
      const result = trimParts(parts, 500);
      expect(result[0].content.length).toBe(2000);
      expect(result[1].content.length).toBe(2000);
    });
  });
  describe("buildPrompt", () => {
    it("should include soul and persona", () => {
      const result = buildPrompt({ soul: "Bot kimlik", persona: "Konusma tarzi" });
      expect(result).toContain("Bot kimlik");
      expect(result).toContain("Konusma tarzi");
    });
    it("should include RAG results", () => {
      const result = buildPrompt({ soul: "t", persona: "t", ragResults: [{ question: "Nasil?", answer: "Boyle." }] });
      expect(result).toContain("Nasil?");
      expect(result).toContain("Boyle.");
    });
    it("should skip empty parts", () => {
      const result = buildPrompt({ soul: "test", persona: "test", domain: "", skills: null });
      expect(result).not.toContain("undefined");
      expect(result).not.toContain("null");
    });
    it("should exclude domain/skills on first turn", () => {
      const result = buildPrompt({ soul: "t", persona: "t", domain: "DOMAIN", skills: "SKILLS", turnCount: 0 });
      expect(result).not.toContain("DOMAIN");
      expect(result).not.toContain("SKILLS");
    });
    it("should include domain/skills after first turn", () => {
      const result = buildPrompt({ soul: "t", persona: "t", domain: "DOMAIN", skills: "SKILLS", turnCount: 2 });
      expect(result).toContain("DOMAIN");
      expect(result).toContain("SKILLS");
    });
  });
});

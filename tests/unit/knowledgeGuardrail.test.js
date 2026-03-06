import { describe, expect, it } from "vitest";

const {
  MIN_TEXT_MATCH_SCORE,
  isStrongTextMatchScore,
  scoreKnowledgeTextMatch,
  shouldEscalateForKnowledgeGap,
} = require("../../src/utils/knowledgeGuardrail.js");

describe("knowledgeGuardrail", () => {
  it("accepts strong KB text matches and rejects weak overlaps", () => {
    const strongScore = scoreKnowledgeTextMatch(
      "yazici kurulumu",
      "Yazici kurulumu nasil yapilir?",
      "Ayarlar menusu uzerinden surucuyu yukleyin."
    );
    const weakScore = scoreKnowledgeTextMatch(
      "destek",
      "Yazici kurulumu nasil yapilir?",
      "Ayarlar menusu uzerinden surucuyu yukleyin."
    );

    expect(strongScore).toBeGreaterThanOrEqual(MIN_TEXT_MATCH_SCORE);
    expect(isStrongTextMatchScore(strongScore)).toBe(true);
    expect(isStrongTextMatchScore(weakScore)).toBe(false);
  });

  it("treats short but issue-like messages as escalation candidates", () => {
    expect(shouldEscalateForKnowledgeGap("404", {})).toBe(true);
    expect(shouldEscalateForKnowledgeGap("login", {})).toBe(true);
    expect(shouldEscalateForKnowledgeGap("test", {})).toBe(false);
  });
});

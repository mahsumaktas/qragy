const HALLUCINATION_MARKERS = [
  "ben bir yapay zeka", "ben bir ai", "ben bir dil modeli",
  "yapay zeka olarak", "dil modeli olarak",
  "google gemini", "gpt-4", "gpt-3", "claude",
  "as an ai", "i am an ai", "i'm a language model",
  "as a language model", "i don't have access",
  "my training data", "my knowledge cutoff",
  "i was trained", "openai", "chatgpt",
  "i cannot", "i'm sorry but",
];

const HEDGING_MARKERS = ["i think", "maybe", "perhaps", "i guess", "not sure", "i'm not certain", "possibly", "it might be"];

const ENGLISH_INDICATORS = /\b(the|and|with|for|how|what|this|that|which|like|have|can|you|your|please|thank|help|support|transfer|check|information|hello|goodbye|issue|account|password)\b/i;

function validateBotResponse(reply, expectedLang = "en") {
  if (!reply || typeof reply !== "string") return { valid: false, reason: "empty" };
  const trimmed = reply.trim();
  if (trimmed.length < 10) return { valid: false, reason: "too_short" };

  // Sentence repetition (2+)
  const sentences = trimmed.split(/[.!?]+/).map((s) => s.trim().toLowerCase()).filter((s) => s.length > 5);
  if (sentences.length >= 2) {
    const counts = {};
    for (const s of sentences) {
      counts[s] = (counts[s] || 0) + 1;
      if (counts[s] >= 2) return { valid: false, reason: "repetitive" };
    }
  }

  // Word repetition (5+)
  const words = trimmed.toLowerCase().split(/\s+/);
  const wordCounts = {};
  for (const w of words) {
    if (w.length < 3) continue;
    wordCounts[w] = (wordCounts[w] || 0) + 1;
    if (wordCounts[w] >= 10) return { valid: false, reason: "word_repetition" };
  }

  // Hallucination markers
  const lower = trimmed.toLowerCase();
  for (const marker of HALLUCINATION_MARKERS) {
    if (lower.includes(marker)) return { valid: false, reason: "hallucination_marker" };
  }

  // Hedging markers — 2+ in same response = flag
  let hedgingCount = 0;
  for (const marker of HEDGING_MARKERS) {
    if (lower.includes(marker)) hedgingCount++;
    if (hedgingCount >= 2) return { valid: false, reason: "excessive_hedging" };
  }

  // Language check
  if (expectedLang === "en" && trimmed.length > 50) {
    if (!ENGLISH_INDICATORS.test(trimmed)) return { valid: false, reason: "language_mismatch" };
  }

  return { valid: true };
}

module.exports = { validateBotResponse, HALLUCINATION_MARKERS, HEDGING_MARKERS, ENGLISH_INDICATORS };

const HALLUCINATION_MARKERS = [
  "ben bir yapay zeka", "ben bir ai", "ben bir dil modeli",
  "as an ai", "i am an ai", "i'm a language model",
  "as a language model", "i don't have access",
  "my training data", "my knowledge cutoff",
  "i was trained", "openai", "chatgpt",
  "i cannot", "i'm sorry but",
];

const TURKISH_INDICATORS = /[çğıöşüÇĞİÖŞÜ]|(\b(bir|ve|ile|icin|nasil|ne|bu|su|olan|gibi|var|yok)\b)/i;

function validateBotResponse(reply, expectedLang = "tr") {
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
    if (wordCounts[w] >= 5) return { valid: false, reason: "word_repetition" };
  }

  // Hallucination markers
  const lower = trimmed.toLowerCase();
  for (const marker of HALLUCINATION_MARKERS) {
    if (lower.includes(marker)) return { valid: false, reason: "hallucination_marker" };
  }

  // Language check
  if (expectedLang === "tr" && trimmed.length > 50) {
    if (!TURKISH_INDICATORS.test(trimmed)) return { valid: false, reason: "language_mismatch" };
  }

  return { valid: true };
}

module.exports = { validateBotResponse, HALLUCINATION_MARKERS };

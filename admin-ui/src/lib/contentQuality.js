const DIACRITICS = {
  "ç": "c",
  "ğ": "g",
  "ı": "i",
  "ö": "o",
  "ş": "s",
  "ü": "u",
  "Ç": "c",
  "Ğ": "g",
  "İ": "i",
  "Ö": "o",
  "Ş": "s",
  "Ü": "u",
};

export function normalizeForMatching(text) {
  if (!text || typeof text !== "string") return "";
  return text
    .replace(/[çğıöşüÇĞİÖŞÜ]/g, (char) => DIACRITICS[char] || char)
    .toLowerCase()
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function generateSlug(text) {
  return normalizeForMatching(text)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function getTopicMatches(text, topics = []) {
  const normalized = normalizeForMatching(text);
  if (!normalized) return [];

  const matches = [];
  for (const topic of topics) {
    const hit = (topic.keywords || []).some((keyword) => {
      const normalizedKeyword = normalizeForMatching(keyword);
      return normalizedKeyword && normalized.includes(normalizedKeyword);
    });
    if (hit) matches.push(topic);
  }
  return matches;
}

export function getKnowledgeWarnings(question, answer, topics = []) {
  const warnings = [];
  const matches = getTopicMatches(question, topics);
  const trimmedQuestion = String(question || "").trim();
  const trimmedAnswer = String(answer || "").trim();

  if (trimmedQuestion.length < 24) warnings.push("questionShort");
  if (!trimmedQuestion.includes(",") && !trimmedQuestion.includes("?")) warnings.push("questionNeedsVariants");
  if (trimmedAnswer.length < 120) warnings.push("answerShort");
  if (trimmedAnswer.length > 200 && !/(^|\n)\s*(\d+\.|-|\*)\s+/.test(trimmedAnswer)) warnings.push("answerNeedsStructure");
  if (!matches.length) warnings.push("noTopicMatch");

  return { matches, warnings };
}

export function getTopicCoverage(topic, knowledgeItems = [], content = "") {
  const matchedEntries = knowledgeItems.filter((item) => {
    const normalizedQuestion = normalizeForMatching(item.question);
    return (topic.keywords || []).some((keyword) => {
      const normalizedKeyword = normalizeForMatching(keyword);
      return normalizedKeyword && normalizedQuestion.includes(normalizedKeyword);
    });
  });

  const warnings = [];
  if (!topic.id) warnings.push("missingId");
  if ((topic.keywords || []).length < 5) warnings.push("fewKeywords");
  if ((topic.requiredInfo || []).length === 0 && topic.requiresEscalation) warnings.push("missingRequiredInfo");
  if (String(content || "").trim().length < 260) warnings.push("playbookShort");
  if (topic.canResolveDirectly && matchedEntries.length === 0) warnings.push("directWithoutKb");

  return { matchedEntries, warnings };
}

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

const STOPWORDS = new Set([
  "acaba", "ait", "ama", "ancak", "artık", "aslında", "aynı", "bana", "bazı", "belki",
  "beni", "benim", "bile", "bir", "biraz", "biri", "birkaç", "birşey", "biz", "bize",
  "bizi", "böyle", "bu", "burada", "çok", "çünkü", "da", "daha", "de", "defa", "değil",
  "diye", "dolayı", "en", "gibi", "göre", "hala", "hangi", "hatta", "hem", "hep",
  "hepsi", "her", "hiç", "için", "içinde", "ile", "ise", "işte", "kadar", "kendi",
  "kez", "ki", "kim", "mı", "mi", "mu", "mü", "nasıl", "ne", "neden", "nerede", "nereye",
  "olan", "olarak", "oldu", "olduğu", "olur", "onu", "orada", "oysa", "şey", "siz",
  "size", "sizi", "sonra", "şu", "şuna", "tabi", "tam", "tüm", "ve", "veya", "ya",
  "yani", "yerine", "yine", "yok", "zaten", "the", "and", "for", "with", "from",
  "that", "this", "your", "have", "can't", "cant",
]);

export function normalizeForMatching(text) {
  if (!text || typeof text !== "string") return "";
  return text
    .replace(/[çğıöşüÇĞİÖŞÜ]/g, (char) => DIACRITICS[char] || char)
    .toLowerCase()
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function tokenizeForMatching(text) {
  return Array.from(new Set(
    normalizeForMatching(text)
      .split(/[^a-z0-9]+/g)
      .map((token) => token.trim())
      .filter((token) => token.length >= 2 && !STOPWORDS.has(token))
  ));
}

export function generateSlug(text) {
  return normalizeForMatching(text)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function getTokenCoverage(haystackTokens, needleTokens) {
  if (!haystackTokens.length || !needleTokens.length) return 0;
  const haystack = new Set(haystackTokens);
  let hits = 0;
  for (const token of needleTokens) {
    if (haystack.has(token)) hits += 1;
  }
  return hits / needleTokens.length;
}

function getConfidence(score) {
  if (score >= 16) return "high";
  if (score >= 10) return "medium";
  return "low";
}

function roundScore(value) {
  return Math.round(value * 10) / 10;
}

function scoreTopicMatch(question, answer, topic) {
  const normalizedQuestion = normalizeForMatching(question);
  const normalizedAnswer = normalizeForMatching(answer);
  const combined = [normalizedQuestion, normalizedAnswer].filter(Boolean).join(" ").trim();
  if (!combined) return null;

  const questionTokens = tokenizeForMatching(question);
  const answerTokens = tokenizeForMatching(answer);
  const combinedTokens = Array.from(new Set([...questionTokens, ...answerTokens]));
  const titleTokens = tokenizeForMatching(topic.title || "");
  const descriptionTokens = tokenizeForMatching(topic.description || "");
  const keywordTokens = Array.from(new Set((topic.keywords || []).flatMap((keyword) => tokenizeForMatching(keyword))));
  const topicVocabulary = Array.from(new Set([...titleTokens, ...descriptionTokens, ...keywordTokens]));

  let score = 0;
  const keywordHits = [];
  const signals = [];

  for (const keyword of topic.keywords || []) {
    const normalizedKeyword = normalizeForMatching(keyword);
    const tokens = tokenizeForMatching(keyword);
    if (!normalizedKeyword || !tokens.length) continue;

    if (combined.includes(normalizedKeyword)) {
      keywordHits.push(keyword);
      score += 8 + Math.min(tokens.length * 1.5, 6);
      continue;
    }

    const questionCoverage = getTokenCoverage(questionTokens, tokens);
    const answerCoverage = getTokenCoverage(answerTokens, tokens);
    const bestCoverage = Math.max(questionCoverage, answerCoverage * 0.75);
    if (bestCoverage >= 0.75 && tokens.length >= 2) {
      score += 3 + (bestCoverage * 3);
    }
  }

  if (keywordHits.length) signals.push("keyword");

  const normalizedTitle = normalizeForMatching(topic.title || "");
  if (normalizedTitle && combined.includes(normalizedTitle)) {
    score += 6;
    signals.push("title");
  }

  const titleCoverage = getTokenCoverage(combinedTokens, titleTokens);
  if (titleCoverage >= 0.5 && titleTokens.length) {
    score += 4 + (titleCoverage * 4);
    signals.push("title_tokens");
  }

  const descriptionCoverage = getTokenCoverage(combinedTokens, descriptionTokens);
  if (descriptionCoverage >= 0.4 && descriptionTokens.length >= 2) {
    score += 2 + (descriptionCoverage * 3);
    signals.push("description");
  }

  const vocabularyCoverage = getTokenCoverage(combinedTokens, topicVocabulary);
  if (vocabularyCoverage >= 0.3 && topicVocabulary.length) {
    score += vocabularyCoverage * 5;
    signals.push("shared_terms");
  }

  if (answerTokens.length) {
    const answerCoverage = getTokenCoverage(answerTokens, topicVocabulary);
    if (answerCoverage >= 0.35) {
      score += answerCoverage * 2;
      signals.push("answer_support");
    }
  }

  if (score < 6) return null;

  return {
    ...topic,
    matchScore: roundScore(score),
    matchConfidence: getConfidence(score),
    matchSignals: Array.from(new Set(signals)),
    matchedKeywords: keywordHits,
  };
}

export function getTopicMatches(question, topics = [], answer = "") {
  if (!question && !answer) return [];

  return topics
    .map((topic) => scoreTopicMatch(question, answer, topic))
    .filter(Boolean)
    .sort((left, right) => right.matchScore - left.matchScore);
}

export function getKnowledgeWarnings(question, answer, topics = []) {
  const warnings = [];
  const matches = getTopicMatches(question, topics, answer);
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
  const matchedEntries = knowledgeItems
    .map((item) => {
      const match = getTopicMatches(item.question, [topic], item.answer)[0];
      if (!match) return null;
      return {
        ...item,
        matchScore: match.matchScore,
        matchConfidence: match.matchConfidence,
      };
    })
    .filter(Boolean)
    .sort((left, right) => right.matchScore - left.matchScore);

  const warnings = [];
  if (!topic.id) warnings.push("missingId");
  if ((topic.keywords || []).length < 5) warnings.push("fewKeywords");
  if ((topic.requiredInfo || []).length === 0 && topic.requiresEscalation) warnings.push("missingRequiredInfo");
  if (String(content || "").trim().length < 260) warnings.push("playbookShort");
  if (topic.canResolveDirectly && matchedEntries.length === 0) warnings.push("directWithoutKb");

  return { matchedEntries, warnings };
}

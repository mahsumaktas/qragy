"use strict";

const VALID_AGENT_FILES = [
  "soul.md",
  "domain.md",
  "persona.md",
  "skills.md",
  "hard-bans.md",
  "escalation-matrix.md",
  "output-filter.md",
  "response-policy.md",
  "bootstrap.md",
  "definition-of-done.md",
];

const VALID_MEMORY_FILES = [
  "ticket-template.json",
  "conversation-schema.json",
];

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

function normalizeForMatching(text) {
  if (!text || typeof text !== "string") return "";
  return text
    .replace(/[çğıöşüÇĞİÖŞÜ]/g, (char) => DIACRITICS[char] || char)
    .toLowerCase()
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenizeForMatching(text) {
  return Array.from(new Set(
    normalizeForMatching(text)
      .split(/[^a-z0-9]+/g)
      .map((token) => token.trim())
      .filter((token) => token.length >= 2 && !STOPWORDS.has(token))
  ));
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

function roundScore(value) {
  return Math.round(value * 10) / 10;
}

function getMatchConfidence(score) {
  if (score >= 16) return "high";
  if (score >= 10) return "medium";
  return "low";
}

function getSeverityForKbWarning(code) {
  if (code === "noTopicMatch") return "high";
  if (code === "answerShort" || code === "answerNeedsStructure") return "medium";
  return "low";
}

function getSeverityForTopicWarning(code) {
  if (code === "directWithoutKb" || code === "missingRequiredInfo") return "high";
  if (code === "keywordOverlap" || code === "playbookShort") return "medium";
  return "low";
}

function getSeverityForBotWarning(messageKey) {
  if (messageKey === "botSettings.warning.escalationFlowConflict") return "high";
  if (messageKey === "botSettings.warning.earlyEscalation") return "medium";
  return "low";
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
    matchConfidence: getMatchConfidence(score),
    matchSignals: Array.from(new Set(signals)),
    matchedKeywords: keywordHits,
  };
}

function getTopicMatches(question, topics = [], answer = "") {
  if (!question && !answer) return [];
  return topics
    .map((topic) => scoreTopicMatch(question, answer, topic))
    .filter(Boolean)
    .sort((left, right) => right.matchScore - left.matchScore);
}

function getKnowledgeWarnings(question, answer, topics = []) {
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

function getKeywordOverlap(topic, allTopics) {
  const normalizedKeywords = new Set((topic.keywords || []).map((keyword) => normalizeForMatching(keyword)).filter(Boolean));
  const overlaps = [];

  for (const other of allTopics || []) {
    if (!other || other.id === topic.id) continue;
    const sharedKeywords = (other.keywords || [])
      .filter((keyword) => normalizedKeywords.has(normalizeForMatching(keyword)));
    if (sharedKeywords.length) {
      overlaps.push({
        id: other.id,
        title: other.title || other.id,
        keywords: sharedKeywords,
      });
    }
  }

  return overlaps;
}

function getTopicCoverage(topic, knowledgeItems = [], content = "", allTopics = []) {
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

  const overlapTopics = getKeywordOverlap(topic, allTopics);
  if (overlapTopics.length) warnings.push("keywordOverlap");

  return { matchedEntries, warnings, overlapTopics };
}

function containsAny(text, patterns) {
  return patterns.some((pattern) => pattern.test(text || ""));
}

function addBotWarning(collection, filename, key, params = {}) {
  collection.push({ filename, key, params });
}

function getBotSettingsQualityReport(files = {}, memoryFiles = {}) {
  const warnings = [];
  for (const filename of VALID_AGENT_FILES) {
    if (!(files[filename] || "").trim()) {
      addBotWarning(warnings, filename, "botSettings.warning.missingContent");
    }
  }

  const bootstrapText = files["bootstrap.md"] || "";
  const responsePolicyText = files["response-policy.md"] || "";
  const escalationMatrixText = files["escalation-matrix.md"] || "";

  const earlyEscalationPatterns = [
    /erken escalation/i,
    /ilk mesaj/i,
    /direkt info_collection/i,
    /direkt .*escalation/i,
    /troubleshooting vermenin anlami yok/i,
    /immediate escalation/i,
    /first turn .*transfer/i,
  ];

  if (containsAny(bootstrapText, earlyEscalationPatterns)) {
    addBotWarning(warnings, "bootstrap.md", "botSettings.warning.earlyEscalation");
  }
  if (containsAny(responsePolicyText, earlyEscalationPatterns)) {
    addBotWarning(warnings, "response-policy.md", "botSettings.warning.earlyEscalation");
  }

  if (/onay|confirmation/i.test(escalationMatrixText) && /direkt aktar|direct transfer/i.test(responsePolicyText)) {
    addBotWarning(warnings, "response-policy.md", "botSettings.warning.escalationFlowConflict");
    addBotWarning(warnings, "escalation-matrix.md", "botSettings.warning.escalationFlowConflict");
  }

  const ticketTemplate = memoryFiles["ticket-template.json"] || {};
  const memoryTemplateText = JSON.stringify(ticketTemplate).toLowerCase();
  if (/(your request|account id|issue:|support team|live support)/.test(memoryTemplateText)) {
    addBotWarning(warnings, "ticket-template.json", "botSettings.warning.memoryLanguage");
  }

  const conversationSchema = memoryFiles["conversation-schema.json"] || {};
  const initialState = conversationSchema.sessionFields?.conversationState;
  const validStates = Array.isArray(conversationSchema.validStates) ? conversationSchema.validStates : [];
  if (initialState && !validStates.includes(initialState)) {
    addBotWarning(warnings, "conversation-schema.json", "botSettings.warning.invalidInitialState", { state: initialState });
  }
  if (initialState === "welcome") {
    addBotWarning(warnings, "conversation-schema.json", "botSettings.warning.legacyInitialState");
  }

  const warningsByFile = warnings.reduce((acc, warning) => {
    acc[warning.filename] ||= [];
    acc[warning.filename].push(warning);
    return acc;
  }, {});

  return {
    warnings,
    warningsByFile,
    warningCount: warnings.length,
  };
}

function surfaceFromPanel(panel) {
  if (panel === "knowledge-base") return "knowledge";
  if (panel === "topics") return "topics";
  if (panel === "bot-settings") return "bot-settings";
  return null;
}

function flattenReviewTargets(review, limit = 8) {
  return (review.targets || [])
    .flatMap((target) => (target.findings || []).map((finding) => ({
      ...finding,
      targetId: target.id,
      targetLabel: target.label,
    })))
    .slice(0, limit);
}

function uniqueByKey(items, keyFn) {
  const seen = new Set();
  const result = [];
  for (const item of items) {
    const key = keyFn(item);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}

function parseLooseJson(rawText) {
  if (!rawText || typeof rawText !== "string") return null;

  const fencedMatch = rawText.match(/```json\s*([\s\S]*?)```/i);
  if (fencedMatch) {
    try {
      return JSON.parse(fencedMatch[1].trim());
    } catch (_error) {
      return null;
    }
  }

  const objectMatch = rawText.match(/\{[\s\S]*\}$/);
  if (objectMatch) {
    try {
      return JSON.parse(objectMatch[0]);
    } catch (_error) {
      return null;
    }
  }

  try {
    return JSON.parse(rawText);
  } catch (_error) {
    return null;
  }
}

function normalizeConfidence(value) {
  if (value === "high" || value === "medium" || value === "low") return value;
  return "medium";
}

function stringifyMaybeJson(value, fallback = "{}") {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value ?? {}, null, 2);
  } catch (_error) {
    return fallback;
  }
}

function sanitizePlainDraftText(text) {
  return String(text || "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^\s*#{1,6}\s+/gm, "")
    .replace(/^\s*[-*]\s+/gm, "- ")
    .replace(/^\s*•\s+/gm, "- ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function buildFieldChanges(before, after, fields) {
  return fields
    .map((field) => {
      const beforeValue = before[field];
      const afterValue = after[field];
      if (JSON.stringify(beforeValue) === JSON.stringify(afterValue)) return null;
      return {
        field,
        before: beforeValue,
        after: afterValue,
      };
    })
    .filter(Boolean);
}

function toKnowledgeFinding(code) {
  return {
    code,
    messageKey: `kb.warning.${code}`,
    severity: getSeverityForKbWarning(code),
  };
}

function toTopicFinding(code, params = {}) {
  return {
    code,
    messageKey: `topics.warning.${code}`,
    severity: getSeverityForTopicWarning(code),
    params,
  };
}

function toBotFinding(warning) {
  return {
    code: String(warning.key || "").split(".").pop() || warning.key,
    messageKey: warning.key,
    severity: getSeverityForBotWarning(warning.key),
    params: warning.params || {},
  };
}

function createAdminContentCopilot(deps) {
  const {
    fs: _fs,
    path,
    AGENT_DIR,
    TOPICS_DIR,
    MEMORY_DIR,
    loadCSVData,
    readJsonFileSafe,
    readTextFileSafe,
    callLLM,
    getProviderConfig,
    logger,
  } = deps;

  function loadKnowledgeRows() {
    return loadCSVData().map((row, index) => ({
      id: index + 1,
      question: row.question || "",
      answer: row.answer || "",
      source: row.source || "",
    }));
  }

  function loadTopicsWithContent() {
    const index = readJsonFileSafe(path.join(TOPICS_DIR, "_index.json"), { topics: [] });
    return index.topics.map((topic) => ({
      ...topic,
      content: topic.file ? readTextFileSafe(path.join(TOPICS_DIR, topic.file), "") : "",
    }));
  }

  function loadBotFileBundle() {
    const files = Object.fromEntries(
      VALID_AGENT_FILES.map((filename) => [filename, readTextFileSafe(path.join(AGENT_DIR, filename), "")])
    );
    const memoryFiles = {
      "ticket-template.json": readJsonFileSafe(path.join(MEMORY_DIR, "ticket-template.json"), {}),
      "conversation-schema.json": readJsonFileSafe(path.join(MEMORY_DIR, "conversation-schema.json"), {}),
    };
    return { files, memoryFiles };
  }

  function getKnowledgeTarget(selection) {
    const items = loadKnowledgeRows();
    if (!selection?.id) return { items, selected: null };
    const selected = items.find((item) => String(item.id) === String(selection.id));
    return { items: selected ? [selected] : [], selected: selected || null };
  }

  function getTopicTarget(selection) {
    const topics = loadTopicsWithContent();
    if (!selection?.id) return { topics, selected: null };
    const selected = topics.find((topic) => String(topic.id) === String(selection.id));
    return { topics: selected ? [selected] : [], selected: selected || null };
  }

  function getBotTarget(selection) {
    const { files, memoryFiles } = loadBotFileBundle();
    const allFiles = [
      ...VALID_AGENT_FILES.map((filename) => ({
        filename,
        kind: "text",
        content: files[filename] || "",
      })),
      ...VALID_MEMORY_FILES.map((filename) => ({
        filename,
        kind: "memory",
        content: stringifyMaybeJson(memoryFiles[filename], "{}"),
      })),
    ];
    if (!selection?.filename) return { items: allFiles, selected: null, files, memoryFiles };
    const selected = allFiles.find((item) => item.filename === selection.filename);
    return { items: selected ? [selected] : [], selected: selected || null, files, memoryFiles };
  }

  function reviewKnowledgeBase({ selection = null, limit = 8 } = {}) {
    const { items } = getKnowledgeTarget(selection);
    const allTopics = loadTopicsWithContent();

    const targets = items.map((item) => {
      const review = getKnowledgeWarnings(item.question, item.answer, allTopics);
      const findings = review.warnings.map((code) => toKnowledgeFinding(code));
      const suggestions = uniqueByKey([
        review.warnings.includes("questionNeedsVariants") ? { type: "draft", goalKey: "kbImproveQuestionVariants" } : null,
        review.warnings.includes("answerNeedsStructure") ? { type: "draft", goalKey: "kbImproveAnswerStructure" } : null,
        review.warnings.includes("answerShort") ? { type: "draft", goalKey: "kbExpandAnswer" } : null,
        review.warnings.includes("noTopicMatch") ? { type: "draft", goalKey: "kbAlignTopicCoverage" } : null,
      ].filter(Boolean), (suggestion) => suggestion.goalKey);

      return {
        id: item.id,
        label: item.question || `Record #${item.id}`,
        status: review.warnings.length ? "needs-review" : "ready",
        warningCodes: review.warnings,
        findings,
        suggestions,
        meta: {
          current: item,
          matches: review.matches.slice(0, 5).map((match) => ({
            id: match.id,
            title: match.title || match.id,
            score: match.matchScore,
            confidence: match.matchConfidence,
            matchedKeywords: match.matchedKeywords || [],
            signals: match.matchSignals || [],
          })),
        },
      };
    });

    const review = {
      surface: "knowledge",
      selection,
      summary: {
        totalRecords: loadKnowledgeRows().length,
        warningCount: targets.filter((target) => target.warningCodes.length > 0).length,
        unmatchedCount: targets.filter((target) => target.warningCodes.includes("noTopicMatch")).length,
        readyCount: targets.filter((target) => target.warningCodes.length === 0).length,
      },
      findings: flattenReviewTargets({ targets }, limit),
      suggestions: uniqueByKey(targets.flatMap((target) => target.suggestions || []), (suggestion) => suggestion.goalKey).slice(0, limit),
      targets,
    };

    return review;
  }

  function reviewTopics({ selection = null, limit = 8 } = {}) {
    const { topics } = getTopicTarget(selection);
    const allTopics = loadTopicsWithContent();
    const knowledgeItems = loadKnowledgeRows();

    const targets = topics.map((topic) => {
      const coverage = getTopicCoverage(topic, knowledgeItems, topic.content || "", allTopics);
      const findings = coverage.warnings.map((code) => {
        if (code === "keywordOverlap") {
          return toTopicFinding(code, {
            topics: coverage.overlapTopics.map((item) => item.title).slice(0, 3).join(", "),
            keywords: coverage.overlapTopics.flatMap((item) => item.keywords).slice(0, 4).join(", "),
          });
        }
        return toTopicFinding(code);
      });
      const suggestions = uniqueByKey([
        coverage.warnings.includes("fewKeywords") ? { type: "draft", goalKey: "topicExpandKeywords" } : null,
        coverage.warnings.includes("missingRequiredInfo") ? { type: "draft", goalKey: "topicCompleteRequiredInfo" } : null,
        coverage.warnings.includes("playbookShort") ? { type: "draft", goalKey: "topicStrengthenPlaybook" } : null,
        coverage.warnings.includes("directWithoutKb") ? { type: "draft", goalKey: "topicAlignKnowledgeCoverage" } : null,
        coverage.warnings.includes("keywordOverlap") ? { type: "draft", goalKey: "topicReduceOverlap" } : null,
      ].filter(Boolean), (suggestion) => suggestion.goalKey);

      return {
        id: topic.id,
        label: topic.title || topic.id,
        status: coverage.warnings.length ? "needs-review" : "ready",
        warningCodes: coverage.warnings,
        findings,
        suggestions,
        meta: {
          current: {
            id: topic.id,
            title: topic.title || "",
            description: topic.description || "",
            keywords: topic.keywords || [],
            requiresEscalation: Boolean(topic.requiresEscalation),
            canResolveDirectly: Boolean(topic.canResolveDirectly),
            requiredInfo: topic.requiredInfo || [],
            content: topic.content || "",
          },
          matchedEntries: coverage.matchedEntries.slice(0, 12).map((entry) => ({
            id: entry.id,
            question: entry.question,
            score: entry.matchScore,
            confidence: entry.matchConfidence,
          })),
          overlapTopics: coverage.overlapTopics,
        },
      };
    });

    return {
      surface: "topics",
      selection,
      summary: {
        totalTopics: allTopics.length,
        warningCount: targets.filter((target) => target.warningCodes.length > 0).length,
        noCoverageCount: targets.filter((target) => target.meta.matchedEntries.length === 0).length,
        escalationNeedsInfoCount: targets.filter((target) => target.warningCodes.includes("missingRequiredInfo")).length,
      },
      findings: flattenReviewTargets({ targets }, limit),
      suggestions: uniqueByKey(targets.flatMap((target) => target.suggestions || []), (suggestion) => suggestion.goalKey).slice(0, limit),
      targets,
    };
  }

  function reviewBotSettings({ selection = null, limit = 8 } = {}) {
    const { items, files, memoryFiles } = getBotTarget(selection);
    const qualityReport = getBotSettingsQualityReport(files, memoryFiles);

    const targets = items.map((item) => {
      const fileWarnings = (qualityReport.warningsByFile[item.filename] || []).map((warning) => toBotFinding(warning));
      return {
        id: item.filename,
        label: item.filename,
        status: fileWarnings.length ? "needs-review" : "ready",
        warningCodes: fileWarnings.map((warning) => warning.code),
        findings: fileWarnings,
        suggestions: fileWarnings.length ? [{ type: "draft", goalKey: "botTightenFile" }] : [],
        meta: {
          filename: item.filename,
          kind: item.kind,
          current: {
            content: item.content,
          },
        },
      };
    });

    return {
      surface: "bot-settings",
      selection,
      summary: {
        totalFiles: items.length,
        warningCount: targets.filter((target) => target.findings.length > 0).length,
        readyCount: targets.filter((target) => target.findings.length === 0).length,
      },
      findings: flattenReviewTargets({ targets }, limit),
      suggestions: uniqueByKey(targets.flatMap((target) => target.suggestions || []), (suggestion) => suggestion.goalKey).slice(0, limit),
      targets,
    };
  }

  function getQualitySnapshot() {
    const knowledge = reviewKnowledgeBase({ limit: 8 });
    const topics = reviewTopics({ limit: 8 });
    const bot = reviewBotSettings({ limit: 8 });
    return {
      knowledge: {
        totalRecords: knowledge.summary.totalRecords,
        warningCount: knowledge.summary.warningCount,
        unmatchedCount: knowledge.summary.unmatchedCount,
        topIssues: knowledge.targets
          .filter((target) => target.warningCodes.length > 0)
          .slice(0, 8)
          .map((target) => ({
            id: target.id,
            question: target.label,
            warnings: target.warningCodes,
            matches: target.meta.matches,
          })),
      },
      topics: {
        totalTopics: topics.summary.totalTopics,
        warningCount: topics.summary.warningCount,
        topIssues: topics.targets
          .filter((target) => target.warningCodes.length > 0)
          .slice(0, 8)
          .map((target) => ({
            id: target.id,
            title: target.label,
            warnings: target.warningCodes,
            matchedEntryCount: target.meta.matchedEntries.length,
          })),
      },
      bot: {
        warningCount: bot.summary.warningCount,
        topIssues: bot.targets
          .flatMap((target) => target.findings.map((finding) => ({
            filename: target.id,
            key: finding.messageKey,
            params: finding.params || {},
          })))
          .slice(0, 8),
      },
    };
  }

  async function callDraftModel({ systemPrompt, userPrompt, validator }) {
    if (typeof callLLM !== "function") return null;

    const messages = [{ role: "user", parts: [{ text: userPrompt }] }];
    const providerCfg = getProviderConfig ? getProviderConfig() : {};

    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const reply = await callLLM(messages, systemPrompt, 2400, {
          ...providerCfg,
          thinkingBudget: 0,
        });
        const parsed = parseLooseJson(reply.reply || "");
        if (validator(parsed)) return parsed;
        messages.push({
          role: "model",
          parts: [{ text: reply.reply || "" }],
        });
        messages.push({
          role: "user",
          parts: [{ text: "Return valid JSON only. Follow the schema exactly and do not omit required fields." }],
        });
      } catch (error) {
        logger?.warn?.("adminContentCopilot", "draft_generation_failed", { error: error.message });
      }
    }

    return null;
  }

  async function buildKbDraft({ target, goal = "", locale = "tr" }) {
    const review = reviewKnowledgeBase({ selection: target, limit: 6 });
    const selected = review.targets[0];
    if (!selected) return null;

    const current = selected.meta.current;
    const prompt = [
      "You are improving a customer support knowledge base entry for an admin panel.",
      "Return JSON only with this shape:",
      '{"question":"string","answer":"string","rationale":["string"],"confidence":"high|medium|low"}',
      "Rules:",
      "- Preserve the factual meaning and product terminology.",
      "- Keep the original content language.",
      "- Return plain text only. Do not use markdown bold, italic, headings, tables, or code fences.",
      "- Improve clarity and make answer steps visible when helpful.",
      "- Numbered steps are allowed when they help the reviewer see the flow.",
      "- Do not invent unsupported troubleshooting steps or promises.",
      `- Write rationale in ${locale === "tr" ? "Turkish" : "English"}.`,
      "",
      "Current question:",
      current.question,
      "",
      "Current answer:",
      current.answer,
      "",
      "Detected warnings:",
      selected.warningCodes.join(", ") || "none",
      "",
      "Matched topics:",
      (selected.meta.matches || []).map((match) => `${match.title} (${match.confidence}, ${match.score})`).join(" | ") || "none",
      "",
      goal ? `Admin goal: ${goal}` : "Admin goal: Improve this entry for quality review.",
    ].join("\n");

    const parsed = await callDraftModel({
      systemPrompt: "Rewrite the support entry and return strict JSON only.",
      userPrompt: prompt,
      validator: (value) => Boolean(
        value
        && typeof value.question === "string"
        && value.question.trim()
        && typeof value.answer === "string"
        && value.answer.trim()
        && Array.isArray(value.rationale)
      ),
    });
    if (!parsed) return null;

    const after = {
      question: sanitizePlainDraftText(parsed.question),
      answer: sanitizePlainDraftText(parsed.answer),
    };
    const before = {
      question: current.question,
      answer: current.answer,
    };

    return {
      surface: "knowledge",
      target: { id: current.id },
      before,
      after,
      changes: buildFieldChanges(before, after, ["question", "answer"]),
      rationale: parsed.rationale.filter(Boolean),
      confidence: normalizeConfidence(parsed.confidence),
      applyPayload: {
        question: after.question,
        answer: after.answer,
        source: current.source || "admin-manual",
        auditContext: {
          source: "copilot",
          surface: "knowledge",
          goal: goal || "quality_review",
        },
      },
    };
  }

  async function buildTopicDraft({ target, goal = "", locale = "tr" }) {
    const review = reviewTopics({ selection: target, limit: 6 });
    const selected = review.targets[0];
    if (!selected) return null;

    const current = selected.meta.current;
    const prompt = [
      "You are improving a support topic definition for an admin panel.",
      "Return JSON only with this shape:",
      '{"title":"string","description":"string","keywords":["string"],"requiredInfo":["string"],"content":"string","rationale":["string"],"confidence":"high|medium|low"}',
      "Rules:",
      "- Preserve product-specific facts.",
      "- Keep the topic ID unchanged; do not include it in the response.",
      "- Keep the original content language.",
      "- title, description, keywords, and requiredInfo must be plain text only with no markdown emphasis or headings.",
      "- Keywords should be concise search phrases.",
      "- Playbook content should be actionable and structured.",
      `- Write rationale in ${locale === "tr" ? "Turkish" : "English"}.`,
      "",
      "Current topic:",
      stringifyMaybeJson({
        id: current.id,
        title: current.title,
        description: current.description,
        keywords: current.keywords,
        requiresEscalation: current.requiresEscalation,
        canResolveDirectly: current.canResolveDirectly,
        requiredInfo: current.requiredInfo,
      }),
      "",
      "Current playbook:",
      current.content,
      "",
      "Warnings:",
      selected.warningCodes.join(", ") || "none",
      "",
      "Matched KB entries:",
      (selected.meta.matchedEntries || []).slice(0, 8).map((entry) => entry.question).join(" | ") || "none",
      "",
      goal ? `Admin goal: ${goal}` : "Admin goal: Improve this topic for quality review.",
    ].join("\n");

    const parsed = await callDraftModel({
      systemPrompt: "Rewrite the topic definition and return strict JSON only.",
      userPrompt: prompt,
      validator: (value) => Boolean(
        value
        && typeof value.title === "string"
        && value.title.trim()
        && typeof value.description === "string"
        && Array.isArray(value.keywords)
        && Array.isArray(value.requiredInfo)
        && typeof value.content === "string"
        && value.content.trim()
        && Array.isArray(value.rationale)
      ),
    });
    if (!parsed) return null;

    const after = {
      title: sanitizePlainDraftText(parsed.title),
      description: sanitizePlainDraftText(parsed.description),
      keywords: uniqueByKey(
        parsed.keywords
          .map((item) => sanitizePlainDraftText(item))
          .filter(Boolean),
        (item) => normalizeForMatching(item)
      ),
      requiredInfo: uniqueByKey(
        parsed.requiredInfo
          .map((item) => sanitizePlainDraftText(item))
          .filter(Boolean),
        (item) => normalizeForMatching(item)
      ),
      content: parsed.content.trim(),
    };
    const before = {
      title: current.title,
      description: current.description,
      keywords: current.keywords,
      requiredInfo: current.requiredInfo,
      content: current.content,
    };

    return {
      surface: "topics",
      target: { id: current.id },
      before,
      after,
      changes: buildFieldChanges(before, after, ["title", "description", "keywords", "requiredInfo", "content"]),
      rationale: parsed.rationale.filter(Boolean),
      confidence: normalizeConfidence(parsed.confidence),
      applyPayload: {
        id: current.id,
        title: after.title,
        description: after.description,
        keywords: after.keywords,
        requiresEscalation: current.requiresEscalation,
        canResolveDirectly: current.canResolveDirectly,
        requiredInfo: after.requiredInfo,
        content: after.content,
        auditContext: {
          source: "copilot",
          surface: "topics",
          goal: goal || "quality_review",
        },
      },
    };
  }

  async function buildBotFileDraft({ target, goal = "", locale = "tr" }) {
    const review = reviewBotSettings({ selection: target, limit: 6 });
    const selected = review.targets[0];
    if (!selected) return null;

    const current = selected.meta.current;
    const isMemory = selected.meta.kind === "memory";
    const prompt = [
      "You are improving an admin-configured bot file.",
      "Return JSON only.",
      isMemory
        ? '{"content":{},"rationale":["string"],"confidence":"high|medium|low"}'
        : '{"content":"string","rationale":["string"],"confidence":"high|medium|low"}',
      "Rules:",
      "- Preserve the intent and company-specific context.",
      "- Keep the original content language unless the admin explicitly asks otherwise.",
      "- Do not add capabilities that contradict hard bans or escalation flow.",
      isMemory ? "- content must be valid JSON." : "- content must be plain text.",
      `- Write rationale in ${locale === "tr" ? "Turkish" : "English"}.`,
      "",
      `Filename: ${selected.id}`,
      "",
      "Current content:",
      current.content,
      "",
      "Warnings:",
      selected.findings.map((finding) => finding.messageKey).join(", ") || "none",
      "",
      goal ? `Admin goal: ${goal}` : "Admin goal: Improve this file for quality review.",
    ].join("\n");

    const parsed = await callDraftModel({
      systemPrompt: "Rewrite the bot file and return strict JSON only.",
      userPrompt: prompt,
      validator: (value) => Boolean(
        value
        && Object.prototype.hasOwnProperty.call(value, "content")
        && Array.isArray(value.rationale)
      ),
    });
    if (!parsed) return null;

    const afterContent = isMemory
      ? stringifyMaybeJson(parsed.content, current.content || "{}")
      : String(parsed.content || "").trim();

    if (!afterContent) return null;

    const before = { content: current.content };
    const after = { content: afterContent };

    return {
      surface: "bot-settings",
      target: { filename: selected.id },
      before,
      after,
      changes: buildFieldChanges(before, after, ["content"]),
      rationale: parsed.rationale.filter(Boolean),
      confidence: normalizeConfidence(parsed.confidence),
      applyPayload: {
        content: afterContent,
        auditContext: {
          source: "copilot",
          surface: "bot-settings",
          goal: goal || "quality_review",
        },
      },
    };
  }

  async function buildDraft({ surface, locale = "tr", target, goal = "" }) {
    if (surface === "knowledge") return buildKbDraft({ target, goal, locale });
    if (surface === "topics") return buildTopicDraft({ target, goal, locale });
    if (surface === "bot-settings") return buildBotFileDraft({ target, goal, locale });
    return null;
  }

  function reviewSurface({ surface, selection = null, limit = 8 }) {
    if (surface === "knowledge") return reviewKnowledgeBase({ selection, limit });
    if (surface === "topics") return reviewTopics({ selection, limit });
    if (surface === "bot-settings") return reviewBotSettings({ selection, limit });
    return null;
  }

  return {
    VALID_AGENT_FILES,
    VALID_MEMORY_FILES,
    reviewKnowledgeBase,
    reviewTopics,
    reviewBotSettings,
    reviewSurface,
    buildKbDraft,
    buildTopicDraft,
    buildBotFileDraft,
    buildDraft,
    getQualitySnapshot,
    surfaceFromPanel,
  };
}

module.exports = {
  VALID_AGENT_FILES,
  VALID_MEMORY_FILES,
  normalizeForMatching,
  tokenizeForMatching,
  getTopicMatches,
  getKnowledgeWarnings,
  getTopicCoverage,
  getBotSettingsQualityReport,
  createAdminContentCopilot,
};

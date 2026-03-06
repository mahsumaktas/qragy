"use strict";

const { normalizeForMatching } = require("./sanitizer.js");
const { removeStopWords } = require("./stopWords.js");

const MIN_TEXT_MATCH_SCORE = 3;
const MIN_RERANK_SCORE = 0.3;

function buildNormalizedQuery(query) {
  const normalizedQuery = normalizeForMatching(query || "");
  const cleanedQuery = removeStopWords(normalizedQuery);
  const queryWords = cleanedQuery.split(/\s+/).filter((word) => word.length > 1);
  return { normalizedQuery, queryWords };
}

function hasPhraseMatch(normalizedQuery, normalizedText) {
  const queryWords = normalizedQuery.split(/\s+/).filter(Boolean);
  if (queryWords.length < 2) return false;
  const haystack = normalizeForMatching(normalizedText || "");

  for (let index = 0; index < queryWords.length - 1; index += 1) {
    const phrase = queryWords[index] + " " + queryWords[index + 1];
    if (haystack.includes(phrase)) return true;
  }

  return false;
}

function scoreKnowledgeTextMatch(query, question, answer) {
  const { normalizedQuery, queryWords } = buildNormalizedQuery(query);
  if (!queryWords.length) return 0;

  const normalizedQuestion = normalizeForMatching(question || "");
  const normalizedAnswer = normalizeForMatching(answer || "");

  let score = 0;
  if (normalizedQuestion === normalizedQuery || normalizedAnswer === normalizedQuery) {
    score += 15;
  } else if (normalizedQuestion.includes(normalizedQuery) || normalizedAnswer.includes(normalizedQuery)) {
    score += 10;
  }

  if (hasPhraseMatch(normalizedQuery, normalizedQuestion)) score += 8;

  for (const word of queryWords) {
    if (normalizedQuestion.includes(word)) score += 3;
    if (normalizedAnswer.includes(word)) score += 1;
  }

  return score;
}

function isStrongTextMatchScore(score) {
  return Number.isFinite(score) && score >= MIN_TEXT_MATCH_SCORE;
}

function hasConfidentRerankScore(score) {
  return Number.isFinite(score) && score >= MIN_RERANK_SCORE;
}

function shouldEscalateForKnowledgeGap(latestUserMessage, conversationContext) {
  const text = String(latestUserMessage || "").trim();
  const normalized = normalizeForMatching(text);
  const looksLikeSupportIssue = /(?:error|hata|sorun|problem|issue|not working|calismiyor|olmuyor|login|giris|yazici|printer|\b\d{3,}\b)/i.test(normalized);
  return Boolean(conversationContext?.currentTopic) || text.length > 10 || looksLikeSupportIssue;
}

module.exports = {
  MIN_RERANK_SCORE,
  MIN_TEXT_MATCH_SCORE,
  buildNormalizedQuery,
  hasPhraseMatch,
  scoreKnowledgeTextMatch,
  isStrongTextMatchScore,
  hasConfidentRerankScore,
  shouldEscalateForKnowledgeGap,
};

const { normalizeForMatching } = require("../utils/sanitizer.js");

const RAG_DISTANCE_THRESHOLD = 0.8;

function getAdaptiveTopK(kbSize) {
  if (kbSize < 50) return 3;
  if (kbSize < 500) return 5;
  return 7;
}

function phraseMatch(query, text) {
  const qWords = normalizeForMatching(query).split(" ").filter(Boolean);
  if (qWords.length < 2) return false;
  const normalizedText = normalizeForMatching(text);
  for (let i = 0; i < qWords.length - 1; i++) {
    const phrase = qWords[i] + " " + qWords[i + 1];
    if (normalizedText.includes(phrase)) return true;
  }
  return false;
}

function fullTextSearch(knowledgeBase, query, topK = 3) {
  if (!knowledgeBase || !query) return [];
  const normalizedQuery = normalizeForMatching(query);
  const queryWords = normalizedQuery.split(" ").filter((w) => w.length > 1);
  if (queryWords.length === 0) return [];

  const scored = [];
  for (const entry of knowledgeBase) {
    let score = 0;
    const nQuestion = normalizeForMatching(entry.question || "");
    const nAnswer = normalizeForMatching(entry.answer || "");
    if (nQuestion === normalizedQuery) score += 15;
    if (phraseMatch(query, entry.question || "")) score += 8;
    for (const word of queryWords) {
      if (nQuestion.includes(word)) score += 3;
      if (nAnswer.includes(word)) score += 1;
    }
    if (score > 0) scored.push({ ...entry, _textScore: score });
  }
  return scored.sort((a, b) => b._textScore - a._textScore).slice(0, topK);
}

function filterByRelevance(vectorResults) {
  return vectorResults.filter((r) => {
    const d = r._distance;
    if (d === null || d === undefined) return true;
    return d <= RAG_DISTANCE_THRESHOLD;
  });
}

function reciprocalRankFusion(vectorResults, textResults, k = 60) {
  const scoreMap = new Map();
  const dataMap = new Map();
  vectorResults.forEach((item, rank) => {
    const key = (item.question || "").slice(0, 100);
    scoreMap.set(key, (scoreMap.get(key) || 0) + 1 / (k + rank + 1));
    dataMap.set(key, item);
  });
  textResults.forEach((item, rank) => {
    const key = (item.question || "").slice(0, 100);
    scoreMap.set(key, (scoreMap.get(key) || 0) + 1 / (k + rank + 1));
    if (!dataMap.has(key)) dataMap.set(key, item);
  });
  return Array.from(scoreMap.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([key, score]) => ({ ...dataMap.get(key), rrfScore: score }));
}

async function searchKnowledge(query, { knowledgeTable, embedFn, knowledgeBase, kbSize }) {
  const topK = getAdaptiveTopK(kbSize || (knowledgeBase ? knowledgeBase.length : 0));
  const fetchK = topK * 2;
  const textResults = fullTextSearch(knowledgeBase || [], query, fetchK);

  let vectorResults = [];
  if (knowledgeTable && embedFn) {
    try {
      const queryVector = await embedFn(query);
      const raw = await knowledgeTable.vectorSearch(queryVector).limit(fetchK).toArray();
      vectorResults = filterByRelevance(
        raw.map((r) => ({ question: r.question, answer: r.answer, _distance: r._distance }))
      );
    } catch (_e) { /* vector search failed, text only */ }
  }

  const maxFinal = Math.min(topK, 5);
  if (vectorResults.length && textResults.length) return reciprocalRankFusion(vectorResults, textResults).slice(0, maxFinal);
  if (vectorResults.length) return vectorResults.slice(0, maxFinal);
  if (textResults.length) return textResults.slice(0, maxFinal);
  return [];
}

module.exports = { fullTextSearch, reciprocalRankFusion, filterByRelevance, getAdaptiveTopK, phraseMatch, searchKnowledge, RAG_DISTANCE_THRESHOLD };

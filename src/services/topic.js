const fs = require("fs");
const path = require("path");
const { normalizeForMatching } = require("../utils/sanitizer.js");

function loadTopicIndex(topicsDir) {
  const indexPath = path.join(topicsDir, "_index.json");
  try {
    return JSON.parse(fs.readFileSync(indexPath, "utf8"));
  } catch (_e) {
    return { topics: [] };
  }
}

function detectTopicByKeyword(text, topicIndex) {
  if (!text || !topicIndex || !topicIndex.topics) return { topicId: null, confidence: 0 };
  const normalized = normalizeForMatching(text);
  let bestMatch = null;
  let bestLength = 0;
  for (const topic of topicIndex.topics) {
    for (const keyword of topic.keywords || []) {
      const nk = normalizeForMatching(keyword);
      if (normalized.includes(nk) && nk.length > bestLength) {
        bestMatch = topic.id;
        bestLength = nk.length;
      }
    }
  }
  return bestMatch ? { topicId: bestMatch, confidence: 0.9 } : { topicId: null, confidence: 0 };
}

const topicFileCache = new Map();

function getTopicFile(topicId, topicIndex, topicsDir, cache = topicFileCache) {
  if (cache.has(topicId)) return cache.get(topicId);
  const topic = (topicIndex.topics || []).find((t) => t.id === topicId);
  if (!topic || !topic.file) { cache.set(topicId, ""); return ""; }
  try {
    const content = fs.readFileSync(path.join(topicsDir, topic.file), "utf8");
    cache.set(topicId, content);
    return content;
  } catch (_e) { cache.set(topicId, ""); return ""; }
}

function invalidateTopicCache(topicId) { topicFileCache.delete(topicId); }
function invalidateAllTopicCache() { topicFileCache.clear(); }

function getTopicMeta(topicId, topicIndex) {
  if (!topicIndex || !topicIndex.topics) return null;
  return topicIndex.topics.find((t) => t.id === topicId) || null;
}

module.exports = { loadTopicIndex, detectTopicByKeyword, getTopicFile, invalidateTopicCache, invalidateAllTopicCache, getTopicMeta };

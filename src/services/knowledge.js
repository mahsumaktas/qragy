"use strict";

/**
 * Knowledge Base Service
 *
 * LanceDB vector store + full-text search + RRF hybrid retrieval.
 * Factory pattern — knowledgeTable state encapsulated inside.
 */
function createKnowledgeService(deps) {
  const {
    lancedb,
    embedText,
    loadCSVData,
    logger,
    lanceDbPath,
    ragDistanceThreshold,
  } = deps;

  let knowledgeTable = null;

  async function initKnowledgeBase() {
    try {
      const db = await lancedb.connect(lanceDbPath);
      knowledgeTable = await db.openTable("knowledge_qa");
      const rowCount = await knowledgeTable.countRows();
      logger.info("kb", `Bilgi tabani yuklendi: ${rowCount} kayit`);
    } catch (err) {
      logger.warn("kb", "Bilgi tabani yuklenemedi", err);
    }
  }

  async function reingestKnowledgeBase() {
    const rows = loadCSVData();
    if (!rows.length) {
      knowledgeTable = null;
      return;
    }

    const records = [];
    for (const row of rows) {
      if (!row.question || !row.answer) continue;
      try {
        const vector = await embedText(row.question);
        records.push({ question: row.question, answer: row.answer, vector });
      } catch (err) {
        logger.warn("kb", `Embedding hatasi (skip): ${row.question?.slice(0, 40)}`, err);
      }
    }

    if (!records.length) {
      knowledgeTable = null;
      return;
    }

    const db = await lancedb.connect(lanceDbPath);
    try { await db.dropTable("knowledge_qa"); } catch (err) { logger.warn("reingest", "dropTable", err); }
    knowledgeTable = await db.createTable("knowledge_qa", records);
    logger.info("kb", `Bilgi tabani yeniden yuklendi: ${records.length} kayit`);
  }

  function fullTextSearch(query, topK = 5) {
    try {
      const rows = loadCSVData();
      if (!rows.length) return [];
      const queryLower = query.toLowerCase();
      const queryWords = queryLower.split(/\s+/).filter(w => w.length > 2);
      if (!queryWords.length) return [];

      const scored = [];
      for (const row of rows) {
        if (!row.question || !row.answer) continue;
        const qLower = (row.question || "").toLowerCase();
        const aLower = (row.answer || "").toLowerCase();
        let score = 0;
        if (qLower.includes(queryLower) || aLower.includes(queryLower)) {
          score += 10;
        }
        for (const word of queryWords) {
          if (qLower.includes(word)) score += 2;
          if (aLower.includes(word)) score += 1;
        }
        if (score > 0) {
          scored.push({ question: row.question, answer: row.answer, textScore: score });
        }
      }
      scored.sort((a, b) => b.textScore - a.textScore);
      return scored.slice(0, topK);
    } catch (err) {
      logger.warn("textSearchKB", "Error", err);
      return [];
    }
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

  async function searchKnowledge(query, topK = 3) {
    const textResults = fullTextSearch(query, topK * 2);

    let vectorResults = [];
    if (knowledgeTable) {
      try {
        const queryVector = await embedText(query);
        const results = await knowledgeTable
          .vectorSearch(queryVector)
          .limit(topK * 2)
          .toArray();
        vectorResults = results
          .filter((r) => r._distance <= ragDistanceThreshold)
          .map((r) => ({ question: r.question, answer: r.answer, distance: r._distance }));
      } catch (err) {
        logger.warn("kb", "Bilgi tabani vector arama hatasi", err);
      }
    }

    if (vectorResults.length && textResults.length) {
      const fused = reciprocalRankFusion(vectorResults, textResults);
      return fused.slice(0, topK);
    }

    if (vectorResults.length) return vectorResults.slice(0, topK);
    if (textResults.length) return textResults.slice(0, topK).map(r => ({ question: r.question, answer: r.answer, distance: 0.5 }));
    return [];
  }

  return {
    initKnowledgeBase,
    reingestKnowledgeBase,
    searchKnowledge,
    getKnowledgeTable: () => knowledgeTable,
  };
}

module.exports = { createKnowledgeService };

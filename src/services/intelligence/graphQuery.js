"use strict";

/**
 * Knowledge Graph Query Service
 *
 * Queries the knowledge graph for entity relationships and formats
 * the results for inclusion in system prompts.
 *
 * Factory pattern: createGraphQuery(deps)
 */

function createGraphQuery(deps) {
  const { sqliteDb, logger } = deps;

  /**
   * Query edges related to an entity.
   *
   * @param {string} entityName
   * @param {number} limit
   * @returns {Promise<Array<{sourceName, sourceType, relation, targetName, targetType}>>}
   */
  async function query(entityName, limit = 10) {
    try {
      return await sqliteDb.queryEdgesByEntity(entityName, limit);
    } catch (err) {
      logger.warn("graphQuery", "Graf sorgu hatasi", err);
      return [];
    }
  }

  /**
   * Format entity relationships for inclusion in a system prompt.
   *
   * @param {string} entityName
   * @param {number} maxTokens - approximate token budget (char-based heuristic)
   * @returns {Promise<string>}
   */
  async function formatForPrompt(entityName, maxTokens = 500) {
    const edges = await query(entityName);
    if (!edges.length) return "";

    const lines = [];
    let charCount = 0;
    // Rough heuristic: 1 token ~ 4 chars
    const charBudget = maxTokens * 4;

    for (const edge of edges) {
      const line = `${edge.sourceName} --[${edge.relation}]--> ${edge.targetName} (${edge.targetType})`;
      if (charCount + line.length > charBudget) break;
      lines.push(line);
      charCount += line.length;
    }

    return `--- BILGI GRAFI ---\n${lines.join("\n")}\n---`;
  }

  return { query, formatForPrompt };
}

module.exports = { createGraphQuery };

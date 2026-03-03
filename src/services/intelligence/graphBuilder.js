"use strict";

/**
 * Knowledge Graph Builder
 *
 * Extracts entities and relationships from closed ticket summaries via LLM,
 * then persists them into the graph (sqliteDb).
 *
 * Factory pattern: createGraphBuilder(deps)
 */

const ENTITY_TYPES = ["product", "branch", "issue_type", "resolution", "customer_segment"];
const RELATION_TYPES = ["has_device", "has_issue", "resolved_by", "located_at"];

const EXTRACTION_SYSTEM_PROMPT = `You are a knowledge graph extraction assistant.
Extract entities and relationships from the given support ticket summary.

Entity types: ${ENTITY_TYPES.join(", ")}
Relationships: ${RELATION_TYPES.join(", ")}

Respond in JSON format:
{
  "entities": [{"name": "...", "type": "..."}],
  "relationships": [{"source": "...", "target": "...", "relation": "..."}]
}

Respond with JSON only, do not write anything else.`;

function createGraphBuilder(deps) {
  const { callLLM, getProviderConfig, sqliteDb, logger } = deps;

  /**
   * Extract entities and relationships from a closed ticket, persist to graph.
   * On failure: logs warning, does not throw.
   *
   * @param {{ summary: string, branchCode: string }} ticket
   */
  async function extractAndStore(ticket) {
    try {
      const { summary, branchCode } = ticket;

      const providerConfig = getProviderConfig();
      const messages = [
        { role: "user", parts: [{ text: `Ticket Summary: ${summary}\nBranch Code: ${branchCode}` }] },
      ];

      const response = await callLLM(messages, EXTRACTION_SYSTEM_PROMPT, 1024, providerConfig);
      const raw = response.reply.trim();

      // Strip markdown code fences if present
      const jsonStr = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
      const parsed = JSON.parse(jsonStr);

      const entities = parsed.entities || [];
      const relationships = parsed.relationships || [];

      // Upsert entities and collect name->entity map
      const entityMap = {};
      for (const ent of entities) {
        if (!ent.name || !ent.type) continue;
        const entity = await sqliteDb.upsertEntity(ent.name, ent.type, {});
        entityMap[ent.name] = entity;
      }

      // Insert edges
      for (const rel of relationships) {
        if (!rel.source || !rel.target || !rel.relation) continue;
        const sourceEntity = entityMap[rel.source];
        const targetEntity = entityMap[rel.target];
        if (!sourceEntity || !targetEntity) continue;

        await sqliteDb.insertEdge(
          sourceEntity.id,
          targetEntity.id,
          rel.relation,
          1.0,
          { branchCode }
        );
      }
    } catch (err) {
      logger.warn("graphBuilder", "Entity extraction failed, skipping", err);
    }
  }

  return { extractAndStore };
}

module.exports = { createGraphBuilder };

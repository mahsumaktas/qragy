const { estimateTokens, trimToTokenBudget, TOKEN_BUDGETS } = require("../services/memory.js");

function trimParts(parts, maxTokens) {
  const totalTokens = parts.reduce((sum, p) => sum + estimateTokens(p.content), 0);
  if (totalTokens <= maxTokens) {
    return parts.map((p) => ({ ...p, trimmed: false }));
  }

  let excess = totalTokens - maxTokens;
  const result = parts.map((p) => ({ ...p, trimmed: false, _origIdx: parts.indexOf(p) }));

  // Pass 1: Trim priority 3
  for (const part of result) {
    if (excess <= 0) break;
    if (part.priority !== 3) continue;
    const tokens = estimateTokens(part.content);
    const canTrim = Math.min(tokens, excess);
    if (canTrim > 0) {
      part.content = trimToTokenBudget(part.content, Math.max(tokens - canTrim, 0));
      part.trimmed = true;
      excess -= canTrim;
    }
  }

  // Pass 2: Trim priority 2
  for (const part of result) {
    if (excess <= 0) break;
    if (part.priority !== 2) continue;
    const tokens = estimateTokens(part.content);
    const canTrim = Math.min(tokens, excess);
    if (canTrim > 0) {
      part.content = trimToTokenBudget(part.content, Math.max(tokens - canTrim, 0));
      part.trimmed = true;
      excess -= canTrim;
    }
  }

  return result.sort((a, b) => a._origIdx - b._origIdx).map(({ _origIdx, ...rest }) => rest);
}

function buildPrompt({
  soul = "", persona = "", bootstrap = "", domain = "", skills = "",
  hardBans = "", escalationMatrix = "", responsePolicy = "",
  definitionOfDone = "", outputFilter = "", topicContent = "",
  topicIndex = "", ragResults = [], memory = {}, conversationState = {},
  confirmationTemplate = "", turnCount = 0,
}) {
  let ragContext = "";
  if (ragResults && ragResults.length > 0) {
    ragContext = ragResults.map((r) => "S: " + r.question + "\nC: " + r.answer).join("\n\n");
  }
  const memoryJson = Object.keys(memory).length > 0 ? JSON.stringify(memory) : "";
  const stateJson = Object.keys(conversationState).length > 0 ? JSON.stringify(conversationState) : "";

  const parts = [
    { name: "soul", content: soul || "", priority: 1 },
    { name: "persona", content: persona || "", priority: 1 },
    { name: "hardBans", content: hardBans || "", priority: 1 },
    { name: "memory", content: memoryJson ? "Mevcut hafiza: " + memoryJson : "", priority: 1 },
    { name: "state", content: stateJson ? "Konusma durumu: " + stateJson : "", priority: 1 },
    { name: "bootstrap", content: turnCount <= 1 ? (bootstrap || "") : "", priority: 2 },
    { name: "escalation", content: escalationMatrix || "", priority: 2 },
    { name: "responsePolicy", content: responsePolicy || "", priority: 2 },
    { name: "topicContent", content: topicContent || "", priority: 2 },
    { name: "topicIndex", content: topicIndex || "", priority: 2 },
    { name: "ragContext", content: ragContext ? "Bilgi bankasi sonuclari:\n" + ragContext : "", priority: 2 },
    { name: "confirmation", content: confirmationTemplate || "", priority: 2 },
    { name: "domain", content: turnCount > 1 ? (domain || "") : "", priority: 3 },
    { name: "skills", content: turnCount > 1 ? (skills || "") : "", priority: 3 },
    { name: "dod", content: turnCount > 1 ? (definitionOfDone || "") : "", priority: 3 },
    { name: "outputFilter", content: turnCount > 1 ? (outputFilter || "") : "", priority: 3 },
  ].filter((p) => p.content && p.content.trim().length > 0);

  const trimmed = trimParts(parts, TOKEN_BUDGETS.systemPrompt);
  return trimmed.map((p) => p.content).join("\n\n");
}

module.exports = { buildPrompt, trimParts };

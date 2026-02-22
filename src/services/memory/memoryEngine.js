"use strict";

/**
 * Memory Engine Orchestrator
 *
 * Ties together Core Memory (user profile/preferences) and Recall Memory
 * (conversation history search) into a unified context loading interface.
 */

const CORE_TOKEN_BUDGET = 500;
const RECALL_TOKEN_BUDGET = 1000;

function createMemoryEngine(deps) {
  const { coreMemory, recallMemory, logger } = deps;

  /**
   * Load memory context for prompt injection.
   * Always loads core memory; loads recall memory only when analysis says it is needed.
   * @param {string} userId
   * @param {string} query - current user query
   * @param {Object} analysisResult - output from query analyzer (optional)
   * @returns {Promise<{coreMemory: string, recallMemory: string}>}
   */
  async function loadContext(userId, query, analysisResult = {}) {
    const coreContext = await coreMemory.formatForPrompt(userId, CORE_TOKEN_BUDGET);

    let recallContext = "";
    if (analysisResult.requiresMemory && query) {
      recallContext = await recallMemory.formatForPrompt(query, userId, RECALL_TOKEN_BUDGET);
    }

    return { coreMemory: coreContext, recallMemory: recallContext };
  }

  /**
   * Post-conversation memory updates.
   * Extracts core facts from chat and persists conversation summary to recall.
   * @param {string} userId
   * @param {string} sessionId
   * @param {Array} chatHistory
   * @param {string|null} summary
   */
  async function updateAfterConversation(userId, sessionId, chatHistory, summary) {
    try {
      await coreMemory.autoExtract(userId, chatHistory);

      if (summary) {
        await recallMemory.save(userId, sessionId, summary);
      }
    } catch (err) {
      logger.warn("memoryEngine", "updateAfterConversation failed", err);
    }
  }

  /**
   * Get raw core profile for a user.
   * @param {string} userId
   * @returns {Promise<Object>}
   */
  async function getCoreProfile(userId) {
    return coreMemory.load(userId);
  }

  return { loadContext, updateAfterConversation, getCoreProfile };
}

module.exports = { createMemoryEngine, CORE_TOKEN_BUDGET, RECALL_TOKEN_BUDGET };

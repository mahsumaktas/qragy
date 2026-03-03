"use strict";

/**
 * Question Extractor Service
 *
 * Extracts a standalone question from chat history + latest message.
 * Resolves references like "the same for another branch" into
 * a complete, context-independent question.
 */

const EXTRACTION_PROMPT = `You are a question extraction assistant. You receive the user's chat history and latest message.
Task: Transform the latest message using the context from chat history into an independent question.

Rules:
- Resolve pronouns and references ("that", "this", "the same thing", "that place", etc.)
- Return only the extracted question, write nothing else
- If the latest message is already an independent question, return it as is
- Use the same language as the original`;

function createQuestionExtractor(deps) {
  const { callLLM, getProviderConfig, logger } = deps;

  async function extractQuestion(chatHistory, latestMessage) {
    if (!chatHistory || chatHistory.length === 0) {
      return latestMessage;
    }

    // Build context from recent history (last 6 messages max)
    const recentHistory = chatHistory.slice(-6);
    const historyText = recentHistory
      .map(m => `${m.role === "user" ? "User" : "Bot"}: ${m.content}`)
      .join("\n");

    const prompt = `${EXTRACTION_PROMPT}\n\nChat History:\n${historyText}\n\nLatest Message: ${latestMessage}\n\nIndependent Question:`;

    try {
      const providerConfig = getProviderConfig();
      const messages = [{ role: "user", parts: [{ text: prompt }] }];
      const result = await callLLM(messages, "", 256, providerConfig);

      const extracted = (result.reply || "").trim();
      if (!extracted || extracted.length > latestMessage.length * 3) {
        logger.info("questionExtractor", "Sanity check failed, using original", {
          originalLen: latestMessage.length,
          extractedLen: extracted ? extracted.length : 0,
        });
        return latestMessage;
      }

      logger.info("questionExtractor", "Question extracted", {
        original: latestMessage.slice(0, 80),
        extracted: extracted.slice(0, 80),
        changed: extracted !== latestMessage,
      });

      return extracted;
    } catch (err) {
      logger.warn("questionExtractor", "Extraction failed, using original", err);
      return latestMessage;
    }
  }

  return { extractQuestion };
}

module.exports = { createQuestionExtractor };

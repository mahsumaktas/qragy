"use strict";

/**
 * Contextual Chunker — Anthropic's Contextual Retrieval approach
 *
 * At INDEXING TIME, generates 1-2 sentence context from LLM for each chunk
 * and prepends it to the chunk. This improves retrieval quality by ~67%.
 * Zero RUNTIME cost — all work happens during indexing.
 */

const CONTEXT_SYSTEM_PROMPT = [
  "You are a knowledge base context writer.",
  "You will be given a text passage extracted from a document.",
  "Write a brief context sentence — summarize what this text passage is about in 1-2 sentences.",
  "ONLY write the context sentence, do not add anything else.",
].join("\n");

const CONTEXT_MAX_TOKENS = 128;

function buildContextPrompt(originalContent, documentTitle) {
  return [
    `Document: "${documentTitle}"`,
    "",
    `Text passage:`,
    `"""`,
    originalContent,
    `"""`,
    "",
    "Write a brief context sentence for this text passage:",
  ].join("\n");
}

function buildOriginalContent(chunk) {
  const question = (chunk.question || "").trim();
  const answer = (chunk.answer || "").trim();

  if (question && answer) {
    return `${question}: ${answer}`;
  }
  // question may be empty — use answer if available
  return answer || question;
}

function createContextualChunker(deps) {
  const { callLLM, getProviderConfig, logger } = deps;

  async function enrichChunk(chunk, documentTitle) {
    const originalContent = buildOriginalContent(chunk);

    try {
      const providerConfig = getProviderConfig();
      const messages = [
        {
          role: "user",
          parts: [{ text: buildContextPrompt(originalContent, documentTitle) }],
        },
      ];

      const { reply } = await callLLM(
        messages,
        CONTEXT_SYSTEM_PROMPT,
        CONTEXT_MAX_TOKENS,
        providerConfig
      );

      const context = (reply || "").trim();
      if (!context) {
        logger.warn("[ContextualChunker] LLM returned empty context, using original");
        return { originalContent, contextualContent: originalContent, enriched: false };
      }

      return {
        originalContent,
        contextualContent: `${context}\n${originalContent}`,
        enriched: true,
      };
    } catch (err) {
      logger.warn(`[ContextualChunker] LLM context generation failed: ${err.message}`);
      return { originalContent, contextualContent: originalContent, enriched: false };
    }
  }

  async function enrichBatch(chunks, documentTitle, concurrency = 3) {
    const results = [];

    for (let i = 0; i < chunks.length; i += concurrency) {
      const batch = chunks.slice(i, i + concurrency);
      const batchResults = await Promise.all(
        batch.map((chunk) => enrichChunk(chunk, documentTitle))
      );
      results.push(...batchResults);
    }

    return results;
  }

  return { enrichChunk, enrichBatch };
}

module.exports = { createContextualChunker };

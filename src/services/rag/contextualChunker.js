"use strict";

/**
 * Contextual Chunker — Anthropic's Contextual Retrieval yaklasimi
 *
 * INDEXING TIME'da her chunk icin LLM'den 1-2 cumlelik baglam uretir
 * ve chunk'in basina ekler. Bu sayede retrieval kalitesi ~%67 artar.
 * Runtime maliyeti SIFIR — tum is indexing sirasinda yapilir.
 */

const CONTEXT_SYSTEM_PROMPT = [
  "Sen bir bilgi bankasi baglam yazarisin.",
  "Sana bir dokumandan alinmis bir metin parcasi verilecek.",
  "Kisa baglam cumlesi yaz — bu metin parcasinin ne hakkinda oldugunu 1-2 cumleyle ozetle.",
  "SADECE baglam cumlesini yaz, baska bir sey ekleme.",
].join("\n");

const CONTEXT_MAX_TOKENS = 128;

function buildContextPrompt(originalContent, documentTitle) {
  return [
    `Dokuman: "${documentTitle}"`,
    "",
    `Metin parcasi:`,
    `"""`,
    originalContent,
    `"""`,
    "",
    "Bu metin parcasi icin kisa bir baglam cumlesi yaz:",
  ].join("\n");
}

function buildOriginalContent(chunk) {
  const question = (chunk.question || "").trim();
  const answer = (chunk.answer || "").trim();

  if (question && answer) {
    return `${question}: ${answer}`;
  }
  // question bos olabilir — sadece answer varsa onu kullan
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
        logger.warn("[ContextualChunker] LLM bos baglam dondurdu, original kullaniliyor");
        return { originalContent, contextualContent: originalContent, enriched: false };
      }

      return {
        originalContent,
        contextualContent: `${context}\n${originalContent}`,
        enriched: true,
      };
    } catch (err) {
      logger.warn(`[ContextualChunker] LLM baglam uretimi basarisiz: ${err.message}`);
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

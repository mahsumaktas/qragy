"use strict";

/**
 * Conversation Summarizer Service
 *
 * Summarizes long conversations (15+ messages) using LLM to maintain context
 * without losing key information. The summary replaces old messages.
 */

const DEFAULT_SUMMARY_THRESHOLD = 15;

const SUMMARY_PROMPT = `Sen bir konusma ozeti cikarma asistanisin.
Asagidaki musteri destek konusmasini 3-5 cumlede ozetle.
Onemli bilgileri koru: musteri adi, sube kodu, sorun, yapilan islemler.
Sadece ozeti yaz, baska bir sey ekleme.
Turkce yaz.`;

function createConversationSummarizer(deps) {
  const { callLLM, getProviderConfig, getChatFlowConfig, logger } = deps;

  async function shouldSummarize(chatHistory) {
    const config = getChatFlowConfig();
    if (config.conversationSummaryEnabled === false) return false;
    const threshold = config.summaryThreshold || DEFAULT_SUMMARY_THRESHOLD;
    return Array.isArray(chatHistory) && chatHistory.length >= threshold;
  }

  async function summarize(chatHistory) {
    if (!Array.isArray(chatHistory) || chatHistory.length === 0) {
      return { summary: null, trimmedHistory: chatHistory || [] };
    }

    const config = getChatFlowConfig();
    if (config.conversationSummaryEnabled === false) {
      return { summary: null, trimmedHistory: chatHistory };
    }

    const threshold = config.summaryThreshold || DEFAULT_SUMMARY_THRESHOLD;
    if (chatHistory.length < threshold) {
      return { summary: null, trimmedHistory: chatHistory };
    }

    // Keep the most recent 8 messages, summarize the rest
    const recentCount = 8;
    const oldMessages = chatHistory.slice(0, -recentCount);
    const recentMessages = chatHistory.slice(-recentCount);

    // Build conversation text for summarization
    const convoText = oldMessages
      .map(m => `${m.role === "user" ? "Musteri" : "Bot"}: ${m.content}`)
      .join("\n");

    const prompt = `${SUMMARY_PROMPT}\n\nKonusma:\n${convoText}\n\nOzet:`;

    try {
      const providerConfig = getProviderConfig();
      const result = await callLLM(prompt, {
        model: providerConfig.model,
        apiKey: providerConfig.apiKey,
        provider: providerConfig.provider,
        baseUrl: providerConfig.baseUrl,
        maxOutputTokens: 512,
        requestTimeoutMs: 8000,
      });

      const summary = (result || "").trim();
      if (summary && summary.length > 20) {
        const summaryMessage = { role: "assistant", content: `[Konusma ozeti: ${summary}]` };
        return {
          summary,
          trimmedHistory: [summaryMessage, ...recentMessages],
        };
      }
    } catch (err) {
      logger.warn("conversationSummarizer", "Summarization failed", err);
    }

    // Fallback: just keep recent messages with no summary
    return { summary: null, trimmedHistory: chatHistory };
  }

  return { shouldSummarize, summarize, DEFAULT_SUMMARY_THRESHOLD };
}

module.exports = { createConversationSummarizer };

const COMPRESS_THRESHOLD = 20;
const RECENT_KEEP_NORMAL = 12;
const RECENT_KEEP_LARGE = 8;
const LARGE_THRESHOLD = 40;
const FIRST_KEEP = 3;
const LAST_KEEP = 8;

function estimateTokens(text) {
  if (!text) return 0;
  return Math.ceil(String(text).length / 4);
}

function shouldCompress(messages) {
  return Array.isArray(messages) && messages.length >= COMPRESS_THRESHOLD;
}

function extractiveSummary(messages) {
  const parts = [];
  for (const msg of messages) {
    if (!msg.content) continue;
    const sentences = msg.content.split(/[.!?]+/).map((s) => s.trim()).filter((s) => s.length > 10);
    if (sentences.length > 0) parts.push(sentences[0]);
  }
  return parts.join(". ") + ".";
}

function fallbackTruncate(messages) {
  if (messages.length <= FIRST_KEEP + LAST_KEEP) return [...messages];
  return [...messages.slice(0, FIRST_KEEP), ...messages.slice(-LAST_KEEP)];
}

async function compressHistory(messages, llmSummarizer = null) {
  if (!shouldCompress(messages)) return messages;
  const recentCount = messages.length >= LARGE_THRESHOLD ? RECENT_KEEP_LARGE : RECENT_KEEP_NORMAL;
  const oldMessages = messages.slice(0, -recentCount);
  const recentMessages = messages.slice(-recentCount);

  if (llmSummarizer) {
    try {
      const summary = await llmSummarizer(oldMessages, 512);
      if (summary && summary.length > 20) {
        return [{ role: "assistant", content: "[Onceki konusma ozeti: " + summary + "]" }, ...recentMessages];
      }
    } catch (_e) { /* fall through */ }
  }

  const extractive = extractiveSummary(oldMessages);
  if (extractive && extractive.length > 20) {
    return [{ role: "assistant", content: "[Onceki konusma ozeti: " + extractive + "]" }, ...recentMessages];
  }

  return fallbackTruncate(messages);
}

function trimToTokenBudget(text, maxTokens) {
  if (!text) return "";
  const current = estimateTokens(text);
  if (current <= maxTokens) return text;
  return String(text).slice(0, maxTokens * 4);
}

const TOKEN_BUDGETS = {
  systemPrompt: 8000,
  conversationHistory: 4000,
  ragContext: 2000,
  responseBudget: 1024,
};

module.exports = { shouldCompress, compressHistory, extractiveSummary, fallbackTruncate, estimateTokens, trimToTokenBudget, TOKEN_BUDGETS, COMPRESS_THRESHOLD };

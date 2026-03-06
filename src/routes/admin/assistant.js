"use strict";

/**
 * Admin Assistant (Action-capable Agent) Route
 *
 * POST /api/admin/assistant — Action-capable AI assistant
 * User describes their issue or uploads a file, assistant makes the necessary API calls.
 *
 * Qragy Pipeline Integration:
 *   - RAG Search: Searches knowledge base based on user message, adds results to LLM context
 *   - Agent Config: Automatically loads current bot configuration (soul, persona, topics)
 *   - Response Validation: Validates LLM output for hallucination, repetition, language checks
 *   - Provider Config: Uses the same model/parameters as the main chatbot pipeline
 */

const { validateBotResponse } = require("../../services/responseValidator");
const {
  createAdminContentCopilot,
  normalizeForMatching,
  VALID_AGENT_FILES,
} = require("../../services/adminContentCopilot");
const { prepareKnowledgeImport } = require("../../services/knowledgeImport");

// ── Allowed Actions Whitelist ────────────────────────────────────────────
const ALLOWED_ACTIONS = {
  add_kb_entries:         { description: "Add Q&A entries to knowledge base", dangerous: false },
  list_kb:               { description: "List knowledge base records", dangerous: false },
  review_kb_quality:     { description: "Review knowledge base quality", dangerous: false },
  read_agent_file:       { description: "Read agent file", dangerous: false },
  update_agent_file:     { description: "Update agent file", dangerous: true },
  list_topics:           { description: "List topics", dangerous: false },
  read_topic_detail:     { description: "Read topic details", dangerous: false },
  review_topics_quality: { description: "Review topic quality", dangerous: false },
  review_bot_files_quality: { description: "Review bot file quality", dangerous: false },
  create_topic:          { description: "Create new topic", dangerous: false },
  update_topic:          { description: "Update topic", dangerous: true },
  read_config:           { description: "Read configuration", dangerous: false },
  update_chat_flow:      { description: "Update chat flow", dangerous: true },
  update_site_config:    { description: "Update appearance settings", dangerous: true },
  update_sunshine_config:{ description: "Update Zendesk integration", dangerous: true },
  process_uploaded_file: { description: "Process uploaded file", dangerous: false },
};

const MAX_ITERATIONS = 3;
const ASSISTANT_MAX_OUTPUT_TOKENS = 3072;
const ASSISTANT_RECOVERY_MAX_OUTPUT_TOKENS = 1536;
const ASSISTANT_MIN_TIMEOUT_MS = 40000;
const ASSISTANT_RECOVERY_TIMEOUT_MS = 20000;
const ADMIN_ASSISTANT_MAX_MESSAGE_LENGTH = 4000;
const ADMIN_ASSISTANT_MAX_HISTORY_ITEMS = 10;
const ADMIN_ASSISTANT_MAX_HISTORY_CHARS = 1200;

function buildAssistantInputTooLongError(locale, maxChars) {
  if (locale === "en") {
    return `Message too long. Maximum ${maxChars} characters allowed.`;
  }
  return `Mesaj çok uzun. En fazla ${maxChars} karakter gönderebilirsiniz.`;
}

function sanitizeAssistantHistory(history) {
  return (Array.isArray(history) ? history : [])
    .slice(-ADMIN_ASSISTANT_MAX_HISTORY_ITEMS)
    .map((item) => ({
      role: item?.role === "assistant" ? "assistant" : "user",
      content: String(item?.content || "").slice(0, ADMIN_ASSISTANT_MAX_HISTORY_CHARS),
    }))
    .filter((item) => item.content.trim());
}

function mergeKnowledgeEntries(rows, entries) {
  let added = 0;
  for (const entry of entries || []) {
    const question = String(entry.question || "").trim();
    const answer = String(entry.answer || "").trim();
    if (!question || !answer) continue;
    const exists = rows.some((row) =>
      (row.question || "").trim().toLowerCase() === question.toLowerCase()
      && (row.answer || "").trim().toLowerCase() === answer.toLowerCase()
    );
    if (exists) continue;
    rows.push({
      question,
      answer,
      source: entry.source || "assistant-import",
    });
    added += 1;
  }
  return added;
}

function buildAssistantFileContext(filename, importPlan) {
  const lines = [`[UPLOADED FILE: ${filename}]`];
  if (!importPlan) return lines.join("\n");

  if (importPlan.mode === "qa_pairs") {
    lines.push(`${importPlan.pairCount || importPlan.entries?.length || 0} Q&A pairs extracted from the file.`);
  } else {
    lines.push(`${importPlan.chunkCount || importPlan.entries?.length || 0} knowledge chunks prepared from the file.`);
    if (importPlan.rowCount) {
      lines.push(`Detected ${importPlan.rowCount} tabular row(s).`);
    }
  }

  if (importPlan.preview) {
    lines.push("Preview:");
    lines.push(String(importPlan.preview).slice(0, 1600));
  }
  if (importPlan.truncated) {
    lines.push("Import plan was truncated to stay within safe size limits.");
  }

  return lines.join("\n");
}

function detectAutoReviewActions(message) {
  const normalized = normalizeForMatching(message);
  if (!normalized) return [];

  const reviewIntent = /(incele|degerlendir|audit|review|kalite|eksik|bosluk|coverage|kapsama|celiski|zayif|problem)/.test(normalized);
  if (!reviewIntent) return [];

  const actions = [];
  const mentionsKb = /(bilgi bankasi|kb|knowledge base|sss)/.test(normalized);
  const mentionsTopics = /(konu|konular|topic|topics)/.test(normalized);
  const mentionsBot = /(bot ayari|bot ayarlari|prompt|persona|skills|hard bans|yasak|hafiza|memory|chat flow|ajan dosya|agent file)/.test(normalized);

  if (mentionsKb) actions.push({ action: "review_kb_quality", params: { limit: 8 } });
  if (mentionsTopics) actions.push({ action: "review_topics_quality", params: { limit: 8 } });
  if (mentionsBot) actions.push({ action: "review_bot_files_quality", params: {} });

  if (!actions.length) {
    actions.push({ action: "review_kb_quality", params: { limit: 6 } });
    actions.push({ action: "review_topics_quality", params: { limit: 6 } });
    actions.push({ action: "review_bot_files_quality", params: {} });
  }

  return actions;
}

function detectRewriteIntent(message) {
  const normalized = normalizeForMatching(message);
  if (!normalized) return false;
  return /(duzelt|yeniden yaz|iyilestir|rewrite|revize|guncelle|guclendir|taslak|draft)/.test(normalized);
}

function getCopilotOpenReply(locale, mode, surface) {
  if (locale === "en") {
    if (mode === "draft") {
      return `I opened the ${surface} copilot for the selected item. Review the draft and apply it from the side panel.`;
    }
    return `I opened the ${surface} copilot for the selected item. You can inspect findings from the side panel.`;
  }

  if (mode === "draft") {
    return `Seçili kayıt için ${surface} copilot panelini açıyorum. Taslağı yandaki panelden inceleyip uygulayabilirsiniz.`;
  }
  return `Seçili kayıt için ${surface} copilot panelini açıyorum. Bulguları yandaki panelden inceleyebilirsiniz.`;
}

function sanitizeProfessionalAssistantText(text) {
  return String(text || "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^\s*#{1,6}\s+/gm, "")
    .replace(/^\s*[-*]\s+/gm, "- ")
    .replace(/^\s*•\s+/gm, "- ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function buildAssistantUnavailableReply(locale, context = {}) {
  const hasSelection = Boolean(context?.copilotRequest);
  const hasReviewData = Boolean(context?.hasReviewData);

  if (locale === "en") {
    if (hasSelection && hasReviewData) {
      return "The AI assistant could not produce a stable response this time. Your review data is still available, and you can continue from the side copilot panel.";
    }
    if (hasSelection) {
      return "The AI assistant could not produce a stable response this time. Please try again, or continue from the side copilot panel for the selected item.";
    }
    if (hasReviewData) {
      return "The AI assistant could not produce a stable response this time. The preloaded review data is still available. Please try again in a moment.";
    }
    return "The AI assistant could not produce a stable response this time. Please try again in a moment.";
  }

  if (hasSelection && hasReviewData) {
    return "AI asistan bu istekte kararlı bir yanıt üretemedi. İnceleme verisi hazır durumda; seçili kayıt için yandaki copilot panelinden devam edebilirsiniz.";
  }
  if (hasSelection) {
    return "AI asistan bu istekte kararlı bir yanıt üretemedi. Biraz sonra tekrar deneyin veya seçili kayıt için yandaki copilot panelinden devam edin.";
  }
  if (hasReviewData) {
    return "AI asistan bu istekte kararlı bir yanıt üretemedi. Ön inceleme verisi hazır durumda; kısa süre sonra tekrar deneyebilirsiniz.";
  }
  return "AI asistan bu istekte kararlı bir yanıt üretemedi. Kısa süre sonra tekrar deneyin.";
}

function buildAssistantPrimaryOptions(options = {}) {
  return {
    ...options,
    requestTimeoutMs: Math.max(Number(options.requestTimeoutMs) || 0, ASSISTANT_MIN_TIMEOUT_MS),
  };
}

function buildAssistantRecoveryOptions(options = {}) {
  return {
    ...options,
    enableThinking: "false",
    thinkingBudget: 0,
    requestTimeoutMs: Math.max(Number(options.requestTimeoutMs) || 0, ASSISTANT_RECOVERY_TIMEOUT_MS),
  };
}

function shouldRecoverAssistantReply(parsed, llmResult) {
  const finishReason = String(llmResult?.finishReason || "").toUpperCase();
  if (!parsed.reply && !parsed.actions.length) return true;
  if (finishReason === "MAX_TOKENS" && !parsed.actions.length) return true;
  return false;
}

async function callAssistantModel({
  messages,
  systemPrompt,
  maxTokens,
  options,
  callLLM,
  callLLMWithFallback,
  logger,
}) {
  const caller = typeof callLLMWithFallback === "function" ? callLLMWithFallback : callLLM;
  if (typeof caller !== "function") {
    const error = new Error("LLM service is not configured.");
    error.status = 503;
    throw error;
  }

  const primaryOptions = buildAssistantPrimaryOptions(options);
  try {
    return await caller(messages, systemPrompt, maxTokens, primaryOptions);
  } catch (error) {
    logger?.warn?.("assistant", "primary_call_failed_retrying_without_thinking", {
      error: error.message,
      model: primaryOptions.model || "",
    });
  }

  const recoveryOptions = buildAssistantRecoveryOptions(options);
  return caller(
    messages,
    systemPrompt,
    Math.min(maxTokens, ASSISTANT_RECOVERY_MAX_OUTPUT_TOKENS),
    recoveryOptions
  );
}

// ── Parse LLM Response ──────────────────────────────────────────────────
function parseAssistantResponse(rawText) {
  if (!rawText || typeof rawText !== "string") {
    return { reply: sanitizeProfessionalAssistantText(rawText || ""), actions: [] };
  }

  // Try ```json ... ``` block first
  const fencedMatch = rawText.match(/```json\s*([\s\S]*?)```/);
  if (fencedMatch) {
    try {
      const parsed = JSON.parse(fencedMatch[1].trim());
      return {
        reply: sanitizeProfessionalAssistantText(parsed.reply || ""),
        actions: Array.isArray(parsed.actions) ? parsed.actions : [],
      };
    } catch (_e) { /* fall through */ }
  }

  // Try raw JSON object
  const jsonMatch = rawText.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      if (typeof parsed.reply === "string" || Array.isArray(parsed.actions)) {
        return {
          reply: sanitizeProfessionalAssistantText(parsed.reply || ""),
          actions: Array.isArray(parsed.actions) ? parsed.actions : [],
        };
      }
    } catch (_e) { /* fall through */ }
  }

  // Fallback: treat entire text as plain reply
  return { reply: sanitizeProfessionalAssistantText(rawText), actions: [] };
}

// ── Execute Single Action ───────────────────────────────────────────────
async function executeAction(actionName, params, deps) {
  const meta = ALLOWED_ACTIONS[actionName];
  if (!meta) {
    return { action: actionName, status: "error", result: "Unknown action: " + actionName };
  }

  const {
    fs, path, AGENT_DIR, TOPICS_DIR, _MEMORY_DIR,
    loadCSVData, saveCSVData, reingestKnowledgeBase,
    readTextFileSafe, readJsonFileSafe,
    loadAllAgentConfig, savePromptVersion, invalidateTopicCache,
    getChatFlowConfig, saveChatFlowConfig,
    getSiteConfig, saveSiteConfig,
    getSunshineConfig, saveSunshineConfig,
    logger,
  } = deps;
  const copilot = deps.copilot || createAdminContentCopilot(deps);

  try {
    switch (actionName) {

      // ── KB ──────────────────────────────────────────────────────────
      case "add_kb_entries": {
        const entries = Array.isArray(params?.entries) ? params.entries : [];
        if (!entries.length) return { action: actionName, status: "error", result: "No entries to add." };
        const rows = loadCSVData();
        let added = 0;
        for (const e of entries) {
          const q = String(e.question || "").trim();
          const a = String(e.answer || "").trim();
          if (q && a) { rows.push({ question: q, answer: a }); added++; }
        }
        if (added > 0) {
          saveCSVData(rows);
          await reingestKnowledgeBase();
        }
        return { action: actionName, status: "success", result: added + " entries added.", count: added };
      }

      case "list_kb": {
        const rows = loadCSVData();
        const records = rows.map((r, i) => ({ id: i + 1, question: r.question || "", answer: r.answer || "" }));
        return { action: actionName, status: "success", result: records.length + " records found.", records };
      }

      case "review_kb_quality": {
        const limit = Math.max(1, Math.min(Number(params?.limit) || 10, 25));
        const quality = copilot.reviewKnowledgeBase({ selection: params?.selection || null, limit });
        return {
          action: actionName,
          status: "success",
          result: quality.summary.warningCount + " KB records need review.",
          summary: quality.summary,
          records: quality.targets
            .filter((target) => target.warningCodes.length > 0)
            .slice(0, limit)
            .map((target) => ({
              id: target.id,
              question: target.label,
              warnings: target.warningCodes,
              matches: target.meta.matches || [],
            })),
        };
      }

      // ── Agent Files ─────────────────────────────────────────────────
      case "read_agent_file": {
        const filename = String(params?.filename || "");
        if (!VALID_AGENT_FILES.includes(filename)) {
          return { action: actionName, status: "error", result: "Invalid file: " + filename + ". Valid files: " + VALID_AGENT_FILES.join(", ") };
        }
        const content = readTextFileSafe(path.join(AGENT_DIR, filename), "");
        return { action: actionName, status: "success", result: content || "(empty file)", filename };
      }

      case "update_agent_file": {
        const filename = String(params?.filename || "");
        const content = String(params?.content || "");
        if (!VALID_AGENT_FILES.includes(filename)) {
          return { action: actionName, status: "error", result: "Invalid file: " + filename };
        }
        if (!content.trim()) {
          return { action: actionName, status: "error", result: "Content cannot be empty." };
        }
        const filePath = path.join(AGENT_DIR, filename);
        // Backup old version
        if (fs.existsSync(filePath)) {
          const old = fs.readFileSync(filePath, "utf8");
          savePromptVersion(filename, old);
        }
        fs.writeFileSync(filePath, content, "utf8");
        loadAllAgentConfig();
        return { action: actionName, status: "success", result: filename + " updated." };
      }

      // ── Topics ──────────────────────────────────────────────────────
      case "list_topics": {
        const index = readJsonFileSafe(path.join(TOPICS_DIR, "_index.json"), { topics: [] });
        const topics = index.topics.map(t => ({
          id: t.id,
          title: t.title,
          description: t.description || "",
          keywords: t.keywords,
          requiresEscalation: Boolean(t.requiresEscalation),
          canResolveDirectly: Boolean(t.canResolveDirectly),
        }));
        return { action: actionName, status: "success", result: topics.length + " topics found.", topics };
      }

      case "read_topic_detail": {
        const topicId = String(params?.topicId || "").trim();
        if (!topicId) return { action: actionName, status: "error", result: "topicId is required." };
        const index = readJsonFileSafe(path.join(TOPICS_DIR, "_index.json"), { topics: [] });
        const topic = index.topics.find((item) => item.id === topicId);
        if (!topic) return { action: actionName, status: "error", result: "Topic not found." };
        const content = readTextFileSafe(path.join(TOPICS_DIR, topic.file), "");
        return {
          action: actionName,
          status: "success",
          result: "Topic loaded: " + (topic.title || topicId),
          topic: { ...topic, content },
        };
      }

      case "review_topics_quality": {
        const limit = Math.max(1, Math.min(Number(params?.limit) || 10, 25));
        const quality = copilot.reviewTopics({ selection: params?.selection || null, limit });
        return {
          action: actionName,
          status: "success",
          result: quality.summary.warningCount + " topics need review.",
          summary: quality.summary,
          topics: quality.targets
            .filter((target) => target.warningCodes.length > 0)
            .slice(0, limit)
            .map((target) => ({
              id: target.id,
              title: target.label,
              warnings: target.warningCodes,
              matchedEntryCount: target.meta.matchedEntries?.length || 0,
            })),
        };
      }

      case "review_bot_files_quality": {
        const quality = copilot.reviewBotSettings({ selection: params?.selection || null, limit: 10 });
        return {
          action: actionName,
          status: "success",
          result: quality.summary.warningCount + " bot file warnings found.",
          summary: quality.summary,
          warnings: quality.targets
            .flatMap((target) => target.findings.map((finding) => ({
              filename: target.id,
              key: finding.messageKey,
              params: finding.params || {},
            }))),
        };
      }

      case "create_topic": {
        const id = String(params?.id || "").trim();
        const title = String(params?.title || "").trim();
        if (!id || !title) return { action: actionName, status: "error", result: "id and title are required." };
        if (!/^[a-z0-9-]+$/.test(id)) return { action: actionName, status: "error", result: "Invalid ID format." };

        const indexPath = path.join(TOPICS_DIR, "_index.json");
        const index = readJsonFileSafe(indexPath, { topics: [] });
        if (index.topics.find(t => t.id === id)) return { action: actionName, status: "error", result: "This ID already exists." };

        const filename = id + ".md";
        const newTopic = {
          id, title,
          keywords: Array.isArray(params?.keywords) ? params.keywords : [],
          file: filename,
          requiresEscalation: false,
          requiredInfo: [],
          canResolveDirectly: true,
        };
        index.topics.push(newTopic);
        fs.writeFileSync(indexPath, JSON.stringify(index, null, 2), "utf8");
        fs.writeFileSync(path.join(TOPICS_DIR, filename), params?.content || "", "utf8");
        loadAllAgentConfig();
        return { action: actionName, status: "success", result: "Topic created: " + title };
      }

      case "update_topic": {
        const topicId = String(params?.topicId || "").trim();
        if (!topicId) return { action: actionName, status: "error", result: "topicId is required." };

        const indexPath = path.join(TOPICS_DIR, "_index.json");
        const index = readJsonFileSafe(indexPath, { topics: [] });
        const topicIdx = index.topics.findIndex(t => t.id === topicId);
        if (topicIdx < 0) return { action: actionName, status: "error", result: "Topic not found." };

        const topic = index.topics[topicIdx];
        if (params?.title) topic.title = params.title;
        if (Array.isArray(params?.keywords)) topic.keywords = params.keywords;
        fs.writeFileSync(indexPath, JSON.stringify(index, null, 2), "utf8");

        if (typeof params?.content === "string") {
          fs.writeFileSync(path.join(TOPICS_DIR, topic.file), params.content, "utf8");
        }
        loadAllAgentConfig();
        invalidateTopicCache(topicId);
        return { action: actionName, status: "success", result: "Topic updated: " + topic.title };
      }

      // ── Config ──────────────────────────────────────────────────────
      case "read_config": {
        const configType = String(params?.type || "");
        if (configType === "chat-flow") {
          return { action: actionName, status: "success", result: JSON.stringify(getChatFlowConfig()), config: getChatFlowConfig() };
        }
        if (configType === "site-config") {
          return { action: actionName, status: "success", result: JSON.stringify(getSiteConfig()), config: getSiteConfig() };
        }
        if (configType === "sunshine-config") {
          const cfg = getSunshineConfig();
          const masked = { ...cfg };
          if (masked.keySecret) masked.keySecret = masked.keySecret.slice(0, 4) + "****";
          if (masked.webhookSecret) masked.webhookSecret = masked.webhookSecret.slice(0, 4) + "****";
          return { action: actionName, status: "success", result: JSON.stringify(masked), config: masked };
        }
        return { action: actionName, status: "error", result: "Invalid config type. Valid: chat-flow, site-config, sunshine-config" };
      }

      case "update_chat_flow": {
        if (!params?.config || typeof params.config !== "object") {
          return { action: actionName, status: "error", result: "config object is required." };
        }
        saveChatFlowConfig(params.config);
        return { action: actionName, status: "success", result: "Chat flow updated." };
      }

      case "update_site_config": {
        if (!params?.config || typeof params.config !== "object") {
          return { action: actionName, status: "error", result: "config object is required." };
        }
        saveSiteConfig(params.config);
        return { action: actionName, status: "success", result: "Appearance settings updated." };
      }

      case "update_sunshine_config": {
        if (!params?.config || typeof params.config !== "object") {
          return { action: actionName, status: "error", result: "config object is required." };
        }
        saveSunshineConfig(params.config);
        return { action: actionName, status: "success", result: "Zendesk integration updated." };
      }

      // ── File Processing ─────────────────────────────────────────────
      case "process_uploaded_file": {
        // This is handled specially at the endpoint level (file content is already in context)
        // Here we just confirm intent
        return { action: actionName, status: "success", result: "File processed and added to knowledge base." };
      }

      default:
        return { action: actionName, status: "error", result: "Handler not found." };
    }
  } catch (err) {
    logger.error("executeAction error:", actionName, err);
    return { action: actionName, status: "error", result: "Error: " + (err.message || String(err)) };
  }
}

// ── Build enriched system prompt with RAG + agent config context ──────
function buildEnrichedSystemPrompt(basePrompt, ragResults, agentConfigSummary, kbSize, qualitySnapshot) {
  const parts = [basePrompt];

  // Agent config context — current bot state
  if (agentConfigSummary) {
    const lines = ["\n\n## Current Bot Configuration (Live State)"];
    if (agentConfigSummary.soulText) {
      lines.push("### Soul (Core Identity)\n" + agentConfigSummary.soulText.slice(0, 500));
    }
    if (agentConfigSummary.personaText) {
      lines.push("### Persona (Personality)\n" + agentConfigSummary.personaText.slice(0, 500));
    }
    if (agentConfigSummary.domainText) {
      lines.push("### Domain (Domain Knowledge)\n" + agentConfigSummary.domainText.slice(0, 500));
    }
    if (agentConfigSummary.topicCount > 0) {
      lines.push("### Defined Topics (" + agentConfigSummary.topicCount + " total)\n" + agentConfigSummary.topicIndexSummary);
    }
    parts.push(lines.join("\n\n"));
  }

  // KB stats
  parts.push("\n\n## Knowledge Base Status\nTotal records: " + (kbSize || 0));

  if (qualitySnapshot) {
    const qualityLines = [
      "\n\n## Admin Content Quality Snapshot",
      "Knowledge base records needing review: " + qualitySnapshot.knowledge.warningCount,
      "Knowledge base records without topic match: " + qualitySnapshot.knowledge.unmatchedCount,
      "Topics needing review: " + qualitySnapshot.topics.warningCount,
      "Bot file warnings: " + qualitySnapshot.bot.warningCount,
    ];

    if (qualitySnapshot.knowledge.topIssues.length) {
      qualityLines.push(
        "Top KB issues: " +
        qualitySnapshot.knowledge.topIssues
          .slice(0, 4)
          .map((item) => `${item.id}:${item.question} [${item.warnings.join(", ")}]`)
          .join(" | ")
      );
    }

    if (qualitySnapshot.topics.topIssues.length) {
      qualityLines.push(
        "Top topic issues: " +
        qualitySnapshot.topics.topIssues
          .slice(0, 4)
          .map((item) => `${item.id} [${item.warnings.join(", ")}]`)
          .join(" | ")
      );
    }

    if (qualitySnapshot.bot.topIssues.length) {
      qualityLines.push(
        "Top bot file issues: " +
        qualitySnapshot.bot.topIssues
          .slice(0, 4)
          .map((item) => `${item.filename}:${item.key}`)
          .join(" | ")
      );
    }

    parts.push(qualityLines.join("\n"));
  }

  // RAG context — relevant KB entries for the current query
  if (Array.isArray(ragResults) && ragResults.length > 0) {
    const ragLines = ["\n\n## Knowledge Base Search Results (RAG)",
      "Existing knowledge base records potentially related to the user's message:", ""];
    for (const item of ragResults) {
      ragLines.push("Question: " + (item.question || ""));
      ragLines.push("Answer: " + (item.answer || ""));
      ragLines.push("");
    }
    parts.push(ragLines.join("\n"));
  }

  return parts.join("");
}

// ── Mount ────────────────────────────────────────────────────────────────
function mount(app, deps) {
  const {
    requireAdminAccess, callLLM, callLLMWithFallback, readTextFileSafe, readJsonFileSafe: _readJsonFileSafe, safeError,
    path, fs, AGENT_DIR, TOPICS_DIR: _TOPICS_DIR, MEMORY_DIR: _MEMORY_DIR, UPLOADS_DIR, logger,
    multer: multerLib, recordAuditEvent,
    loadCSVData, saveCSVData, reingestKnowledgeBase,
    // Qragy pipeline services
    searchKnowledge, getProviderConfig, getAgentConfigSummary, chunkText, contextualChunker,
  } = deps;

  const upload = multerLib({
    dest: UPLOADS_DIR,
    limits: { fileSize: 10 * 1024 * 1024, fieldSize: 128 * 1024, fields: 12 },
  });
  const copilot = createAdminContentCopilot(deps);

  app.post("/api/admin/assistant", requireAdminAccess, upload.single("file"), async (req, res) => {
    try {
      // ── Parse request (supports both JSON and FormData) ─────────
      let message = req.body?.message;
      const historyRaw = req.body?.history;
      const pendingActionsRaw = req.body?.pendingActions;
      const panel = String(req.body?.panel || "").trim();
      const locale = String(req.body?.locale || "tr").trim() === "en" ? "en" : "tr";
      const selectionRaw = req.body?.selection;

      if (typeof message !== "string") message = "";
      message = message.trim();
      if (message.length > ADMIN_ASSISTANT_MAX_MESSAGE_LENGTH) {
        return res.status(400).json({ error: buildAssistantInputTooLongError(locale, ADMIN_ASSISTANT_MAX_MESSAGE_LENGTH) });
      }

      // Parse history (could be JSON string from FormData)
      let history = [];
      if (typeof historyRaw === "string") {
        try { history = JSON.parse(historyRaw); } catch (_e) { history = []; }
      } else if (Array.isArray(historyRaw)) {
        history = historyRaw;
      }
      history = sanitizeAssistantHistory(history);

      let selection = null;
      if (typeof selectionRaw === "string" && selectionRaw.trim()) {
        try {
          selection = JSON.parse(selectionRaw);
        } catch (_error) {
          selection = null;
        }
      } else if (selectionRaw && typeof selectionRaw === "object") {
        selection = selectionRaw;
      }

      const copilotSurface = copilot.surfaceFromPanel(panel);
      const rewriteIntent = detectRewriteIntent(message);
      const reviewIntent = detectAutoReviewActions(message).length > 0;
      const copilotRequest = copilotSurface && selection
        ? {
            panel,
            surface: copilotSurface,
            target: selection,
            mode: rewriteIntent ? "draft" : "review",
            goal: message || "",
          }
        : null;

      if (copilotRequest && rewriteIntent) {
        return res.json({
          ok: true,
          reply: getCopilotOpenReply(locale, "draft", copilotSurface),
          copilot_request: copilotRequest,
        });
      }

      // ── Handle confirmation/cancellation ────────────────────────
      if (message === "__confirm_actions__") {
        let pendingActions = [];
        if (typeof pendingActionsRaw === "string") {
          try { pendingActions = JSON.parse(pendingActionsRaw); } catch (_e) { pendingActions = []; }
        } else if (Array.isArray(pendingActionsRaw)) {
          pendingActions = pendingActionsRaw;
        }

        const results = [];
        for (const act of pendingActions) {
          if (!ALLOWED_ACTIONS[act.action]) continue;
          const result = await executeAction(act.action, act.params, { ...deps, copilot });
          results.push(result);
          recordAuditEvent("assistant:" + act.action, ALLOWED_ACTIONS[act.action].description, req.ip);
        }
        return res.json({ ok: true, reply: "Actions completed.", actions_executed: results });
      }

      if (message === "__cancel_actions__") {
        return res.json({ ok: true, reply: "Actions cancelled." });
      }

      if (!message && !req.file) {
        return res.status(400).json({ error: "message or file is required." });
      }

      // ── Process uploaded file ───────────────────────────────────
      let fileContext = "";
      let fileImportPlan = null;

      if (req.file) {
        try {
          fileImportPlan = await prepareKnowledgeImport(req.file, {
            fs,
            path,
            chunkText,
            callLLM,
            contextualChunker,
            logger,
          }, {
            source: req.file.originalname,
          });
          fileContext = buildAssistantFileContext(req.file.originalname, fileImportPlan);
        } catch (fileErr) {
          logger.warn("Assistant file parse error:", fileErr);
          fileContext = "[UPLOADED FILE: " + req.file.originalname + "]\nFailed to read file: " + fileErr.message;
        } finally {
          // Cleanup temp file
          try { fs.unlinkSync(req.file.path); } catch (_e) { /* ignore */ }
        }
      }

      // ── Qragy Pipeline: RAG Search ────────────────────────────
      let ragResults = [];
      const searchQuery = message || "";
      if (searchQuery && searchKnowledge) {
        try {
          ragResults = await searchKnowledge(searchQuery, 5);
        } catch (ragErr) {
          logger.warn("assistant", "RAG search error", ragErr);
        }
      }

      // ── Qragy Pipeline: Agent Config Context ──────────────────
      let agentConfigSummary = null;
      if (getAgentConfigSummary) {
        try {
          agentConfigSummary = getAgentConfigSummary();
        } catch (_e) { /* ignore */ }
      }

      // ── Qragy Pipeline: KB Size + quality snapshot ───────────
      const kbRows = loadCSVData();
      const kbSize = kbRows.length;
      const qualitySnapshot = copilot.getQualitySnapshot();

      // ── Build enriched system prompt ──────────────────────────
      const basePrompt = readTextFileSafe(path.join(AGENT_DIR, "admin-assistant.md"), "")
        || "You are the Qragy admin panel assistant. Respond in English. Use JSON format.";
      const systemPrompt = buildEnrichedSystemPrompt(basePrompt, ragResults, agentConfigSummary, kbSize, qualitySnapshot);

      const messages = (Array.isArray(history) ? history : []).slice(-10).map(function (h) {
        return {
          role: h.role === "assistant" ? "model" : "user",
          parts: [{ text: String(h.content || "") }],
        };
      });

      // Compose current user message
      let userText = message || "";
      if (fileContext) {
        userText = (userText ? userText + "\n\n" : "") + fileContext;
      }
      if (copilotRequest) {
        userText = [
          userText,
          "",
          "Selected admin context:",
          JSON.stringify({
            panel: copilotRequest.panel,
            surface: copilotRequest.surface,
            target: copilotRequest.target,
          }),
        ].filter(Boolean).join("\n");
      }
      if (!userText) userText = "Hello";
      messages.push({ role: "user", parts: [{ text: userText }] });

      // ── Qragy Pipeline: Provider Config ───────────────────────
      const providerCfg = getProviderConfig ? getProviderConfig() : {};
      const modelOverride = process.env.ADMIN_ASSISTANT_MODEL || undefined;
      const llmOptions = modelOverride ? { ...providerCfg, model: modelOverride } : providerCfg;
      const maxTokens = Math.min(
        Math.max(llmOptions.maxOutputTokens || 2048, 2048),
        ASSISTANT_MAX_OUTPUT_TOKENS
      );

      // ── Agent Loop (max 3 iterations) ───────────────────────────
      let iterations = 0;
      const allExecutedActions = [];
      let finalReply = "";
      const autoReviewActions = detectAutoReviewActions(message);

      if (autoReviewActions.length) {
        const autoResults = [];
        for (const action of autoReviewActions) {
          const result = await executeAction(action.action, action.params, { ...deps, copilot });
          autoResults.push(result);
          allExecutedActions.push(result);
        }
        messages.push({
          role: "user",
          parts: [{ text: "Preloaded quality review context based on the admin request:\n" + JSON.stringify(autoResults) }],
        });
      }

      if (copilotRequest && reviewIntent) {
        messages.push({
          role: "user",
          parts: [{ text: "The admin currently has a selected item open in the panel. If useful, refer them to the page copilot panel instead of proposing direct edits." }],
        });
      }

      while (iterations < MAX_ITERATIONS) {
        let llmResult;
        try {
          llmResult = await callAssistantModel({
            messages,
            systemPrompt,
            maxTokens,
            options: llmOptions,
            callLLM,
            callLLMWithFallback,
            logger,
          });
        } catch (error) {
          logger.warn("assistant", "assistant_model_unavailable", {
            error: error.message,
            model: llmOptions.model || "",
          });
          return res.json({
            ok: true,
            reply: buildAssistantUnavailableReply(locale, {
              copilotRequest,
              hasReviewData: allExecutedActions.length > 0,
            }),
            actions_executed: allExecutedActions.length > 0 ? allExecutedActions : undefined,
            copilot_request: copilotRequest && reviewIntent ? copilotRequest : undefined,
            degraded: true,
          });
        }

        let parsed = parseAssistantResponse(llmResult.reply);
        if (shouldRecoverAssistantReply(parsed, llmResult)) {
          messages.push({ role: "model", parts: [{ text: llmResult.reply || "" }] });
          messages.push({
            role: "user",
            parts: [{
              text: "Your previous response was incomplete. Return a compact JSON object only, with a concise reply and valid actions. Do not add extra commentary.",
            }],
          });

          try {
            llmResult = await callAssistantModel({
              messages,
              systemPrompt,
              maxTokens: Math.min(maxTokens, ASSISTANT_RECOVERY_MAX_OUTPUT_TOKENS),
              options: buildAssistantRecoveryOptions(llmOptions),
              callLLM,
              callLLMWithFallback,
              logger,
            });
            parsed = parseAssistantResponse(llmResult.reply);
          } catch (error) {
            logger.warn("assistant", "assistant_recovery_failed", {
              error: error.message,
              model: llmOptions.model || "",
            });
            return res.json({
              ok: true,
              reply: buildAssistantUnavailableReply(locale, {
                copilotRequest,
                hasReviewData: allExecutedActions.length > 0,
              }),
              actions_executed: allExecutedActions.length > 0 ? allExecutedActions : undefined,
              copilot_request: copilotRequest && reviewIntent ? copilotRequest : undefined,
              degraded: true,
            });
          }
        }

        if (!parsed.reply && !parsed.actions.length) {
          return res.json({
            ok: true,
            reply: buildAssistantUnavailableReply(locale, {
              copilotRequest,
              hasReviewData: allExecutedActions.length > 0,
            }),
            actions_executed: allExecutedActions.length > 0 ? allExecutedActions : undefined,
            copilot_request: copilotRequest && reviewIntent ? copilotRequest : undefined,
            degraded: true,
          });
        }

        finalReply = parsed.reply;

        // ── Qragy Pipeline: Response Validation ─────────────────
        const validation = validateBotResponse(finalReply, locale);
        if (!validation.valid && validation.reason === "hallucination_marker") {
          // Strip hallucinated content, retry once
          logger.warn("assistant", "Hallucination detected, retrying", validation.reason);
          messages.push({ role: "model", parts: [{ text: llmResult.reply }] });
          messages.push({ role: "user", parts: [{ text: "WARNING: Hallucination detected in previous response. Please respond again following the rules, in JSON format." }] });
          iterations++;
          continue;
        }

        // No actions — return reply
        if (!parsed.actions.length) break;

        // Check for dangerous actions — return pending for confirmation
        const hasDangerous = parsed.actions.some(a => ALLOWED_ACTIONS[a.action]?.dangerous);
        if (hasDangerous) {
          return res.json({
            ok: true,
            reply: parsed.reply,
            pending_actions: parsed.actions,
            actions_executed: allExecutedActions.length > 0 ? allExecutedActions : undefined,
          });
        }

        // Execute safe actions
        const results = [];
        for (const act of parsed.actions) {
          // Special handling: process_uploaded_file with actual file data
          if (act.action === "process_uploaded_file" && fileImportPlan?.entries?.length) {
            const rows = loadCSVData();
            const added = mergeKnowledgeEntries(rows, fileImportPlan.entries);
            if (added > 0) {
              saveCSVData(rows);
              await reingestKnowledgeBase();
            }
            results.push({
              action: "process_uploaded_file",
              status: "success",
              result: added + " entries added to knowledge base.",
              count: added,
              mode: fileImportPlan.mode,
              truncated: Boolean(fileImportPlan.truncated),
            });
            recordAuditEvent("assistant:process_uploaded_file", added + " entries added", req.ip);
          } else {
            const result = await executeAction(act.action, act.params, { ...deps, copilot });
            results.push(result);
            recordAuditEvent("assistant:" + act.action, ALLOWED_ACTIONS[act.action]?.description || act.action, req.ip);
          }
          allExecutedActions.push(results[results.length - 1]);
        }

        // Feed results back to LLM for next iteration
        messages.push({ role: "model", parts: [{ text: llmResult.reply }] });
        messages.push({ role: "user", parts: [{ text: "Action results:\n" + JSON.stringify(results) }] });

        iterations++;
      }

      return res.json({
        ok: true,
        reply: finalReply,
        actions_executed: allExecutedActions.length > 0 ? allExecutedActions : undefined,
        copilot_request: copilotRequest && reviewIntent ? copilotRequest : undefined,
      });
    } catch (err) {
      logger.error("Admin assistant error:", err);
      return res.status(500).json({ error: safeError(err, "api") });
    }
  });
}

module.exports = {
  mount,
  callAssistantModel,
  shouldRecoverAssistantReply,
  buildAssistantUnavailableReply,
  parseAssistantResponse,
  sanitizeProfessionalAssistantText,
};

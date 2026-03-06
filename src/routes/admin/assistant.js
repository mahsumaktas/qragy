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

// ── Parse LLM Response ──────────────────────────────────────────────────
function parseAssistantResponse(rawText) {
  if (!rawText || typeof rawText !== "string") {
    return { reply: rawText || "", actions: [] };
  }

  // Try ```json ... ``` block first
  const fencedMatch = rawText.match(/```json\s*([\s\S]*?)```/);
  if (fencedMatch) {
    try {
      const parsed = JSON.parse(fencedMatch[1].trim());
      return {
        reply: parsed.reply || "",
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
          reply: parsed.reply || "",
          actions: Array.isArray(parsed.actions) ? parsed.actions : [],
        };
      }
    } catch (_e) { /* fall through */ }
  }

  // Fallback: treat entire text as plain reply
  return { reply: rawText, actions: [] };
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

// ── File Text Extraction (reused from knowledge.js patterns) ─────────
async function extractTextFromFile(filePath, mimetype, originalname, deps) {
  const ext = deps.path.extname(originalname).toLowerCase();

  if (ext === ".txt" || mimetype === "text/plain") {
    return deps.fs.readFileSync(filePath, "utf8");
  }
  if (ext === ".pdf" || mimetype === "application/pdf") {
    const pdfParse = require("pdf-parse");
    const buffer = deps.fs.readFileSync(filePath);
    const data = await pdfParse(buffer);
    return data.text || "";
  }
  if (ext === ".docx" || mimetype === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
    const mammoth = require("mammoth");
    const result = await mammoth.extractRawText({ path: filePath });
    return result.value || "";
  }
  if (ext === ".xlsx" || ext === ".xls") {
    const XLSX = require("xlsx");
    const workbook = XLSX.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) return "(empty xlsx)";
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });
    return rows.map(r => Object.values(r).join(" | ")).join("\n");
  }
  throw new Error("Unsupported file format: " + ext);
}

// ── Extract Q/A pairs from XLSX (reused from knowledge.js) ──────────
function extractQAFromXlsx(filePath, _deps) {
  const XLSX = require("xlsx");
  const workbook = XLSX.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return [];

  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });
  if (!rows.length) return [];

  const headers = Object.keys(rows[0]).map(h => h.toLowerCase().trim());
  const qHeaders = ["soru", "question", "q"];
  const aHeaders = ["cevap", "answer", "a", "yanit"];

  let qCol = null, aCol = null;
  for (const h of headers) {
    if (!qCol && qHeaders.some(qh => h.includes(qh))) qCol = Object.keys(rows[0])[headers.indexOf(h)];
    if (!aCol && aHeaders.some(ah => h.includes(ah))) aCol = Object.keys(rows[0])[headers.indexOf(h)];
  }
  if (!qCol || !aCol) {
    const keys = Object.keys(rows[0]);
    qCol = keys[0];
    aCol = keys[1] || keys[0];
  }

  const pairs = [];
  for (const row of rows) {
    const q = String(row[qCol] || "").trim();
    const a = String(row[aCol] || "").trim();
    if (q && a) pairs.push({ question: q, answer: a });
  }
  return pairs;
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
    requireAdminAccess, callLLM, readTextFileSafe, readJsonFileSafe: _readJsonFileSafe, safeError,
    path, fs, AGENT_DIR, TOPICS_DIR: _TOPICS_DIR, MEMORY_DIR: _MEMORY_DIR, UPLOADS_DIR, logger,
    multer: multerLib, recordAuditEvent,
    loadCSVData, saveCSVData, reingestKnowledgeBase,
    // Qragy pipeline services
    searchKnowledge, getProviderConfig, getAgentConfigSummary,
  } = deps;

  const upload = multerLib({ dest: UPLOADS_DIR, limits: { fileSize: 10 * 1024 * 1024 } });
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

      // Parse history (could be JSON string from FormData)
      let history = [];
      if (typeof historyRaw === "string") {
        try { history = JSON.parse(historyRaw); } catch (_e) { history = []; }
      } else if (Array.isArray(historyRaw)) {
        history = historyRaw;
      }

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
      let fileQAPairs = null;

      if (req.file) {
        try {
          const ext = path.extname(req.file.originalname).toLowerCase();

          // XLSX: try Q/A extraction first
          if (ext === ".xlsx" || ext === ".xls") {
            const pairs = extractQAFromXlsx(req.file.path, deps);
            if (pairs.length > 0) {
              fileQAPairs = pairs;
              fileContext = "[UPLOADED FILE: " + req.file.originalname + "]\n" +
                pairs.length + " Q&A pairs extracted from file:\n" +
                pairs.slice(0, 10).map((p, i) => (i + 1) + ". Q: " + p.question + " | A: " + p.answer).join("\n") +
                (pairs.length > 10 ? "\n... and " + (pairs.length - 10) + " more records." : "");
            }
          }

          // Other formats: text extraction
          if (!fileContext) {
            const text = await extractTextFromFile(req.file.path, req.file.mimetype, req.file.originalname, deps);
            fileContext = "[UPLOADED FILE: " + req.file.originalname + "]\n" + text.slice(0, 8000);
          }
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
      const maxTokens = Math.max(llmOptions.maxOutputTokens || 4096, 4096);

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
        const llmResult = await callLLM(messages, systemPrompt, maxTokens, llmOptions);
        const parsed = parseAssistantResponse(llmResult.reply);
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
          if (act.action === "process_uploaded_file" && fileQAPairs && fileQAPairs.length > 0) {
            const rows = loadCSVData();
            let added = 0;
            for (const p of fileQAPairs) {
              if (p.question && p.answer) { rows.push({ question: p.question, answer: p.answer }); added++; }
            }
            if (added > 0) {
              saveCSVData(rows);
              await reingestKnowledgeBase();
            }
            results.push({ action: "process_uploaded_file", status: "success", result: added + " entries added to knowledge base.", count: added });
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

module.exports = { mount };

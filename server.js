require("dotenv").config();

const fs = require("fs");
const crypto = require("crypto");
const express = require("express");
const path = require("path");
const { callLLM, callLLMWithFallback, embedText, getProviderConfig } = require("./lib/providers");
const { chunkText } = require("./lib/chunker");
const sqliteDb = require("./lib/db");
const lancedb = require("@lancedb/lancedb");
const Papa = require("papaparse");
const multer = require("multer");
const CSV_EXAMPLE_FILE = path.join(__dirname, "knowledge_base.example.csv");
const CSV_FILE = path.join(__dirname, "data", "knowledge_base.csv");

// ── Config ───────────────────────────────────────────────────────────────
const { loadConfig, validateConfigStrict } = require("./src/config");
const { logger } = require("./src/utils/logger");
const config = loadConfig();
const { warnings: configWarnings, errors: configErrors } = validateConfigStrict(config);
if (configWarnings.length > 0) {
  configWarnings.forEach((w) => logger.warn("config", w));
}
if (configErrors.length > 0) {
  configErrors.forEach((e) => logger.error("config", e));
  if ((process.env.NODE_ENV || "").toLowerCase() !== "test") {
    process.exit(1);
  }
}

// ── Modular imports ──────────────────────────────────────────────────────
const { createRateLimiter } = require("./src/middleware/rateLimiter.js");
const { createAuthMiddleware } = require("./src/middleware/auth.js");
const { securityHeaders } = require("./src/middleware/security.js");
const { detectInjection, validateOutput, GENERIC_REPLY } = require("./src/middleware/injectionGuard.js");
const { maskPII, normalizeForMatching, maskCredentials } = require("./src/utils/sanitizer.js");
const { validateBotResponse: validateBotResponseFn } = require("./src/services/responseValidator.js");
const { invalidateTopicCache } = require("./src/services/topic.js");
const { RAG_DISTANCE_THRESHOLD, formatCitations } = require("./src/services/rag.js");
const { safeError } = require("./src/utils/errorHelper.js");
const chatEngine = require("./src/services/chatEngine");
const { createAnalyticsService } = require("./src/services/analytics");
const { createWebhookService } = require("./src/services/webhooks");
const { createConfigStore } = require("./src/services/configStore");
const { createSupportHoursService } = require("./src/services/supportHours");
const { createKnowledgeService } = require("./src/services/knowledge");
const { createPromptBuilder } = require("./src/services/promptBuilder");
const { createUserMemory } = require("./src/services/userMemory");
const { createConversationUtils } = require("./src/services/conversationUtils");
const { createLLMHealthService } = require("./src/services/llmHealth");
const { createFeedbackAnalyzer } = require("./src/services/feedbackAnalyzer");
// ── Next-Gen RAG & Memory imports ────────────────────────────────────────
const { createSearchEngine } = require("./src/services/rag/searchEngine");
const { createReranker } = require("./src/services/rag/reranker");
const { createQueryAnalyzer } = require("./src/services/rag/queryAnalyzer");
const { createCragEvaluator } = require("./src/services/rag/cragEvaluator");
const { createContextualChunker } = require("./src/services/rag/contextualChunker");
const { createCoreMemory } = require("./src/services/memory/coreMemory");
const { createRecallMemory } = require("./src/services/memory/recallMemory");
const { createMemoryEngine } = require("./src/services/memory/memoryEngine");
const { createQualityScorer } = require("./src/services/intelligence/qualityScorer");
const { createReflexion } = require("./src/services/intelligence/reflexion");
const { createGraphBuilder } = require("./src/services/intelligence/graphBuilder");
const { createGraphQuery } = require("./src/services/intelligence/graphQuery");
const { createChatPipeline } = require("./src/services/pipeline/chatPipeline");
const { createUrlExtractor } = require("./src/services/urlExtractor");
const ticketHelpersModule = require("./src/utils/ticketHelpers.js");
const { nowIso } = ticketHelpersModule;
const { createAdminHelpers } = require("./src/utils/adminHelpers");

const app = express();

// ── Global error handlers ───────────────────────────────────────────────
process.on("unhandledRejection", (reason) => {
  logger.error("process", "Unhandled rejection", reason);
});
process.on("uncaughtException", (err) => {
  logger.error("process", "Uncaught exception", err);
  process.exit(1);
});

// ── App Context (paylasilan state) ──────────────────────────────────────
const { createAppContext } = require("./src/context");
const ctx = createAppContext();
// LLM health service (state encapsulated inside factory)
const llmHealth = createLLMHealthService({ logger, callLLM, getProviderConfig });

// ── Config-backed runtime vars (let = admin API ile degistirilebilir) ───
const PORT = config.port;
let GOOGLE_API_KEY = config.googleApiKey;
let GOOGLE_MODEL = config.googleModel;
let GOOGLE_MAX_OUTPUT_TOKENS = config.googleMaxOutputTokens;
let GOOGLE_THINKING_BUDGET = config.googleThinkingBudget;
let GOOGLE_REQUEST_TIMEOUT_MS = config.googleRequestTimeoutMs;
let ZENDESK_SNIPPET_KEY = config.zendeskSnippetKey;
let ZENDESK_ENABLED = config.zendeskEnabled;
let ZENDESK_DEFAULT_TAGS = config.zendeskDefaultTags;
let SUPPORT_HOURS_ENABLED = config.supportHoursEnabled;
let SUPPORT_TIMEZONE = config.supportTimezone;
let SUPPORT_OPEN_HOUR = config.supportOpenHour;
let SUPPORT_CLOSE_HOUR = config.supportCloseHour;
let SUPPORT_OPEN_DAYS = config.supportOpenDays;
let DETERMINISTIC_COLLECTION_MODE = config.deterministicCollectionMode;
let ADMIN_TOKEN = config.adminToken;
let BOT_NAME = config.botName;
let COMPANY_NAME = config.companyName;
let REMOTE_TOOL_NAME = config.remoteToolName;
let RATE_LIMIT_ENABLED = config.rateLimitEnabled;
let RATE_LIMIT_MAX = config.rateLimitMax;
let RATE_LIMIT_WINDOW_MS = config.rateLimitWindowMs;
let _GOOGLE_FALLBACK_MODEL = config.googleFallbackModel;
let TELEGRAM_ENABLED = config.telegramEnabled;
let TELEGRAM_BOT_TOKEN = config.telegramBotToken;
const TELEGRAM_POLLING_INTERVAL_MS = config.telegramPollingIntervalMs;
let ZENDESK_SC_ENABLED = config.zendeskScEnabled;
let ZENDESK_SC_APP_ID = config.zendeskScAppId;
let ZENDESK_SC_KEY_ID = config.zendeskScKeyId;
let ZENDESK_SC_KEY_SECRET = config.zendeskScKeySecret;
let ZENDESK_SC_WEBHOOK_SECRET = config.zendeskScWebhookSecret;
let ZENDESK_SC_SUBDOMAIN = config.zendeskScSubdomain;
let DEPLOY_WEBHOOK_SECRET = config.deployWebhookSecret;
const DATA_RETENTION_DAYS = config.dataRetentionDays;

// ── Time Constants ──────────────────────────────────────────────────────
const MS_PER_DAY = 86400000;
const INACTIVITY_CHECK_MS = 60000;
const WEB_INACTIVITY_CHECK_MS = 5 * 60 * 1000;
const LLM_HEALTH_INITIAL_DELAY_MS = 10000;
const LLM_HEALTH_INTERVAL_MS = 5 * 60 * 1000;
const GRACEFUL_SHUTDOWN_FORCE_MS = 10000;
const STALE_SESSION_DAYS = 7;

// ── Path Constants ──────────────────────────────────────────────────────
const AGENT_DIR = config.agentDir;
const TOPICS_DIR = config.topicsDir;
const MEMORY_DIR = config.memoryDir;
const DATA_DIR = config.dataDir;
const LANCE_DB_PATH = config.lanceDbPath;
const TELEGRAM_SESSIONS_FILE = path.join(DATA_DIR, "telegram-sessions.json");
const PROMPT_VERSIONS_FILE = path.join(DATA_DIR, "prompt-versions.json");
const UPLOADS_DIR = config.uploadsDir;
const CHAT_FLOW_CONFIG_FILE = path.join(DATA_DIR, "chat-flow-config.json");
const SITE_CONFIG_FILE = path.join(DATA_DIR, "site-config.json");
const SUNSHINE_SESSIONS_FILE = path.join(DATA_DIR, "sunshine-sessions.json");
const SUNSHINE_CONFIG_FILE = path.join(DATA_DIR, "sunshine-config.json");
const WHATSAPP_CONFIG_FILE = path.join(DATA_DIR, "whatsapp-config.json");
const SETUP_COMPLETE_FILE = path.join(DATA_DIR, "setup-complete.json");
const FEEDBACK_FILE = path.join(DATA_DIR, "feedback.json");
const CONTENT_GAPS_FILE = path.join(DATA_DIR, "content-gaps.json");

// ── Rate Limiter (modular) ──────────────────────────────────────────────
const rateLimiter = createRateLimiter({ maxRequests: RATE_LIMIT_MAX, windowMs: RATE_LIMIT_WINDOW_MS });
function checkRateLimit(ip) {
  if (!RATE_LIMIT_ENABLED) return true;
  return rateLimiter.check(ip);
}

// ── Admin Rate Limiter ──────────────────────────────────────────────────
const adminRateLimiter = createRateLimiter({ maxRequests: 100, windowMs: 60000 });

// ── Analytics Service ────────────────────────────────────────────────────
let analyticsData = ctx.analyticsData;
const analytics = createAnalyticsService({
  sqliteDb, logger, maskPII,
  analyticsBuffer: ctx.analyticsBuffer,
  getAnalyticsData: () => analyticsData,
  setAnalyticsData: (d) => { analyticsData = d; },
});
const { loadAnalyticsData, saveAnalyticsData, recordAnalyticsEvent, flushAnalyticsBuffer, recordCsatAnalytics } = analytics;
analytics.startPeriodicFlush();

// ── Job Queue Service ────────────────────────────────────────────────────
const { createJobQueue } = require("./src/services/jobQueue");
const jobQueue = createJobQueue({ sqliteDb: { getDb: () => sqliteDb.db }, logger });

// ── Webhook Service ──────────────────────────────────────────────────────
const webhookService = createWebhookService({ fs, path, crypto, logger, dataDir: DATA_DIR, nowIso, getJobQueue: () => jobQueue });
const { loadWebhooks, saveWebhooks, loadWebhookDeliveryLog, fireWebhook } = webhookService;

// ── Config Store Service ────────────────────────────────────────────────
const configStore = createConfigStore({
  fs, logger,
  paths: {
    chatFlowConfigFile: CHAT_FLOW_CONFIG_FILE,
    siteConfigFile: SITE_CONFIG_FILE,
    sunshineConfigFile: SUNSHINE_CONFIG_FILE,
    telegramSessionsFile: TELEGRAM_SESSIONS_FILE,
    sunshineSessionsFile: SUNSHINE_SESSIONS_FILE,
    whatsappConfigFile: WHATSAPP_CONFIG_FILE,
    promptVersionsFile: PROMPT_VERSIONS_FILE,
    setupCompleteFile: SETUP_COMPLETE_FILE,
  }
});
const {
  getChatFlowConfig, loadChatFlowConfig, saveChatFlowConfig, DEFAULT_CHAT_FLOW_CONFIG,
  getSiteConfig, loadSiteConfig, saveSiteConfig, DEFAULT_SITE_CONFIG,
  getSunshineConfig, loadSunshineConfig, saveSunshineConfig, DEFAULT_SUNSHINE_CONFIG,
  getWhatsAppConfig, saveWhatsAppConfig,
  loadTelegramSessions, saveTelegramSessions,
  loadSunshineSessions, saveSunshineSessions,
  loadPromptVersions, savePromptVersion,
  isSetupComplete, markSetupComplete,
} = configStore;

// ── Feedback Analyzer ────────────────────────────────────────────────────────────
const feedbackAnalyzer = createFeedbackAnalyzer({ logger });

// ── Conversation Manager ──────────────────────────────────────────────────────────
const { createConversationManager } = require("./src/services/conversationManager");
const conversationMgr = createConversationManager({
  sqliteDb, logger, clarificationCounters: ctx.clarificationCounters,
});
const { loadConversations, saveConversations, upsertConversation,
  getClarificationKey, incrementClarificationCount, resetClarificationCount } = conversationMgr;

// ── Agent Config Service ──────────────────────────────────────────────────────────
const { createAgentConfigService } = require("./src/services/agentConfig");
const agentConfig = createAgentConfigService({
  fs, path, logger,
  agentDir: AGENT_DIR, topicsDir: TOPICS_DIR, memoryDir: MEMORY_DIR,
  getBotName: () => BOT_NAME, getCompanyName: () => COMPANY_NAME,
  topicFileCache: ctx.topicFileCache,
});
const { readTextFileSafe, readJsonFileSafe, loadAllAgentConfig, loadTopicFile, getTopicMeta } = agentConfig;

// ── Ticket Store Service ───────────────────────────────────────────────────────────
const { createTicketStore } = require("./src/services/ticketStore");
const ticketStore = createTicketStore({
  fs, sqliteDb, logger, ticketHelpers: ticketHelpersModule,
  getGoogleModel: () => GOOGLE_MODEL, getSupportTimezone: () => SUPPORT_TIMEZONE,
  dataDir: DATA_DIR, csvExampleFile: CSV_EXAMPLE_FILE, csvFile: CSV_FILE,
});
const { TICKET_STATUS, HANDOFF_RESULT_STATUS_MAP, ACTIVE_TICKET_STATUSES,
  loadTicketsDb, saveTicketsDb,
  findRecentDuplicateTicket, createOrReuseTicket,
  updateTicketHandoffResult, getAdminSummary, sanitizeTicketForList } = ticketStore;

// Auth middleware — modular (src/middleware/auth.js)
const requireAdminAccess = createAuthMiddleware(() => ADMIN_TOKEN);

const adminHelpers = createAdminHelpers({
  fs, path, Papa, logger, csvFile: CSV_FILE, envDir: __dirname,
});
const { loadCSVData, saveCSVData, readEnvFile, writeEnvFile, isValidFilename } = adminHelpers;

function reloadRuntimeEnv() {
  const env = readEnvFile();
  if (env.GOOGLE_API_KEY) GOOGLE_API_KEY = env.GOOGLE_API_KEY;
  if (env.GOOGLE_MODEL) GOOGLE_MODEL = env.GOOGLE_MODEL;
  if (env.GOOGLE_MAX_OUTPUT_TOKENS) GOOGLE_MAX_OUTPUT_TOKENS = Number(env.GOOGLE_MAX_OUTPUT_TOKENS) || GOOGLE_MAX_OUTPUT_TOKENS;
  if (env.GOOGLE_THINKING_BUDGET !== undefined) GOOGLE_THINKING_BUDGET = Number(env.GOOGLE_THINKING_BUDGET);
  if (env.GOOGLE_REQUEST_TIMEOUT_MS) GOOGLE_REQUEST_TIMEOUT_MS = Number(env.GOOGLE_REQUEST_TIMEOUT_MS) || GOOGLE_REQUEST_TIMEOUT_MS;
  if (env.GOOGLE_FALLBACK_MODEL !== undefined) _GOOGLE_FALLBACK_MODEL = (env.GOOGLE_FALLBACK_MODEL || "").trim();
  if (env.BOT_NAME) BOT_NAME = env.BOT_NAME.trim();
  if (env.COMPANY_NAME !== undefined) COMPANY_NAME = (env.COMPANY_NAME || "").trim();
  if (env.REMOTE_TOOL_NAME !== undefined) REMOTE_TOOL_NAME = (env.REMOTE_TOOL_NAME || "").trim();
  if (env.RATE_LIMIT_ENABLED !== undefined) RATE_LIMIT_ENABLED = /^(1|true|yes)$/i.test(env.RATE_LIMIT_ENABLED);
  if (env.RATE_LIMIT_MAX) RATE_LIMIT_MAX = Number(env.RATE_LIMIT_MAX) || RATE_LIMIT_MAX;
  if (env.RATE_LIMIT_WINDOW_MS) RATE_LIMIT_WINDOW_MS = Number(env.RATE_LIMIT_WINDOW_MS) || RATE_LIMIT_WINDOW_MS;
  if (env.DETERMINISTIC_COLLECTION_MODE !== undefined) DETERMINISTIC_COLLECTION_MODE = !/^(0|false|no)$/i.test(env.DETERMINISTIC_COLLECTION_MODE || "true");
  if (env.SUPPORT_HOURS_ENABLED !== undefined) SUPPORT_HOURS_ENABLED = /^(1|true|yes)$/i.test(env.SUPPORT_HOURS_ENABLED);
  if (env.SUPPORT_TIMEZONE) SUPPORT_TIMEZONE = env.SUPPORT_TIMEZONE;
  if (env.SUPPORT_OPEN_HOUR !== undefined) SUPPORT_OPEN_HOUR = Number(env.SUPPORT_OPEN_HOUR);
  if (env.SUPPORT_CLOSE_HOUR !== undefined) SUPPORT_CLOSE_HOUR = Number(env.SUPPORT_CLOSE_HOUR);
  if (env.SUPPORT_OPEN_DAYS) SUPPORT_OPEN_DAYS = env.SUPPORT_OPEN_DAYS.split(",").map(d => Number(d.trim())).filter(d => d >= 1 && d <= 7);
  if (env.ADMIN_TOKEN !== undefined) ADMIN_TOKEN = (env.ADMIN_TOKEN || "").trim();
  if (env.ZENDESK_SC_ENABLED !== undefined) ZENDESK_SC_ENABLED = /^(1|true|yes)$/i.test(env.ZENDESK_SC_ENABLED);
  if (env.ZENDESK_SC_APP_ID !== undefined) ZENDESK_SC_APP_ID = (env.ZENDESK_SC_APP_ID || "").trim();
  if (env.ZENDESK_SC_KEY_ID !== undefined) ZENDESK_SC_KEY_ID = (env.ZENDESK_SC_KEY_ID || "").trim();
  if (env.ZENDESK_SC_KEY_SECRET !== undefined) ZENDESK_SC_KEY_SECRET = (env.ZENDESK_SC_KEY_SECRET || "").trim();
  if (env.ZENDESK_SC_WEBHOOK_SECRET !== undefined) ZENDESK_SC_WEBHOOK_SECRET = (env.ZENDESK_SC_WEBHOOK_SECRET || "").trim();
  if (env.ZENDESK_SC_SUBDOMAIN !== undefined) ZENDESK_SC_SUBDOMAIN = (env.ZENDESK_SC_SUBDOMAIN || "").trim();
  if (env.ZENDESK_ENABLED !== undefined) ZENDESK_ENABLED = /^(1|true|yes)$/i.test(env.ZENDESK_ENABLED) || Boolean((env.ZENDESK_SNIPPET_KEY || "").trim());
  if (env.ZENDESK_SNIPPET_KEY !== undefined) ZENDESK_SNIPPET_KEY = (env.ZENDESK_SNIPPET_KEY || "").trim();
  if (env.ZENDESK_DEFAULT_TAGS !== undefined) ZENDESK_DEFAULT_TAGS = (env.ZENDESK_DEFAULT_TAGS || "").split(",").map(t => t.trim()).filter(Boolean);
  if (env.TELEGRAM_ENABLED !== undefined) TELEGRAM_ENABLED = /^(1|true|yes)$/i.test(env.TELEGRAM_ENABLED);
  if (env.TELEGRAM_BOT_TOKEN !== undefined) TELEGRAM_BOT_TOKEN = (env.TELEGRAM_BOT_TOKEN || "").trim();
  if (env.DEPLOY_WEBHOOK_SECRET !== undefined) DEPLOY_WEBHOOK_SECRET = (env.DEPLOY_WEBHOOK_SECRET || "").trim();
  // LLM/Embedding provider vars are read directly from process.env by lib/providers.js
  // Sync new vars to process.env so getProviderConfig() picks them up
  const providerKeys = ["LLM_PROVIDER", "LLM_API_KEY", "LLM_MODEL", "LLM_BASE_URL", "LLM_FALLBACK_MODELS", "LLM_FALLBACK_MODEL", "LLM_MAX_OUTPUT_TOKENS", "LLM_REQUEST_TIMEOUT_MS", "ENABLE_THINKING", "EMBEDDING_PROVIDER", "EMBEDDING_MODEL", "EMBEDDING_API_KEY", "EMBEDDING_BASE_URL", "EMBEDDING_DIMENSIONS", "GOOGLE_API_KEY", "GEMINI_API_KEY", "GOOGLE_MODEL", "GOOGLE_MAX_OUTPUT_TOKENS", "GOOGLE_THINKING_BUDGET", "GOOGLE_REQUEST_TIMEOUT_MS", "GOOGLE_FALLBACK_MODEL"];
  for (const key of providerKeys) {
    if (env[key] !== undefined) process.env[key] = env[key];
  }
  logger.info("env", `Runtime degiskenleri guncellendi. Model: ${GOOGLE_MODEL}`);
}


// ── Support Hours Service ───────────────────────────────────────────────
const supportHours = createSupportHoursService({
  getEnabled: () => SUPPORT_HOURS_ENABLED,
  getTimezone: () => SUPPORT_TIMEZONE,
  getOpenHour: () => SUPPORT_OPEN_HOUR,
  getCloseHour: () => SUPPORT_CLOSE_HOUR,
  getOpenDays: () => SUPPORT_OPEN_DAYS,
});
const { getSupportAvailability } = supportHours;


// ── Prompt Builder Service ──────────────────────────────────────────────
const promptBuilder = createPromptBuilder({
  getAgentTexts: () => ({
    SOUL_TEXT: agentConfig.getSoulText(), PERSONA_TEXT: agentConfig.getPersonaText(),
    BOOTSTRAP_TEXT: agentConfig.getBootstrapText(), DOMAIN_TEXT: agentConfig.getDomainText(),
    SKILLS_TEXT: agentConfig.getSkillsText(), HARD_BANS_TEXT: agentConfig.getHardBansText(),
    ESCALATION_MATRIX_TEXT: agentConfig.getEscalationMatrixText(),
    RESPONSE_POLICY_TEXT: agentConfig.getResponsePolicyText(),
    DOD_TEXT: agentConfig.getDodText(), OUTPUT_FILTER_TEXT: agentConfig.getOutputFilterText(),
  }),
  getTopicIndexSummary: agentConfig.getTopicIndexSummary,
  loadTopicFile,
  getTopicMeta,
  getMemoryTemplate: agentConfig.getMemoryTemplate,
  logger,
});
const { buildSystemPrompt } = promptBuilder;

// ── User Memory Service ─────────────────────────────────────────────────
const userMemory = createUserMemory({ sqliteDb: { getDb: () => sqliteDb.db }, logger });

// buildGenerationConfig, callGemini, callGeminiWithFallback — moved to lib/providers.js

// ── Knowledge Service ───────────────────────────────────────────────────
const knowledgeService = createKnowledgeService({
  lancedb, embedText, loadCSVData, logger,
  lanceDbPath: LANCE_DB_PATH,
  ragDistanceThreshold: RAG_DISTANCE_THRESHOLD,
});
const { initKnowledgeBase, reingestKnowledgeBase, searchKnowledge } = knowledgeService;
const getKnowledgeTable = knowledgeService.getKnowledgeTable;

// ── Next-Gen RAG & Memory Services (feature-flagged) ─────────────────────
const USE_ADAPTIVE_PIPELINE = /^(1|true|yes)$/i.test(process.env.USE_ADAPTIVE_PIPELINE || "");

const ngSearchEngine = createSearchEngine({
  embedText,
  knowledgeTable: getKnowledgeTable,
  ragDistanceThreshold: RAG_DISTANCE_THRESHOLD,
  logger,
});
const ngReranker = createReranker({
  callLLM, getProviderConfig, logger,
  cohereApiKey: process.env.COHERE_API_KEY || "",
});
const ngQueryAnalyzer = createQueryAnalyzer({ callLLM, getProviderConfig, logger });
const ngCragEvaluator = createCragEvaluator({ callLLM, getProviderConfig, logger });
const ngContextualChunker = createContextualChunker({ callLLM, getProviderConfig, logger });
const ngCoreMemory = createCoreMemory({ sqliteDb, callLLM, getProviderConfig, logger });
const ngRecallMemory = createRecallMemory({ sqliteDb, logger });
const ngMemoryEngine = createMemoryEngine({ coreMemory: ngCoreMemory, recallMemory: ngRecallMemory, logger });
const ngQualityScorer = createQualityScorer({ callLLM, getProviderConfig, sqliteDb, logger });
const ngReflexion = createReflexion({ callLLM, getProviderConfig, sqliteDb, logger });
const ngGraphBuilder = createGraphBuilder({ callLLM, getProviderConfig, sqliteDb, logger });
const ngGraphQuery = createGraphQuery({ sqliteDb, logger });

// ── Chat Audit Logger ────────────────────────────────────────────────────
const { createChatAuditLogger } = require("./src/utils/chatAuditLog");
const chatAuditLog = createChatAuditLogger({ logDir: path.join(DATA_DIR, "chat-logs") });

const ngChatPipeline = createChatPipeline({
  queryAnalyzer: ngQueryAnalyzer,
  searchEngine: ngSearchEngine,
  reranker: ngReranker,
  cragEvaluator: ngCragEvaluator,
  memoryEngine: ngMemoryEngine,
  reflexion: ngReflexion,
  graphQuery: ngGraphQuery,
  qualityScorer: ngQualityScorer,
  promptBuilder,
  callLLM,
  getProviderConfig,
  logger,
  chatAuditLog,
  jobQueue,
});
const ngUrlExtractor = createUrlExtractor({ logger });

// Expose NG services for admin routes and event hooks
const ngServices = {
  chatPipeline: ngChatPipeline,
  contextualChunker: ngContextualChunker,
  graphBuilder: ngGraphBuilder,
};

// ── Agent Queue Service ─────────────────────────────────────────────────
const { createAgentQueue } = require("./src/services/agentQueue");
const agentQueue = createAgentQueue({ sqliteDb: { getDb: () => sqliteDb.db }, logger });

// ── Job Queue Handlers ──────────────────────────────────────────────────
jobQueue.registerHandler("memory-update", async (p) => {
  await ngMemoryEngine.updateAfterConversation(p.userId, p.sessionId, p.chatHistory, p.reply);
});
jobQueue.registerHandler("graph-extract", async (p) => {
  await ngGraphBuilder.extractAndStore(p.ticket);
});
jobQueue.registerHandler("reflexion", async (p) => {
  await ngReflexion.analyze({ sessionId: p.sessionId, query: p.query, answer: p.answer, ragResults: p.ragResults || [] });
});
jobQueue.registerHandler("webhook", async (p) => {
  const body = JSON.stringify({ event: p.eventType, data: p.data, timestamp: new Date().toISOString() });
  const headers = { "Content-Type": "application/json" };
  if (p.hookSecret) {
    headers["X-Qragy-Signature"] = crypto.createHmac("sha256", p.hookSecret).update(body).digest("hex");
  }
  const controller = new AbortController();
  const tid = setTimeout(() => controller.abort(), 5000);
  const resp = await fetch(p.hookUrl, { method: "POST", headers, body, signal: controller.signal });
  clearTimeout(tid);
  if (!resp.ok) throw new Error("HTTP " + resp.status);
});
jobQueue.registerHandler("quality-score", async (p) => {
  await ngQualityScorer.score({
    query: p.query,
    answer: p.answer,
    ragResults: p.ragResults || [],
    sessionId: p.sessionId,
    messageId: p.messageId,
  });
});
jobQueue.registerHandler("kb-reingest", async () => {
  await reingestKnowledgeBase();
});

// ── LLM Topic Classification ────────────────────────────────────────────
/**
 * AI agent: keyword eslesmediginde LLM ile konu siniflandirmasi yapar.
 * buildConversationContext icinden callback olarak cagrilir.
 * @param {string[]} userMessages - Tum kullanici mesajlari
 * @returns {Promise<string|null>} topic id veya null
 */
async function classifyTopicWithLLM(userMessages) {
  const topicIndexSummary = agentConfig.getTopicIndexSummary();
  if (!topicIndexSummary) return null;

  const cfg = getProviderConfig();
  if (!cfg.apiKey && cfg.provider !== "ollama") return null;

  const recentMessages = Array.isArray(userMessages) ? userMessages.slice(-3) : [String(userMessages)];
  const userText = recentMessages.join("\n");

  // Numarali konu listesi olustur — model sayi secsin (ID yazmak yerine)
  const topicIndex = agentConfig.getTopicIndex();
  const numberedList = topicIndex.topics.map((t, i) => `${i + 1}. ${t.title}`).join("\n");

  const classifyPrompt = [
    "Kullanicinin sorununa DOGRUDAN karsilik gelen konu numarasini sec.",
    "ONEMLI: Sadece dogrudan eslesme say. Belirsiz veya dolayli baglanti yeterli degil — 0 yaz.",
    "SADECE numara yaz. Hicbiri uygun degilse 0 yaz.",
    "",
    numberedList,
  ].join("\n");

  try {
    const messages = [{ role: "user", parts: [{ text: userText }] }];
    const result = await callLLM(messages, classifyPrompt, 256, { thinkingBudget: 0 });
    const rawReply = (result.reply || "").trim();

    // Numara cikart
    const numMatch = rawReply.match(/(\d+)/);
    const num = numMatch ? parseInt(numMatch[1], 10) : 0;

    if (num < 1 || num > topicIndex.topics.length) return null;

    const matched = topicIndex.topics[num - 1];

    logger.info("classifyTopicWithLLM", "Sonuc", {
      selectedNum: num,
      topicId: matched.id,
      topicTitle: matched.title,
      userText: userText.slice(0, 100),
    });

    return matched.id;
  } catch (err) {
    logger.warn("classifyTopicWithLLM", "Hata", { error: err.message });
    return null;
  }
}

// ── Question Extractor Service ──────────────────────────────────────────
const { createQuestionExtractor } = require("./src/services/questionExtractor");
const questionExtractor = createQuestionExtractor({
  callLLM, getProviderConfig, logger,
});

// ── Conversation Summarizer Service ──────────────────────────────────────
const { createConversationSummarizer } = require("./src/services/conversationSummarizer");
const conversationSummarizer = createConversationSummarizer({
  callLLM, getProviderConfig, getChatFlowConfig, logger,
});



// ── Conversation Utils Service ──────────────────────────────────────────
const convUtils = createConversationUtils({
  callLLM, callLLMWithFallback, getProviderConfig,
  normalizeForMatching, logger, fs,
  contentGapsFile: CONTENT_GAPS_FILE,
  nowIso,
});
const {
  analyzeSentiment, calculateQualityScore,
  loadContentGaps, saveContentGaps, recordContentGap,
  generateEscalationSummary, compressConversationHistory,
} = convUtils;


// validateBotResponse — modular (src/services/responseValidator.js)
function validateBotResponse(reply) {
  return validateBotResponseFn(reply, "tr");
}


// Security headers — modular (src/middleware/security.js)
app.use(securityHeaders);

// CORS middleware (src/middleware/cors.js)
const { createCorsMiddleware } = require("./src/middleware/cors.js");
app.use(createCorsMiddleware({ port: PORT, getAllowedOrigin: () => config.allowedOrigin }));
// Deploy webhook (must be before express.json() to access raw body)
require("./src/routes/deploy").mount(app, {
  express, crypto, fs, path, logger,
  getDeployWebhookSecret: () => DEPLOY_WEBHOOK_SECRET, appDir: __dirname,
});

app.use(express.json({ limit: "1mb", type: (req) => {
  const ct = req.headers["content-type"] || "";
  return ct.includes("application/json") || ct.includes("text/plain");
}}));
// ── OpenAPI / Swagger UI ──────────────────────────────────────────────────
app.get("/api-docs.json", (_req, res) => {
  res.sendFile(path.join(__dirname, "openapi.json"));
});
app.get("/api-docs", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "api-docs.html"));
});

app.use(express.static(path.join(__dirname, "public")));

// ── Setup Wizard Redirect ────────────────────────────────────────────────
app.use((req, res, next) => {
  // Skip API calls, static files, and setup page itself
  if (req.path.startsWith("/api/") || req.path.startsWith("/setup") || req.path.includes(".")) {
    return next();
  }
  // If setup not complete and accessing admin, redirect to setup
  // Use relative redirect so reverse proxy subpath is preserved
  if (req.path === "/admin" && !isSetupComplete()) {
    return res.redirect("setup");
  }
  next();
});

// ── Setup Route (src/routes/setup.js) ────────────────────────────────────
require("./src/routes/setup").mount(app, {
  isSetupComplete,
  markSetupComplete,
  saveSiteConfig,
  saveChatFlowConfig,
  getSiteConfig,
  getChatFlowConfig,
  loadTemplate: agentConfig.loadTemplate,
  fs, agentDir: AGENT_DIR,
  loadCSVData, saveCSVData, reingestKnowledgeBase,
  logger,
  jobQueue,
});

// ── Health Route (src/routes/health.js) ─────────────────────────────────
function getHealthSnapshot() {
  const llmHealthStatus = llmHealth.getLlmHealthStatus();
  const ticketsDb = loadTicketsDb();
  return {
    ok: llmHealthStatus.ok && Boolean(GOOGLE_API_KEY),
    model: GOOGLE_MODEL,
    hasApiKey: Boolean(GOOGLE_API_KEY),
    llmStatus: llmHealthStatus,
    maxOutputTokens: GOOGLE_MAX_OUTPUT_TOKENS,
    requestTimeoutMs: GOOGLE_REQUEST_TIMEOUT_MS,
    thinkingBudget: GOOGLE_THINKING_BUDGET,
    deterministicCollectionMode: DETERMINISTIC_COLLECTION_MODE,
    agentFilesLoaded: Boolean(agentConfig.getPersonaText() && agentConfig.getResponsePolicyText() && agentConfig.getSoulText() && agentConfig.getDomainText() && agentConfig.getSkillsText()),
    topicsLoaded: agentConfig.getTopicIndex().topics.length,
    memoryTemplateLoaded: Boolean(agentConfig.getMemoryTemplate()?.confirmationTemplate),
    zendeskEnabled: ZENDESK_ENABLED,
    zendeskSnippetConfigured: Boolean(ZENDESK_SNIPPET_KEY),
    sunshineEnabled: ZENDESK_SC_ENABLED || getSunshineConfig().enabled,
    sunshineConfigured: Boolean((getSunshineConfig().appId || ZENDESK_SC_APP_ID) && (getSunshineConfig().keyId || ZENDESK_SC_KEY_ID)),
    supportAvailability: getSupportAvailability(),
    knowledgeBaseLoaded: Boolean(getKnowledgeTable()),
    adminTokenRequired: Boolean(ADMIN_TOKEN),
    tickets: getAdminSummary(ticketsDb.tickets),
  };
}
require("./src/routes/health").mount(app, { getHealthSnapshot });

// ── Widget/Config Route (src/routes/widget.js) ─────────────────────────
require("./src/routes/widget").mount(app, {
  getSupportAvailability,
  getZendeskEnabled: () => ZENDESK_ENABLED,
  getZendeskSnippetKey: () => ZENDESK_SNIPPET_KEY,
  getZendeskDefaultTags: () => ZENDESK_DEFAULT_TAGS,
  getAdminToken: () => ADMIN_TOKEN,
  getChatFlowConfig,
  getSiteConfig,
});

// ── Conversation Routes (src/routes/conversation.js) ─────────────────────
const conversationLifecycle = require("./src/routes/conversation").mount(app, {
  express, fs, logger, multer,
  loadTicketsDb, saveTicketsDb, updateTicketHandoffResult, sanitizeTicketForList,
  nowIso,
  fireWebhook,
  loadConversations, saveConversations, upsertConversation,
  recordAnalyticsEvent, recordCsatAnalytics, saveAnalyticsData,
  getAnalyticsData: () => analyticsData,
  FEEDBACK_FILE, UPLOADS_DIR,
  ngReflexion, ngGraphBuilder,
  jobQueue,
});

// ── Web Chat Pipeline (src/services/webChatPipeline.js) ──────────────────
const { createWebChatPipeline } = require("./src/services/webChatPipeline");
const webChatPipeline = createWebChatPipeline({
  getChatFlowConfig,
  getGoogleModel: () => GOOGLE_MODEL,
  getGoogleMaxOutputTokens: () => GOOGLE_MAX_OUTPUT_TOKENS,
  getSupportAvailability,
  getProviderConfig,
  getTopicIndex: agentConfig.getTopicIndex,
  getTopicIndexSummary: agentConfig.getTopicIndexSummary,
  getSoulText: agentConfig.getSoulText,
  getPersonaText: agentConfig.getPersonaText,
  isGibberishMessage: (text) => chatEngine.isGibberishMessage(text, { chatFlowConfig: getChatFlowConfig() }),
  isFarewellMessage: (text, turnCount) => chatEngine.isFarewellMessage(text, turnCount, { chatFlowConfig: getChatFlowConfig() }),
  hasRequiredFields: chatEngine.hasRequiredFields,
  isNonIssueMessage: chatEngine.isNonIssueMessage,
  isStatusFollowupMessage: chatEngine.isStatusFollowupMessage,
  isFieldClarificationMessage: chatEngine.isFieldClarificationMessage,
  normalizeForMatching, extractBranchCodeFromText: chatEngine.extractBranchCodeFromText,
  sanitizeAssistantReply: chatEngine.sanitizeAssistantReply,
  getLastAssistantMessage: chatEngine.getLastAssistantMessage,
  isAssistantEscalationMessage: chatEngine.isAssistantEscalationMessage,
  getStatusFollowupMessage: () => chatEngine.getStatusFollowupMessage({ memoryTemplate: agentConfig.getMemoryTemplate() }),
  getOutsideSupportHoursMessage: () => chatEngine.getOutsideSupportHoursMessage({ memoryTemplate: agentConfig.getMemoryTemplate() }),
  loadTicketsDb,
  findRecentDuplicateTicket,
  createOrReuseTicket,
  buildConfirmationMessage: (memory) => chatEngine.buildConfirmationMessage(memory, { memoryTemplate: agentConfig.getMemoryTemplate() }),
  buildMissingFieldsReply: (memory, latestUserMessage) => chatEngine.buildMissingFieldsReply(memory, latestUserMessage, { chatFlowConfig: getChatFlowConfig() }),
  ACTIVE_TICKET_STATUSES,
  loadConversations, saveConversations,
  callLLM, callLLMWithFallback,
  generateEscalationSummary,
  searchKnowledge, recordContentGap,
  buildSystemPrompt,
  buildConversationContext: (memory, userMessages) => chatEngine.buildConversationContext(memory, userMessages, { topicIndex: agentConfig.getTopicIndex(), remoteToolName: REMOTE_TOOL_NAME, classifyTopicWithLLM }),
  buildDeterministicCollectionReply: (memory, activeUserMessages, hasClosedTicketHistory) => chatEngine.buildDeterministicCollectionReply(memory, activeUserMessages, hasClosedTicketHistory, { chatFlowConfig: getChatFlowConfig(), memoryTemplate: agentConfig.getMemoryTemplate(), companyName: COMPANY_NAME }),
  validateOutput, validateBotResponse, maskCredentials,
  recordAnalyticsEvent,
  recordLLMError: llmHealth.recordLLMError,
  analyzeSentiment,
  fireWebhook,
  getTopicMeta,
  getClarificationKey, incrementClarificationCount, resetClarificationCount,
  ESCALATION_MESSAGE_REGEX: chatEngine.ESCALATION_MESSAGE_REGEX,
  CONFIRMATION_PREFIX_REGEX: chatEngine.CONFIRMATION_PREFIX_REGEX,
  NEW_TICKET_INTENT_REGEX: chatEngine.NEW_TICKET_INTENT_REGEX,
  ISSUE_HINT_REGEX: chatEngine.ISSUE_HINT_REGEX,
  GENERIC_REPLY, POST_ESCALATION_FOLLOWUP_MESSAGE: chatEngine.POST_ESCALATION_FOLLOWUP_MESSAGE,
  formatCitations,
  questionExtractor,
  getUserMemory: userMemory,
  conversationSummarizer,
  logger,
  chatAuditLog,
  qualityScorer: ngQualityScorer,
  jobQueue,
});

// ── Chat Routes (src/routes/chat.js) ────────────────────────────────────
const chatLifecycle = require("./src/routes/chat").mount(app, {
  logger,
  checkRateLimit, RATE_LIMIT_WINDOW_MS,
  extractTicketMemory: chatEngine.extractTicketMemory,
  splitActiveTicketMessages: chatEngine.splitActiveTicketMessages,
  getUserMessages: chatEngine.getUserMessages,
  detectInjection, checkRelevanceLLM: require("./src/middleware/injectionGuard").checkRelevanceLLM, callLLM, GENERIC_REPLY,
  upsertConversation, loadConversations, saveConversations,
  compressConversationHistory,
  buildConversationContext: (memory, userMessages) => chatEngine.buildConversationContext(memory, userMessages, { topicIndex: agentConfig.getTopicIndex(), remoteToolName: REMOTE_TOOL_NAME, classifyTopicWithLLM }),
  getSupportAvailability,
  getGoogleModel: () => GOOGLE_MODEL,
  recordAnalyticsEvent,
  recordLLMError: llmHealth.recordLLMError,
  buildMissingFieldsReply: (memory, latestUserMessage) => chatEngine.buildMissingFieldsReply(memory, latestUserMessage, { chatFlowConfig: getChatFlowConfig() }),
  webChatPipeline,
  // Adaptive pipeline (feature-flagged)
  ngChatPipeline: USE_ADAPTIVE_PIPELINE ? ngChatPipeline : null,
  USE_ADAPTIVE_PIPELINE,
  loadCSVData,
  validateOutput,
  maskCredentials,
  getSoulText: agentConfig.getSoulText,
  getPersonaText: agentConfig.getPersonaText,
});

// ── Chat Processor Service (multi-channel) ─────────────────────────────
const { createChatProcessor } = require("./src/services/chatProcessor");
const chatProcessor = createChatProcessor({
  getChatFlowConfig,
  getGoogleModel: () => GOOGLE_MODEL,
  getGoogleMaxOutputTokens: () => GOOGLE_MAX_OUTPUT_TOKENS,
  getSupportAvailability,
  splitActiveTicketMessages: chatEngine.splitActiveTicketMessages,
  getUserMessages: chatEngine.getUserMessages,
  extractTicketMemory: chatEngine.extractTicketMemory,
  isGibberishMessage: (text) => chatEngine.isGibberishMessage(text, { chatFlowConfig: getChatFlowConfig() }),
  isFarewellMessage: (text, turnCount) => chatEngine.isFarewellMessage(text, turnCount, { chatFlowConfig: getChatFlowConfig() }),
  hasRequiredFields: chatEngine.hasRequiredFields,
  analyzeSentiment,
  buildConversationContext: (memory, userMessages) => chatEngine.buildConversationContext(memory, userMessages, { topicIndex: agentConfig.getTopicIndex(), remoteToolName: REMOTE_TOOL_NAME, classifyTopicWithLLM }),
  buildDeterministicCollectionReply: (memory, activeUserMessages, hasClosedTicketHistory) => chatEngine.buildDeterministicCollectionReply(memory, activeUserMessages, hasClosedTicketHistory, { chatFlowConfig: getChatFlowConfig(), memoryTemplate: agentConfig.getMemoryTemplate(), companyName: COMPANY_NAME }),
  getProviderConfig,
  buildMissingFieldsReply: (memory, latestUserMessage) => chatEngine.buildMissingFieldsReply(memory, latestUserMessage, { chatFlowConfig: getChatFlowConfig() }),
  compressConversationHistory,
  callLLMWithFallback,
  recordLLMError: llmHealth.recordLLMError,
  getSoulText: agentConfig.getSoulText,
  getPersonaText: agentConfig.getPersonaText,
  validateOutput,
  GENERIC_REPLY,
  validateBotResponse,
  searchKnowledge,
  recordContentGap,
  buildSystemPrompt,
  generateEscalationSummary,
  createOrReuseTicket,
  buildConfirmationMessage: (memory) => chatEngine.buildConfirmationMessage(memory, { memoryTemplate: agentConfig.getMemoryTemplate() }),
  fireWebhook,
  recordAnalyticsEvent,
  sanitizeAssistantReply: chatEngine.sanitizeAssistantReply,
  maskCredentials,
  formatCitations,
  questionExtractor,
  getUserMemory: userMemory,
  conversationSummarizer,
});

// ── Telegram Integration ────────────────────────────────────────────────
const { createTelegramIntegration } = require("./src/integrations/telegram");
const telegramIntegration = createTelegramIntegration({
  logger,
  getTelegramEnabled: () => TELEGRAM_ENABLED,
  getTelegramBotToken: () => TELEGRAM_BOT_TOKEN,
  getTelegramPollingIntervalMs: () => TELEGRAM_POLLING_INTERVAL_MS,
  getChatFlowConfig,
  loadTelegramSessions,
  saveTelegramSessions,
  upsertConversation,
  recordAnalyticsEvent,
  processChatMessage: chatProcessor.processChatMessage,
});

// ── Sunshine Integration ────────────────────────────────────────────────
const { createSunshineIntegration } = require("./src/integrations/sunshine");
const sunshineIntegration = createSunshineIntegration({
  express,
  crypto,
  logger,
  getSunshineConfig,
  getZendeskScWebhookSecret: () => ZENDESK_SC_WEBHOOK_SECRET,
  getZendeskScAppId: () => ZENDESK_SC_APP_ID,
  getZendeskScKeyId: () => ZENDESK_SC_KEY_ID,
  getZendeskScKeySecret: () => ZENDESK_SC_KEY_SECRET,
  getZendeskScSubdomain: () => ZENDESK_SC_SUBDOMAIN,
  getChatFlowConfig,
  DEFAULT_SUNSHINE_CONFIG,
  loadSunshineSessions,
  saveSunshineSessions,
  upsertConversation,
  recordAnalyticsEvent,
  processChatMessage: chatProcessor.processChatMessage,
  ESCALATION_MESSAGE_REGEX: chatEngine.ESCALATION_MESSAGE_REGEX,
});
sunshineIntegration.mountWebhook(app);

// ── WhatsApp Integration ─────────────────────────────────────────────
const { createWhatsAppIntegration } = require("./src/integrations/whatsapp");
const whatsappIntegration = createWhatsAppIntegration({
  express,
  logger,
  getWhatsAppConfig,
  getChatFlowConfig,
  upsertConversation,
  recordAnalyticsEvent,
  processChatMessage: chatProcessor.processChatMessage,
});
whatsappIntegration.mountWebhook(app);

// ── Admin Rate Limiting (all /api/admin endpoints) ──────────────────────
app.use("/api/admin", (req, res, next) => {
  const ip = req.ip || req.headers["x-forwarded-for"] || "unknown";
  if (!adminRateLimiter.check(ip)) {
    return res.status(429).json({ error: "Cok fazla istek. Lutfen bekleyin." });
  }
  next();
});

// ── Agent Inbox Routes (src/routes/agentInbox.js) ───────────────────────
require("./src/routes/agentInbox").mount(app, {
  requireAdminAccess,
  agentQueue,
  loadConversations,
  logger,
});

// ── Admin Routes (src/routes/admin.js) ──────────────────────────────────
require("./src/routes/admin").mount(app, {
  requireAdminAccess, express, fs, path, crypto, PORT, jobQueue,
  sqliteDb, loadTicketsDb, saveTicketsDb,
  getAdminSummary, sanitizeTicketForList,
  TICKET_STATUS, HANDOFF_RESULT_STATUS_MAP, ACTIVE_TICKET_STATUSES,
  nowIso, calculateQualityScore, updateTicketHandoffResult,
  loadConversations, saveConversations,
  recordAnalyticsEvent, flushAnalyticsBuffer,
  getAnalyticsData: () => analyticsData,
  loadCSVData, saveCSVData, reingestKnowledgeBase,
  getKnowledgeTable,
  Papa, loadAllAgentConfig, readTextFileSafe, readJsonFileSafe,
  isValidFilename, savePromptVersion, loadPromptVersions,
  getChatFlowConfig,
  saveChatFlowConfig, DEFAULT_CHAT_FLOW_CONFIG, loadChatFlowConfig,
  getSiteConfig,
  saveSiteConfig, DEFAULT_SITE_CONFIG,
  getSunshineConfig,
  saveSunshineConfig, DEFAULT_SUNSHINE_CONFIG,
  getZendeskScVars: () => ({ ZENDESK_SC_APP_ID, ZENDESK_SC_KEY_ID, ZENDESK_SC_KEY_SECRET, ZENDESK_SC_SUBDOMAIN }),
  setZendeskScEnabled: (val) => { ZENDESK_SC_ENABLED = val; },
  readEnvFile, writeEnvFile, reloadRuntimeEnv, checkLLMHealth: llmHealth.checkLLMHealth,
  loadWebhooks, saveWebhooks, loadWebhookDeliveryLog,
  loadContentGaps, saveContentGaps,
  loadFeedback: conversationLifecycle.loadFeedback,
  feedbackAnalyzer,
  safeError, invalidateTopicCache,
  callLLM, getProviderConfig, embedText,
  multer, chunkText,
  getGoogleModel: () => GOOGLE_MODEL,
  getTopicIndex: agentConfig.getTopicIndex,
  getLlmHealthStatus: () => llmHealth.getLlmHealthStatus(),
  getSupportTimezone: () => SUPPORT_TIMEZONE,
  AGENT_DIR, TOPICS_DIR, MEMORY_DIR, UPLOADS_DIR, DATA_DIR,
  SLA_FIRST_RESPONSE_MIN: config.slaFirstResponseMin, SLA_RESOLUTION_MIN: config.slaResolutionMin,
  logger, searchKnowledge, validateBotResponse,
  loadSiteConfig, loadSunshineConfig,
  ngServices,
  getAgentConfigSummary: () => ({
    soulText: agentConfig.getSoulText(),
    personaText: agentConfig.getPersonaText(),
    domainText: agentConfig.getDomainText(),
    topicIndexSummary: agentConfig.getTopicIndexSummary(),
    topicCount: agentConfig.getTopicIndex().topics.length,
  }),
  contextualChunker: ngContextualChunker,
  urlExtractor: ngUrlExtractor,
});

// ── WhatsApp Admin Route ─────────────────────────────────────────────
require("./src/routes/whatsapp").mount(app, {
  requireAdminAccess,
  getWhatsAppConfig,
  saveWhatsAppConfig,
});

app.get("/setup", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "setup.html"));
});

app.get("/admin", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "admin.html"));
});

app.get("/admin-v2", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "admin-v2", "index.html"));
});

app.get("*", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

(async () => {
  loadAnalyticsData();
  // Cleanup stale Sunshine sessions (older than 7 days)
  try {
    const sessions = loadSunshineSessions();
    const cutoff = Date.now() - STALE_SESSION_DAYS * MS_PER_DAY;
    let changed = false;
    for (const key of Object.keys(sessions)) {
      if ((sessions[key].lastActivity || 0) < cutoff) {
        delete sessions[key];
        changed = true;
      }
    }
    if (changed) saveSunshineSessions(sessions);
  } catch (err) { logger.warn("startup", "Sunshine session cleanup", err); }
  // Ensure uploads directory
  if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  await initKnowledgeBase();

  // Data retention: clean up old tickets daily
  function runDataRetention() {
    try {
      const cutoffMs = Date.now() - DATA_RETENTION_DAYS * MS_PER_DAY;
      const db = loadTicketsDb();
      const before = db.tickets.length;
      db.tickets = db.tickets.filter(t => {
        const ts = Date.parse(t.createdAt || "");
        return Number.isFinite(ts) && ts > cutoffMs;
      });
      if (db.tickets.length < before) {
        saveTicketsDb(db);
        logger.info("retention", `${before - db.tickets.length} eski ticket silindi (${DATA_RETENTION_DAYS} gun)`);
      }
    } catch (err) { logger.warn("dataRetention", "Error", err); }
  }
  // Run once at startup, then daily
  runDataRetention();
  setInterval(runDataRetention, MS_PER_DAY);

  // Start inactivity checks every 60s (Telegram + Sunshine + Web)
  setInterval(telegramIntegration.checkTelegramInactivity, INACTIVITY_CHECK_MS);
  setInterval(sunshineIntegration.checkSunshineInactivity, INACTIVITY_CHECK_MS);
  setInterval(chatLifecycle.checkWebConversationInactivity, WEB_INACTIVITY_CHECK_MS);

  // Startup backup
  sqliteDb.backupDatabase();
  // Daily backup interval
  setInterval(() => sqliteDb.backupDatabase(), MS_PER_DAY);

  const server = app.listen(PORT, () => {
    logger.info("startup", `${BOT_NAME} ${PORT} portunda hazir`);
    if (USE_ADAPTIVE_PIPELINE) {
      logger.info("startup", "Adaptive RAG pipeline AKTIF (FAST/STANDARD/DEEP routing)");
    }
    telegramIntegration.startTelegramPolling();

    // Job queue worker
    jobQueue.start({ pollIntervalMs: 2000 });

    // LLM health check: ilk kontrol 10s sonra, sonra her 5dk'da bir
    setTimeout(() => llmHealth.checkLLMHealth(), LLM_HEALTH_INITIAL_DELAY_MS);
    setInterval(() => llmHealth.checkLLMHealth(), LLM_HEALTH_INTERVAL_MS);
  });

  // ── Graceful Shutdown ──────────────────────────────────────────────────
  function gracefulShutdown(signal) {
    logger.info("shutdown", `${signal} Kapatiliyor...`);
    server.close(async () => {
      logger.info("shutdown", "HTTP server kapatildi");
      await jobQueue.stop();
      saveAnalyticsData();
      sqliteDb.closeDb();
      logger.info("shutdown", "Temiz cikis");
      process.exit(0);
    });
    // Force exit after 10s
    setTimeout(() => {
      logger.error("shutdown", "Force exit (10s timeout)");
      process.exit(1);
    }, GRACEFUL_SHUTDOWN_FORCE_MS).unref();
  }

  process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
  process.on("SIGINT", () => gracefulShutdown("SIGINT"));
})();

require("dotenv").config();

const fs = require("fs");
const express = require("express");
const path = require("path");
const { callLLM, callLLMWithFallback, embedText, getProviderConfig } = require("./lib/providers");
const { chunkText } = require("./lib/chunker");
const lancedb = require("@lancedb/lancedb");
const Papa = require("papaparse");
const multer = require("multer");
const CSV_EXAMPLE_FILE = path.join(__dirname, "knowledge_base.example.csv");
const CSV_FILE = path.join(__dirname, "data", "knowledge_base.csv");

const app = express();

// ── Global error handlers ───────────────────────────────────────────────
process.on("unhandledRejection", (reason) => {
  console.error("[FATAL] Unhandled rejection:", reason);
});
process.on("uncaughtException", (err) => {
  console.error("[FATAL] Uncaught exception:", err);
  process.exit(1);
});

// ── LLM Health Check state ──────────────────────────────────────────────
let llmHealthStatus = { ok: false, checkedAt: null, error: null, latencyMs: null, provider: null };
// Runtime error tracking — son 10dk'daki LLM hatalarini sayar
const llmErrorLog = []; // { timestamp, error, status }
const LLM_ERROR_WINDOW_MS = 10 * 60 * 1000; // 10 dakika

const PORT = Number(process.env.PORT || 3000);
let GOOGLE_API_KEY = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY || "";
let GOOGLE_MODEL = process.env.GOOGLE_MODEL || "gemini-3-pro-preview";
let GOOGLE_MAX_OUTPUT_TOKENS = Number(process.env.GOOGLE_MAX_OUTPUT_TOKENS || 1024);
let GOOGLE_THINKING_BUDGET = Number(process.env.GOOGLE_THINKING_BUDGET || 64);
let GOOGLE_REQUEST_TIMEOUT_MS = Number(process.env.GOOGLE_REQUEST_TIMEOUT_MS || 15000);
let ZENDESK_SNIPPET_KEY = (process.env.ZENDESK_SNIPPET_KEY || "").trim();
let ZENDESK_ENABLED =
  /^(1|true|yes)$/i.test(process.env.ZENDESK_ENABLED || "") || Boolean(ZENDESK_SNIPPET_KEY);
let ZENDESK_DEFAULT_TAGS = (process.env.ZENDESK_DEFAULT_TAGS || "qragy,ai_handoff")
  .split(",")
  .map((item) => item.trim())
  .filter(Boolean);
let SUPPORT_HOURS_ENABLED = /^(1|true|yes)$/i.test(process.env.SUPPORT_HOURS_ENABLED || "");
let SUPPORT_TIMEZONE = process.env.SUPPORT_TIMEZONE || "Europe/Istanbul";
let SUPPORT_OPEN_HOUR = Number(process.env.SUPPORT_OPEN_HOUR || 7);
let SUPPORT_CLOSE_HOUR = Number(process.env.SUPPORT_CLOSE_HOUR || 24);
let SUPPORT_OPEN_DAYS = (process.env.SUPPORT_OPEN_DAYS || "1,2,3,4,5,6,7")
  .split(",")
  .map((item) => Number(item.trim()))
  .filter((day) => Number.isInteger(day) && day >= 1 && day <= 7);
let DETERMINISTIC_COLLECTION_MODE =
  !/^(0|false|no)$/i.test(process.env.DETERMINISTIC_COLLECTION_MODE || "true");
let ADMIN_TOKEN = (process.env.ADMIN_TOKEN || "").trim();
let BOT_NAME = (process.env.BOT_NAME || "QRAGY Bot").trim();
let COMPANY_NAME = (process.env.COMPANY_NAME || "").trim();
let REMOTE_TOOL_NAME = (process.env.REMOTE_TOOL_NAME || "").trim();

// Rate Limiting
let RATE_LIMIT_ENABLED = /^(1|true|yes)$/i.test(process.env.RATE_LIMIT_ENABLED || "true");
let RATE_LIMIT_MAX = Number(process.env.RATE_LIMIT_MAX || 20);
let RATE_LIMIT_WINDOW_MS = Number(process.env.RATE_LIMIT_WINDOW_MS || 60000);

// Model Fallback
let GOOGLE_FALLBACK_MODEL = (process.env.GOOGLE_FALLBACK_MODEL || "").trim();

// Telegram
let TELEGRAM_ENABLED = /^(1|true|yes)$/i.test(process.env.TELEGRAM_ENABLED || "false");
let TELEGRAM_BOT_TOKEN = (process.env.TELEGRAM_BOT_TOKEN || "").trim();
let TELEGRAM_POLLING_INTERVAL_MS = Number(process.env.TELEGRAM_POLLING_INTERVAL_MS || 2000);

// Zendesk Sunshine Conversations
let ZENDESK_SC_ENABLED = /^(1|true|yes)$/i.test(process.env.ZENDESK_SC_ENABLED || "false");
let ZENDESK_SC_APP_ID = (process.env.ZENDESK_SC_APP_ID || "").trim();
let ZENDESK_SC_KEY_ID = (process.env.ZENDESK_SC_KEY_ID || "").trim();
let ZENDESK_SC_KEY_SECRET = (process.env.ZENDESK_SC_KEY_SECRET || "").trim();
let ZENDESK_SC_WEBHOOK_SECRET = (process.env.ZENDESK_SC_WEBHOOK_SECRET || "").trim();
let ZENDESK_SC_SUBDOMAIN = (process.env.ZENDESK_SC_SUBDOMAIN || "").trim();

// Auto-deploy webhook
let DEPLOY_WEBHOOK_SECRET = (process.env.DEPLOY_WEBHOOK_SECRET || "").trim();

// Data Retention
const DATA_RETENTION_DAYS = Number(process.env.DATA_RETENTION_DAYS || 90);

const AGENT_DIR = path.join(__dirname, "agent");
const TOPICS_DIR = path.join(AGENT_DIR, "topics");
const MEMORY_DIR = path.join(__dirname, "memory");
const DATA_DIR = path.join(__dirname, "data");
const LANCE_DB_PATH = path.join(DATA_DIR, "lancedb");
const TICKETS_DB_FILE = path.join(DATA_DIR, "tickets.json");
const ANALYTICS_FILE = path.join(DATA_DIR, "analytics.json");
const WEBHOOKS_FILE = path.join(DATA_DIR, "webhooks.json");
const TELEGRAM_SESSIONS_FILE = path.join(DATA_DIR, "telegram-sessions.json");
const PROMPT_VERSIONS_FILE = path.join(DATA_DIR, "prompt-versions.json");
const UPLOADS_DIR = path.join(DATA_DIR, "uploads");
const CHAT_FLOW_CONFIG_FILE = path.join(DATA_DIR, "chat-flow-config.json");
const SITE_CONFIG_FILE = path.join(DATA_DIR, "site-config.json");
const CONVERSATIONS_FILE = path.join(DATA_DIR, "conversations.json");
const SUNSHINE_SESSIONS_FILE = path.join(DATA_DIR, "sunshine-sessions.json");
const SUNSHINE_CONFIG_FILE = path.join(DATA_DIR, "sunshine-config.json");
const FEEDBACK_FILE = path.join(DATA_DIR, "feedback.json");
const CONTENT_GAPS_FILE = path.join(DATA_DIR, "content-gaps.json");
const AUDIT_LOG_FILE = path.join(DATA_DIR, "audit-log.json");
const WEBHOOK_DELIVERY_LOG_FILE = path.join(DATA_DIR, "webhook-delivery-log.json");

let knowledgeTable = null;

// ── Rate Limiter (in-memory) ────────────────────────────────────────────
const rateLimitStore = new Map();

function checkRateLimit(ip) {
  if (!RATE_LIMIT_ENABLED) return true;
  const now = Date.now();
  let entry = rateLimitStore.get(ip);
  if (!entry || now > entry.resetAt) {
    entry = { count: 0, resetAt: now + RATE_LIMIT_WINDOW_MS };
    rateLimitStore.set(ip, entry);
  }
  entry.count++;
  return entry.count <= RATE_LIMIT_MAX;
}

// Cleanup stale entries every 60s
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of rateLimitStore) {
    if (now > entry.resetAt) rateLimitStore.delete(ip);
  }
}, 60000);

// ── Analytics (in-memory buffer → periodic flush) ────────────────────────
const analyticsBuffer = [];
let analyticsData = { daily: {} };

function loadAnalyticsData() {
  try {
    if (fs.existsSync(ANALYTICS_FILE)) {
      analyticsData = JSON.parse(fs.readFileSync(ANALYTICS_FILE, "utf8"));
      if (!analyticsData.daily) analyticsData.daily = {};
    }
  } catch (_e) {
    analyticsData = { daily: {} };
  }
}

function saveAnalyticsData() {
  try {
    fs.writeFileSync(ANALYTICS_FILE, JSON.stringify(analyticsData, null, 2), "utf8");
  } catch (_e) { /* silent */ }
}

function recordAnalyticsEvent(event) {
  // PII masking for analytics
  const safeEvent = { ...event, timestamp: Date.now() };
  if (safeEvent.query) safeEvent.query = maskPII(safeEvent.query);
  analyticsBuffer.push(safeEvent);
}

function flushAnalyticsBuffer() {
  if (!analyticsBuffer.length) return;

  const events = analyticsBuffer.splice(0, analyticsBuffer.length);
  for (const evt of events) {
    const dayKey = new Date(evt.timestamp).toISOString().slice(0, 10);
    if (!analyticsData.daily[dayKey]) {
      analyticsData.daily[dayKey] = {
        totalChats: 0, aiCalls: 0, deterministicReplies: 0,
        totalResponseMs: 0, responseCount: 0,
        escalationCount: 0, csatSum: 0, csatCount: 0,
        fallbackCount: 0,
        topicCounts: {}, sourceCounts: {}
      };
    }
    const day = analyticsData.daily[dayKey];
    day.totalChats++;
    if (evt.source === "gemini" || evt.source === "topic-guided") day.aiCalls++;
    if (evt.source === "rule-engine" || evt.source === "fallback-no-key") day.deterministicReplies++;
    if (evt.source === "escalation-trigger" || evt.source === "topic-escalation") day.escalationCount++;
    if (evt.fallbackUsed) day.fallbackCount = (day.fallbackCount || 0) + 1;
    if (evt.responseTimeMs) {
      day.totalResponseMs += evt.responseTimeMs;
      day.responseCount++;
    }
    if (evt.topicId) {
      day.topicCounts[evt.topicId] = (day.topicCounts[evt.topicId] || 0) + 1;
    }
    if (evt.source) {
      day.sourceCounts[evt.source] = (day.sourceCounts[evt.source] || 0) + 1;
    }
    // Sentiment tracking
    if (evt.sentiment) {
      if (!day.sentimentCounts) day.sentimentCounts = {};
      day.sentimentCounts[evt.sentiment] = (day.sentimentCounts[evt.sentiment] || 0) + 1;
    }
  }

  // Prune data older than 90 days
  const cutoff = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);
  for (const key of Object.keys(analyticsData.daily)) {
    if (key < cutoff) delete analyticsData.daily[key];
  }

  saveAnalyticsData();
}

function recordCsatAnalytics(rating) {
  const dayKey = new Date().toISOString().slice(0, 10);
  if (!analyticsData.daily[dayKey]) {
    analyticsData.daily[dayKey] = {
      totalChats: 0, aiCalls: 0, deterministicReplies: 0,
      totalResponseMs: 0, responseCount: 0,
      escalationCount: 0, csatSum: 0, csatCount: 0,
      topicCounts: {}, sourceCounts: {}
    };
  }
  analyticsData.daily[dayKey].csatSum += rating;
  analyticsData.daily[dayKey].csatCount++;
  saveAnalyticsData();
}

// Flush every 5 minutes
setInterval(flushAnalyticsBuffer, 5 * 60 * 1000);

// ── Webhook helpers ──────────────────────────────────────────────────────
const crypto = require("crypto");

function loadWebhooks() {
  try {
    if (fs.existsSync(WEBHOOKS_FILE)) {
      return JSON.parse(fs.readFileSync(WEBHOOKS_FILE, "utf8"));
    }
  } catch (_e) { /* silent */ }
  return [];
}

function saveWebhooks(hooks) {
  fs.writeFileSync(WEBHOOKS_FILE, JSON.stringify(hooks, null, 2), "utf8");
}

// ── Webhook Delivery Log ─────────────────────────────────────────────────
function loadWebhookDeliveryLog() {
  try {
    if (fs.existsSync(WEBHOOK_DELIVERY_LOG_FILE)) return JSON.parse(fs.readFileSync(WEBHOOK_DELIVERY_LOG_FILE, "utf8"));
  } catch (_e) { /* silent */ }
  return { deliveries: [] };
}

function saveWebhookDeliveryLog(data) {
  if (data.deliveries.length > 200) data.deliveries = data.deliveries.slice(-200);
  fs.writeFileSync(WEBHOOK_DELIVERY_LOG_FILE, JSON.stringify(data, null, 2), "utf8");
}

function recordWebhookDelivery(hookId, eventType, status, attempt, error) {
  const data = loadWebhookDeliveryLog();
  data.deliveries.push({
    hookId, eventType, status, attempt,
    error: error ? String(error).slice(0, 200) : "",
    timestamp: nowIso()
  });
  saveWebhookDeliveryLog(data);
}

async function fireWebhookWithRetry(hook, eventType, payload, maxRetries = 3) {
  const body = JSON.stringify({ event: eventType, data: payload, timestamp: new Date().toISOString() });
  const headers = { "Content-Type": "application/json" };
  if (hook.secret) {
    headers["X-Qragy-Signature"] = crypto.createHmac("sha256", hook.secret).update(body).digest("hex");
  }

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const controller = new AbortController();
      const tid = setTimeout(() => controller.abort(), 5000);
      const resp = await fetch(hook.url, { method: "POST", headers, body, signal: controller.signal });
      clearTimeout(tid);
      recordWebhookDelivery(hook.id, eventType, resp.ok ? "success" : "http_" + resp.status, attempt, resp.ok ? "" : "HTTP " + resp.status);
      if (resp.ok) return;
    } catch (err) {
      recordWebhookDelivery(hook.id, eventType, "error", attempt, err.message);
    }
    // Exponential backoff: 1s, 2s, 4s
    if (attempt < maxRetries) {
      await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, attempt - 1)));
    }
  }
}

function fireWebhook(eventType, payload) {
  const hooks = loadWebhooks();
  let fired = 0;
  for (const hook of hooks) {
    if (!hook.active) continue;
    if (!hook.events.includes(eventType) && !hook.events.includes("*")) continue;
    if (fired >= 10) break; // Max 10 webhooks per event
    // Fire with retry (async, fire-and-forget)
    fireWebhookWithRetry(hook, eventType, payload).catch(() => {});
    fired++;
  }
}

// ── Telegram sessions ────────────────────────────────────────────────────
function loadTelegramSessions() {
  try {
    if (fs.existsSync(TELEGRAM_SESSIONS_FILE)) {
      return JSON.parse(fs.readFileSync(TELEGRAM_SESSIONS_FILE, "utf8"));
    }
  } catch (_e) { /* silent */ }
  return {};
}

function saveTelegramSessions(sessions) {
  fs.writeFileSync(TELEGRAM_SESSIONS_FILE, JSON.stringify(sessions, null, 2), "utf8");
}

// ── Prompt Versioning ────────────────────────────────────────────────────
function loadPromptVersions() {
  try {
    if (fs.existsSync(PROMPT_VERSIONS_FILE)) {
      return JSON.parse(fs.readFileSync(PROMPT_VERSIONS_FILE, "utf8"));
    }
  } catch (_e) { /* silent */ }
  return { versions: [] };
}

function savePromptVersion(filename, content) {
  const data = loadPromptVersions();
  data.versions.push({
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    filename,
    content,
    savedAt: new Date().toISOString()
  });
  // Keep only last 50 versions
  if (data.versions.length > 50) data.versions = data.versions.slice(-50);
  fs.writeFileSync(PROMPT_VERSIONS_FILE, JSON.stringify(data, null, 2), "utf8");
}

// ── Chat Flow Configuration ─────────────────────────────────────────────
const DEFAULT_CHAT_FLOW_CONFIG = {
  messageAggregationWindowMs: 4000,
  botResponseDelayMs: 2000,
  typingIndicatorEnabled: true,
  inactivityTimeoutMs: 600000,
  nudgeEnabled: true,
  nudgeAt75Message: "Hala buradayım. Size nasıl yardımcı olabilirim?",
  nudgeAt90Message: "Son birkaç dakikadır mesaj almadım. Yardımcı olabilir miyim?",
  inactivityCloseMessage: "Uzun süredir mesaj almadığım için sohbeti sonlandırıyorum. İhtiyacınız olursa tekrar yazabilirsiniz.",
  maxClarificationRetries: 3,
  gibberishDetectionEnabled: true,
  gibberishMessage: "Mesajınızı anlayamadım. Lütfen sorununuzu daha detaylı açıklar mısınız?",
  closingFlowEnabled: true,
  anythingElseMessage: "Başka yardımcı olabileceğim bir konu var mı?",
  farewellMessage: "İyi günler dilerim! İhtiyacınız olursa tekrar yazabilirsiniz.",
  csatEnabled: true,
  csatMessage: "Deneyiminizi değerlendirir misiniz?",
  welcomeMessage: "Merhaba, Teknik Destek hattına hoş geldiniz. Size nasıl yardımcı olabilirim?"
};

let chatFlowConfig = { ...DEFAULT_CHAT_FLOW_CONFIG };

function loadChatFlowConfig() {
  try {
    if (fs.existsSync(CHAT_FLOW_CONFIG_FILE)) {
      const saved = JSON.parse(fs.readFileSync(CHAT_FLOW_CONFIG_FILE, "utf8"));
      chatFlowConfig = { ...DEFAULT_CHAT_FLOW_CONFIG, ...saved };
    }
  } catch (_e) {
    chatFlowConfig = { ...DEFAULT_CHAT_FLOW_CONFIG };
  }
}

function saveChatFlowConfig(updates) {
  chatFlowConfig = { ...chatFlowConfig, ...updates };
  fs.writeFileSync(CHAT_FLOW_CONFIG_FILE, JSON.stringify(chatFlowConfig, null, 2), "utf8");
}

loadChatFlowConfig();

// ── Site Branding Configuration ─────────────────────────────────────────
const DEFAULT_SITE_CONFIG = {
  pageTitle: "Teknik Destek",
  heroTitle: "Teknik Destek",
  heroDescription: "Teknik destek taleplerinizi AI katmaninda toplayalim.",
  heroButtonText: "Canli Destek",
  heroHint: "AI gerekli bilgileri topladiginda temsilciye otomatik aktarim yapilir.",
  headerTitle: "Teknik Destek",
  logoUrl: "",
  themeColor: "#2563EB",
  primaryColor: "",
  inputPlaceholder: "Mesajinizi yazin...",
  sendButtonText: "Gonder"
};

let siteConfig = { ...DEFAULT_SITE_CONFIG };

function loadSiteConfig() {
  try {
    if (fs.existsSync(SITE_CONFIG_FILE)) {
      const saved = JSON.parse(fs.readFileSync(SITE_CONFIG_FILE, "utf8"));
      siteConfig = { ...DEFAULT_SITE_CONFIG, ...saved };
    }
  } catch (_e) {
    siteConfig = { ...DEFAULT_SITE_CONFIG };
  }
}

function saveSiteConfig(updates) {
  siteConfig = { ...siteConfig, ...updates };
  fs.writeFileSync(SITE_CONFIG_FILE, JSON.stringify(siteConfig, null, 2), "utf8");
}

loadSiteConfig();

// ── Sunshine Conversations Configuration ────────────────────────────────
const DEFAULT_SUNSHINE_CONFIG = {
  enabled: false,
  subdomain: "",
  appId: "",
  keyId: "",
  keySecret: "",
  webhookSecret: "",
  farewellMessage: "Sizi canli destek temsilcisine aktariyorum. Iyi gunler!"
};

let sunshineConfig = { ...DEFAULT_SUNSHINE_CONFIG };

function loadSunshineConfig() {
  try {
    if (fs.existsSync(SUNSHINE_CONFIG_FILE)) {
      const saved = JSON.parse(fs.readFileSync(SUNSHINE_CONFIG_FILE, "utf8"));
      sunshineConfig = { ...DEFAULT_SUNSHINE_CONFIG, ...saved };
    }
  } catch (_e) {
    sunshineConfig = { ...DEFAULT_SUNSHINE_CONFIG };
  }
}

function saveSunshineConfig(updates) {
  sunshineConfig = { ...sunshineConfig, ...updates };
  fs.writeFileSync(SUNSHINE_CONFIG_FILE, JSON.stringify(sunshineConfig, null, 2), "utf8");
}

loadSunshineConfig();

// ── Sunshine Sessions ───────────────────────────────────────────────────
function loadSunshineSessions() {
  try {
    if (fs.existsSync(SUNSHINE_SESSIONS_FILE)) {
      return JSON.parse(fs.readFileSync(SUNSHINE_SESSIONS_FILE, "utf8"));
    }
  } catch (_e) { /* silent */ }
  return {};
}

function saveSunshineSessions(sessions) {
  fs.writeFileSync(SUNSHINE_SESSIONS_FILE, JSON.stringify(sessions, null, 2), "utf8");
}

// ── Live Conversations ──────────────────────────────────────────────────
function loadConversations() {
  try {
    if (fs.existsSync(CONVERSATIONS_FILE)) {
      return JSON.parse(fs.readFileSync(CONVERSATIONS_FILE, "utf8"));
    }
  } catch (_e) { /* silent */ }
  return { conversations: [] };
}

function saveConversations(data) {
  fs.writeFileSync(CONVERSATIONS_FILE, JSON.stringify(data, null, 2), "utf8");
}

function upsertConversation(sessionId, messages, memory, extra = {}) {
  const data = loadConversations();
  let conv = data.conversations.find(c => c.sessionId === sessionId);
  const now = new Date().toISOString();

  if (!conv) {
    conv = {
      sessionId,
      status: "active",
      createdAt: now,
      updatedAt: now,
      messageCount: 0,
      lastUserMessage: "",
      memory: {},
      ticketId: "",
      source: extra.source || "web",
      chatHistory: [],
      ip: extra.ip || ""
    };
    data.conversations.push(conv);
  }

  conv.updatedAt = now;
  conv.memory = memory || conv.memory;
  conv.chatHistory = (messages || []).slice(-50).map(m => ({
    role: m.role,
    content: String(m.content || "").slice(0, 500)
  }));
  conv.messageCount = conv.chatHistory.filter(m => m.role === "user").length;

  const lastUser = [...conv.chatHistory].reverse().find(m => m.role === "user");
  conv.lastUserMessage = lastUser ? lastUser.content.slice(0, 200) : "";

  if (extra.ticketId) conv.ticketId = extra.ticketId;
  if (extra.status) conv.status = extra.status;

  // Prune old conversations (older than 7 days)
  const cutoff = Date.now() - 7 * 86400000;
  data.conversations = data.conversations.filter(c => {
    const ts = Date.parse(c.updatedAt || c.createdAt || "");
    return Number.isFinite(ts) && ts > cutoff;
  });

  saveConversations(data);
  return conv;
}

// ── Gibberish Detection ─────────────────────────────────────────────────
function isGibberishMessage(text) {
  if (!chatFlowConfig.gibberishDetectionEnabled) return false;
  const trimmed = (text || "").trim();
  if (!trimmed) return false;
  // Single character
  if (trimmed.length === 1) return true;
  // Only emojis/symbols (no letters or digits)
  const stripped = trimmed.replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}\s\p{P}\p{S}]/gu, "");
  if (!stripped) return true;
  // Repeated single char: "aaaaaaa", "xxxxxxx"
  if (/^(.)\1{4,}$/i.test(trimmed)) return true;
  // Random consonant strings (no vowels in 6+ chars)
  if (trimmed.length >= 6 && !/[aeıioöuüAEIİOÖUÜ]/i.test(trimmed)) return true;
  // Very short random text (2-3 chars, not a known word)
  if (trimmed.length <= 2 && !/^(ok|no|da|de|bi|bu|şu|ne|ve|ya|ki|ha|he|hi)$/i.test(trimmed)) return true;
  return false;
}

// ── Farewell/Closing Detection ──────────────────────────────────────────
const FAREWELL_WORDS = new Set([
  "hosca kal", "hoscakal", "gorusuruz", "gorusmek uzere",
  "iyi gunler", "iyi aksamlar", "iyi geceler", "iyi calismalar",
  "bye", "goodbye", "gorusuruz", "kendine iyi bak",
  "hoscakalin", "bay bay", "bb", "hayirli gunler",
  "sagolun", "sag olun", "eyvallah"
]);

function isFarewellMessage(text) {
  if (!chatFlowConfig.closingFlowEnabled) return false;
  const normalized = (text || "").trim().toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, "").trim();
  if (FAREWELL_WORDS.has(normalized)) return true;
  for (const word of FAREWELL_WORDS) {
    if (normalized.includes(word)) return true;
  }
  return false;
}

// ── Clarification Retry Tracking ────────────────────────────────────────
const clarificationCounters = new Map();

function getClarificationKey(messages) {
  // Use first user message as session identifier
  const firstUser = messages.find(m => m.role === "user");
  return firstUser ? firstUser.content.slice(0, 50) : "default";
}

function incrementClarificationCount(sessionKey) {
  const count = (clarificationCounters.get(sessionKey) || 0) + 1;
  clarificationCounters.set(sessionKey, count);
  return count;
}

function resetClarificationCount(sessionKey) {
  clarificationCounters.delete(sessionKey);
}

// Cleanup stale clarification counters every 30 minutes
setInterval(() => {
  clarificationCounters.clear();
}, 30 * 60 * 1000);

const DEFAULT_PERSONA_TEXT = [
  `# ${BOT_NAME} Teknik Destek Persona`,
  `- Rol: ${BOT_NAME}, ${COMPANY_NAME || "sirket"} teknik destek yapay zeka asistani.`,
  "- Kanal: Canli destek oncesi AI karsilama ve yonlendirme katmani.",
  "- Hedef: Konu bazli teknik destek saglamak, mumkunse sorunu cozmek, gerektiginde canli temsilciye aktarmak.",
  "- Dil/Ton: Turkce, resmi, net, kisa.",
  "- Sinir: Teknik cozum anlatma, yalnizca talep topla."
].join("\n");

const DEFAULT_POLICY_TEXT = [
  "# Response Policy",
  "1. Eksik zorunlu alanları tek tek sor.",
  "2. Şube kodu ve sorun özeti zorunludur.",
  "3. Zorunlu alanlar tamamlanınca standart onay metni ver.",
  "4. Teknik adım anlatma.",
  "5. Yanıtları 1-3 cümlede tut ve düz metin kullan."
].join("\n");

const DEFAULT_MEMORY_TEMPLATE = {
  requiredFields: ["branchCode", "issueSummary"],
  optionalFields: ["companyName", "fullName", "phone"],
  confirmationTemplate:
    "Talebinizi aldım. Şube kodu: {{branchCode}}. Kısa açıklama: {{issueSummary}}. Destek ekibi en kısa sürede dönüş yapacaktır."
};

const CONFIRMATION_PREFIX_REGEX = /^Talebinizi ald[ıi]m\.\s*[SŞsş]ube kodu:/i;
const ESCALATION_MESSAGE_REGEX = /sizi canl[ıi] destek temsilci(?:mize|sine) aktar[ıi]yorum/i;
const POST_ESCALATION_FOLLOWUP_MESSAGE =
  "Talebiniz canlı destek ekibine iletildi. En kısa sürede bir temsilci size yardımcı olacaktır. Lütfen bekleyiniz.";
const NON_ISSUE_MESSAGE_SET = new Set([
  "tesekkurler",
  "tesekkur ederim",
  "sagol",
  "sag olun",
  "ok",
  "tamam",
  "anlasildi",
  "peki",
  "teyit",
  "rica ederim",
  "merhaba",
  "selam",
  "iyi gunler",
  "iyi aksamlar",
  "iyi calismalar"
]);

const FIELD_CLARIFICATION_REGEX = /(?:sube\s*kod(?:u)?|firma\s*adi|ad\s*soyad|telefon|branch\s*code)/i;
const QUESTION_INTENT_REGEX =
  /(?:nerede|nerde|nasil|nasil|gerekli|lazim|zorunlu|hangi|ne|yaziyor|yazilir|nereden)/i;
const STATUS_FOLLOWUP_REGEX =
  /(?:bekliyorum|beklemedeyim|durum|ne zaman|donus|donus yapacak|hadi|hala|halen|acil|sirada)/i;
const ISSUE_HINT_REGEX =
  /(?:hata|kesemiyor|baglan|odeme|yazici|program|acilm|donuyor|yanlis|iptal|koltuk|pnr|sefer|bilet)/i;
const NEW_TICKET_INTENT_REGEX = /(?:yeni\s*talep|yeniden\s*talep|baska\s*talep|tekrar\s*talep)/i;
const BRANCH_LOCATION_QUESTION_REGEX =
  /(?:sube\s*kodu?.*(?:nerede|nerden|nereden)|nerede.*sube\s*kodu?)/i;
const FIELD_REQUIREMENT_QUESTION_REGEX =
  /(?:firma\s*adi|ad\s*soyad|telefon).*(?:gerekli|zorunlu|lazim|sart)|(?:gerekli|zorunlu|lazim|sart).*(?:firma\s*adi|ad\s*soyad|telefon)/i;

const WELCOME_AND_COLLECT_MESSAGE =
  `Merhaba, ${COMPANY_NAME ? COMPANY_NAME + " " : ""}Teknik Destek hattina hos geldiniz. Talep olusturmamiz icin lutfen sube kodunuzu ve yasadiginiz sorunun kisa ozetini iletiniz. Firma adi istege baglidir.`;
const ASK_BRANCH_MESSAGE = "Talep oluşturabilmem için lütfen şube kodunuzu iletiniz.";
const ASK_ISSUE_MESSAGE = "Şube kodunuz alındı. Lütfen yaşadığınız sorunun kısa özetini iletiniz.";
const FIELD_REQUIREMENT_MESSAGE =
  "Firma adı, ad soyad ve telefon bilgileri isteğe bağlıdır. Talep açmak için şube kodu ve sorun özeti zorunludur.";
const BRANCH_LOCATION_MESSAGE =
  `Sube kodu, firmanizin ${COMPANY_NAME || "sistem"} panelinde tanimli sube veya terminal kodudur. Emin degilseniz firma yoneticinizden teyit edip iletebilirsiniz.`;
const CLOSED_TICKET_STATUS_MESSAGE =
  "Talebiniz daha önce alındı ve destek ekibine iletildi. Dönüş bekleniyor. Yeni bir talep açmak isterseniz yeni şube kodu ve sorun özeti yazabilirsiniz.";
const OUTSIDE_SUPPORT_HOURS_MESSAGE =
  "Canlı destek şu an mesai dışındadır. Talebiniz kayda alındı; mesai saatlerinde temsilciye aktarılacaktır.";

function readTextFileSafe(filePath, fallback = "") {
  try {
    return fs.readFileSync(filePath, "utf8").trim() || fallback;
  } catch (_error) {
    return fallback;
  }
}

function readJsonFileSafe(filePath, fallback = {}) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (_error) {
    return fallback;
  }
}

let SOUL_TEXT = readTextFileSafe(path.join(AGENT_DIR, "soul.md"), "");
let BOOTSTRAP_TEXT = readTextFileSafe(path.join(AGENT_DIR, "bootstrap.md"), "");
let PERSONA_TEXT = readTextFileSafe(path.join(AGENT_DIR, "persona.md"), DEFAULT_PERSONA_TEXT);
let RESPONSE_POLICY_TEXT = readTextFileSafe(
  path.join(AGENT_DIR, "response-policy.md"),
  DEFAULT_POLICY_TEXT
);
let DOMAIN_TEXT = readTextFileSafe(path.join(AGENT_DIR, "domain.md"));
let SKILLS_TEXT = readTextFileSafe(path.join(AGENT_DIR, "skills.md"));
let HARD_BANS_TEXT = readTextFileSafe(path.join(AGENT_DIR, "hard-bans.md"));
let ESCALATION_MATRIX_TEXT = readTextFileSafe(path.join(AGENT_DIR, "escalation-matrix.md"));
let DOD_TEXT = readTextFileSafe(path.join(AGENT_DIR, "definition-of-done.md"));
let OUTPUT_FILTER_TEXT = readTextFileSafe(path.join(AGENT_DIR, "output-filter.md"));
let MEMORY_TEMPLATE = readJsonFileSafe(
  path.join(MEMORY_DIR, "ticket-template.json"),
  DEFAULT_MEMORY_TEMPLATE
);
let CONVERSATION_SCHEMA = readJsonFileSafe(
  path.join(MEMORY_DIR, "conversation-schema.json"),
  { sessionFields: { currentTopic: null, conversationState: "welcome", collectedInfo: {}, turnCount: 0, escalationTriggered: false } }
);
let TOPIC_INDEX = readJsonFileSafe(path.join(TOPICS_DIR, "_index.json"), { topics: [] });

function loadAllAgentConfig() {
  SOUL_TEXT = readTextFileSafe(path.join(AGENT_DIR, "soul.md"), "");
  BOOTSTRAP_TEXT = readTextFileSafe(path.join(AGENT_DIR, "bootstrap.md"), "");
  PERSONA_TEXT = readTextFileSafe(path.join(AGENT_DIR, "persona.md"), DEFAULT_PERSONA_TEXT);
  RESPONSE_POLICY_TEXT = readTextFileSafe(path.join(AGENT_DIR, "response-policy.md"), DEFAULT_POLICY_TEXT);
  DOMAIN_TEXT = readTextFileSafe(path.join(AGENT_DIR, "domain.md"));
  SKILLS_TEXT = readTextFileSafe(path.join(AGENT_DIR, "skills.md"));
  HARD_BANS_TEXT = readTextFileSafe(path.join(AGENT_DIR, "hard-bans.md"));
  ESCALATION_MATRIX_TEXT = readTextFileSafe(path.join(AGENT_DIR, "escalation-matrix.md"));
  DOD_TEXT = readTextFileSafe(path.join(AGENT_DIR, "definition-of-done.md"));
  OUTPUT_FILTER_TEXT = readTextFileSafe(path.join(AGENT_DIR, "output-filter.md"));
  MEMORY_TEMPLATE = readJsonFileSafe(path.join(MEMORY_DIR, "ticket-template.json"), DEFAULT_MEMORY_TEMPLATE);
  CONVERSATION_SCHEMA = readJsonFileSafe(path.join(MEMORY_DIR, "conversation-schema.json"), { sessionFields: { currentTopic: null, conversationState: "welcome", collectedInfo: {}, turnCount: 0, escalationTriggered: false } });
  TOPIC_INDEX = readJsonFileSafe(path.join(TOPICS_DIR, "_index.json"), { topics: [] });
  TOPIC_INDEX_SUMMARY = TOPIC_INDEX.topics.map((t) => `[${t.id}] ${t.title}: ${t.keywords.join(", ")}`).join("\n");
  topicFileCache.clear();
  console.log("Agent config yeniden yuklendi.");
}

let TOPIC_INDEX_SUMMARY = TOPIC_INDEX.topics.map(
  (t) => `[${t.id}] ${t.title}: ${t.keywords.join(", ")}`
).join("\n");

const topicFileCache = new Map();
function loadTopicFile(topicId) {
  if (topicFileCache.has(topicId)) {
    return topicFileCache.get(topicId);
  }
  const topic = TOPIC_INDEX.topics.find((t) => t.id === topicId);
  if (!topic) {
    return "";
  }
  const content = readTextFileSafe(path.join(TOPICS_DIR, topic.file), "");
  topicFileCache.set(topicId, content);
  return content;
}

function getTopicMeta(topicId) {
  return TOPIC_INDEX.topics.find((t) => t.id === topicId) || null;
}

const TICKET_STATUS = {
  HANDOFF_PENDING: "handoff_pending",
  QUEUED_AFTER_HOURS: "queued_after_hours",
  HANDOFF_SUCCESS: "handoff_success",
  HANDOFF_FAILED: "handoff_failed",
  HANDOFF_PARENT_POSTED: "handoff_parent_posted",
  HANDOFF_OPENED_NO_SUMMARY: "handoff_opened_no_summary"
};

const HANDOFF_RESULT_STATUS_MAP = {
  success: TICKET_STATUS.HANDOFF_SUCCESS,
  failed: TICKET_STATUS.HANDOFF_FAILED,
  parent_posted: TICKET_STATUS.HANDOFF_PARENT_POSTED,
  opened_no_summary: TICKET_STATUS.HANDOFF_OPENED_NO_SUMMARY
};

const ACTIVE_TICKET_STATUSES = new Set([
  TICKET_STATUS.HANDOFF_PENDING,
  TICKET_STATUS.QUEUED_AFTER_HOURS,
  TICKET_STATUS.HANDOFF_FAILED,
  TICKET_STATUS.HANDOFF_OPENED_NO_SUMMARY
]);

const DUPLICATE_TICKET_WINDOW_MS = 20 * 60 * 1000;

function nowIso() {
  return new Date().toISOString();
}

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  // First run: copy example KB if no runtime KB exists
  if (!fs.existsSync(CSV_FILE) && fs.existsSync(CSV_EXAMPLE_FILE)) {
    fs.copyFileSync(CSV_EXAMPLE_FILE, CSV_FILE);
  }
}

function ensureTicketsDbFile() {
  ensureDataDir();

  if (!fs.existsSync(TICKETS_DB_FILE)) {
    fs.writeFileSync(TICKETS_DB_FILE, JSON.stringify({ tickets: [] }, null, 2), "utf8");
  }
}

function loadTicketsDb() {
  ensureTicketsDbFile();
  const parsed = readJsonFileSafe(TICKETS_DB_FILE, { tickets: [] });

  if (!Array.isArray(parsed?.tickets)) {
    return { tickets: [] };
  }

  return parsed;
}

function saveTicketsDb(db) {
  ensureTicketsDbFile();
  const safeDb = {
    tickets: Array.isArray(db?.tickets) ? db.tickets : []
  };
  const tempFile = `${TICKETS_DB_FILE}.tmp`;
  fs.writeFileSync(tempFile, JSON.stringify(safeDb, null, 2), "utf8");
  fs.renameSync(tempFile, TICKETS_DB_FILE);
}

function createTicketId() {
  const randomPart = Math.floor(Math.random() * 9000 + 1000);
  return `TK-${Date.now()}-${randomPart}`;
}

function buildTicketRecord(memory, supportAvailability, context = {}) {
  const timestamp = nowIso();
  const initialStatus = supportAvailability?.isOpen
    ? TICKET_STATUS.HANDOFF_PENDING
    : TICKET_STATUS.QUEUED_AFTER_HOURS;

  return {
    id: createTicketId(),
    status: initialStatus,
    createdAt: timestamp,
    updatedAt: timestamp,
    branchCode: memory.branchCode || "",
    issueSummary: memory.issueSummary || "",
    companyName: memory.companyName || "",
    fullName: memory.fullName || "",
    phone: memory.phone || "",
    supportSnapshot: {
      enabled: Boolean(supportAvailability?.enabled),
      isOpen: Boolean(supportAvailability?.isOpen),
      timezone: supportAvailability?.timezone || SUPPORT_TIMEZONE,
      openHour: Number(supportAvailability?.openHour),
      closeHour: Number(supportAvailability?.closeHour),
      openDays: Array.isArray(supportAvailability?.openDays) ? supportAvailability.openDays : []
    },
    source: context.source || "chat-api",
    model: context.model || GOOGLE_MODEL,
    sentiment: context.sentiment || "neutral",
    qualityScore: null,
    firstResponseAt: null,
    resolvedAt: null,
    handoffAttempts: 0,
    lastHandoffAt: "",
    chatHistory: context.chatHistory || [],
    events: [
      {
        at: timestamp,
        type: "ticket_created",
        message:
          initialStatus === TICKET_STATUS.HANDOFF_PENDING
            ? "Talep oluşturuldu ve temsilci aktarımı için hazır."
            : "Talep oluşturuldu, mesai dışı olduğu için sıraya alındı."
      }
    ]
  };
}

function findRecentDuplicateTicket(tickets, memory) {
  if (!memory.branchCode || !memory.issueSummary) {
    return null;
  }

  const now = Date.now();
  for (let i = tickets.length - 1; i >= 0; i -= 1) {
    const ticket = tickets[i];
    if (ticket.branchCode !== memory.branchCode || ticket.issueSummary !== memory.issueSummary) {
      continue;
    }

    const createdAtMs = Date.parse(ticket.createdAt || "");
    if (!Number.isFinite(createdAtMs)) {
      continue;
    }

    if (now - createdAtMs > DUPLICATE_TICKET_WINDOW_MS) {
      continue;
    }

    if (!ACTIVE_TICKET_STATUSES.has(ticket.status)) {
      continue;
    }

    return ticket;
  }

  return null;
}

function createOrReuseTicket(memory, supportAvailability, context = {}) {
  const db = loadTicketsDb();
  const duplicate = findRecentDuplicateTicket(db.tickets, memory);
  if (duplicate) {
    if (Array.isArray(context.chatHistory) && context.chatHistory.length) {
      duplicate.chatHistory = context.chatHistory;
      saveTicketsDb(db);
    }
    return { ticket: duplicate, created: false };
  }

  const ticket = buildTicketRecord(memory, supportAvailability, context);
  db.tickets.push(ticket);
  saveTicketsDb(db);
  return { ticket, created: true };
}

function updateTicketHandoffResult(ticketId, resultStatus, detail = "", meta = {}) {
  const normalizedStatus = HANDOFF_RESULT_STATUS_MAP[resultStatus];
  if (!normalizedStatus) {
    return { error: "Gecersiz handoff status degeri." };
  }

  const db = loadTicketsDb();
  const ticket = db.tickets.find((item) => item.id === ticketId);
  if (!ticket) {
    return { error: "Ticket bulunamadi." };
  }

  const timestamp = nowIso();
  ticket.status = normalizedStatus;
  ticket.updatedAt = timestamp;
  ticket.handoffAttempts = Number(ticket.handoffAttempts || 0) + 1;
  ticket.lastHandoffAt = timestamp;
  ticket.events = Array.isArray(ticket.events) ? ticket.events : [];
  ticket.events.push({
    at: timestamp,
    type: "handoff_result",
    message: detail || resultStatus,
    status: normalizedStatus,
    meta: meta && typeof meta === "object" ? meta : {}
  });

  saveTicketsDb(db);
  return { ticket };
}

function getAdminSummary(tickets) {
  const now = Date.now();
  const last24h = tickets.filter((ticket) => {
    const createdAtMs = Date.parse(ticket.createdAt || "");
    return Number.isFinite(createdAtMs) && now - createdAtMs <= 24 * 60 * 60 * 1000;
  }).length;

  const byStatus = {
    [TICKET_STATUS.HANDOFF_PENDING]: 0,
    [TICKET_STATUS.QUEUED_AFTER_HOURS]: 0,
    [TICKET_STATUS.HANDOFF_SUCCESS]: 0,
    [TICKET_STATUS.HANDOFF_FAILED]: 0,
    [TICKET_STATUS.HANDOFF_PARENT_POSTED]: 0,
    [TICKET_STATUS.HANDOFF_OPENED_NO_SUMMARY]: 0
  };

  for (const ticket of tickets) {
    if (Object.prototype.hasOwnProperty.call(byStatus, ticket.status)) {
      byStatus[ticket.status] += 1;
    }
  }

  return {
    total: tickets.length,
    last24h,
    byStatus
  };
}

function sanitizeTicketForList(ticket) {
  return {
    id: ticket.id,
    status: ticket.status,
    createdAt: ticket.createdAt,
    updatedAt: ticket.updatedAt,
    branchCode: ticket.branchCode,
    issueSummary: ticket.issueSummary,
    companyName: ticket.companyName || "",
    fullName: ticket.fullName || "",
    phone: ticket.phone || "",
    handoffAttempts: Number(ticket.handoffAttempts || 0),
    lastHandoffAt: ticket.lastHandoffAt || "",
    source: ticket.source || "web",
    priority: ticket.priority || "normal",
    assignedTo: ticket.assignedTo || "",
    csatRating: ticket.csatRating || null
  };
}

function requireAdminAccess(req, res, next) {
  if (!ADMIN_TOKEN) {
    return res.status(503).json({ error: "Admin panel yapilandirilmamis. ADMIN_TOKEN ayarlayin." });
  }

  const headerToken = String(req.headers["x-admin-token"] || "").trim();
  const queryToken = String(req.query.token || "").trim();
  const candidate = headerToken || queryToken;
  if (!candidate || candidate.length !== ADMIN_TOKEN.length) {
    return res.status(401).json({ error: "Admin erisimi icin token gerekli." });
  }

  const candidateBuf = Buffer.from(candidate);
  const tokenBuf = Buffer.from(ADMIN_TOKEN);
  if (!crypto.timingSafeEqual(candidateBuf, tokenBuf)) {
    return res.status(401).json({ error: "Admin erisimi icin token gerekli." });
  }

  return next();
}

function loadCSVData() {
  try {
    const raw = fs.readFileSync(CSV_FILE, "utf8");
    const result = Papa.parse(raw, { header: true, skipEmptyLines: true });
    return result.data || [];
  } catch (err) {
    console.warn("CSV yuklenemedi:", err.message);
    return [];
  }
}

function saveCSVData(rows) {
  const csv = Papa.unparse(rows, { header: true });
  fs.writeFileSync(CSV_FILE, csv, "utf8");
}

function readEnvFile() {
  try {
    const raw = fs.readFileSync(path.join(__dirname, ".env"), "utf8");
    const result = {};
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx < 0) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const value = trimmed.slice(eqIdx + 1).trim();
      result[key] = value;
    }
    return result;
  } catch (err) {
    return {};
  }
}

function writeEnvFile(updates) {
  const envPath = path.join(__dirname, ".env");
  let raw = "";
  try { raw = fs.readFileSync(envPath, "utf8"); } catch (err) { /* ignore */ }

  const lines = raw.split("\n");
  const updatedKeys = new Set();
  const newLines = lines.map(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return line;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx < 0) return line;
    const key = trimmed.slice(0, eqIdx).trim();
    if (key in updates) {
      updatedKeys.add(key);
      return `${key}=${updates[key]}`;
    }
    return line;
  });

  // Add new keys that weren't in the file
  for (const [key, value] of Object.entries(updates)) {
    if (!updatedKeys.has(key)) {
      newLines.push(`${key}=${value}`);
    }
  }

  fs.writeFileSync(envPath, newLines.join("\n"), "utf8");
}

function reloadRuntimeEnv() {
  const env = readEnvFile();
  if (env.GOOGLE_API_KEY) GOOGLE_API_KEY = env.GOOGLE_API_KEY;
  if (env.GOOGLE_MODEL) GOOGLE_MODEL = env.GOOGLE_MODEL;
  if (env.GOOGLE_MAX_OUTPUT_TOKENS) GOOGLE_MAX_OUTPUT_TOKENS = Number(env.GOOGLE_MAX_OUTPUT_TOKENS) || GOOGLE_MAX_OUTPUT_TOKENS;
  if (env.GOOGLE_THINKING_BUDGET !== undefined) GOOGLE_THINKING_BUDGET = Number(env.GOOGLE_THINKING_BUDGET);
  if (env.GOOGLE_REQUEST_TIMEOUT_MS) GOOGLE_REQUEST_TIMEOUT_MS = Number(env.GOOGLE_REQUEST_TIMEOUT_MS) || GOOGLE_REQUEST_TIMEOUT_MS;
  if (env.GOOGLE_FALLBACK_MODEL !== undefined) GOOGLE_FALLBACK_MODEL = (env.GOOGLE_FALLBACK_MODEL || "").trim();
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
  const providerKeys = ["LLM_PROVIDER", "LLM_API_KEY", "LLM_MODEL", "LLM_BASE_URL", "LLM_FALLBACK_MODEL", "LLM_MAX_OUTPUT_TOKENS", "LLM_REQUEST_TIMEOUT_MS", "EMBEDDING_PROVIDER", "EMBEDDING_MODEL", "EMBEDDING_API_KEY", "EMBEDDING_BASE_URL", "EMBEDDING_DIMENSIONS"];
  for (const key of providerKeys) {
    if (env[key] !== undefined) process.env[key] = env[key];
  }
  console.log("[ENV] Runtime degiskenleri guncellendi. Model:", GOOGLE_MODEL);
}

function isValidFilename(name) {
  if (!name || typeof name !== "string") return false;
  if (name.includes("..") || name.includes("/") || name.includes("\\")) return false;
  if (!/^[a-zA-Z0-9_\-]+\.(md|json)$/.test(name)) return false;
  return true;
}

function getTimePartsInTimeZone(date, timeZone) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  });
  const parts = formatter.formatToParts(date);
  const weekdayText = parts.find((part) => part.type === "weekday")?.value || "";
  const hour = Number(parts.find((part) => part.type === "hour")?.value || 0);
  const minute = Number(parts.find((part) => part.type === "minute")?.value || 0);

  const weekdayMap = {
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
    Sun: 7
  };

  return {
    weekday: weekdayMap[weekdayText] || 0,
    hour: Number.isFinite(hour) ? hour : 0,
    minute: Number.isFinite(minute) ? minute : 0
  };
}

function isHourWithinWindow(hour, startHour, endHour) {
  if (startHour === endHour) {
    return true;
  }

  if (startHour < endHour) {
    return hour >= startHour && hour < endHour;
  }

  return hour >= startHour || hour < endHour;
}

function getSupportAvailability(now = new Date()) {
  const base = {
    enabled: SUPPORT_HOURS_ENABLED,
    timezone: SUPPORT_TIMEZONE,
    openHour: SUPPORT_OPEN_HOUR,
    closeHour: SUPPORT_CLOSE_HOUR,
    openDays: SUPPORT_OPEN_DAYS,
    isOpen: true,
    weekday: 0,
    hour: 0,
    minute: 0
  };

  if (!SUPPORT_HOURS_ENABLED) {
    return base;
  }

  try {
    const timeParts = getTimePartsInTimeZone(now, SUPPORT_TIMEZONE);
    const openDaySet = SUPPORT_OPEN_DAYS.length ? SUPPORT_OPEN_DAYS : [1, 2, 3, 4, 5, 6, 7];
    const isOpenDay = openDaySet.includes(timeParts.weekday);
    const isOpenHour = isHourWithinWindow(timeParts.hour, SUPPORT_OPEN_HOUR, SUPPORT_CLOSE_HOUR);

    return {
      ...base,
      weekday: timeParts.weekday,
      hour: timeParts.hour,
      minute: timeParts.minute,
      isOpen: isOpenDay && isOpenHour
    };
  } catch (_error) {
    // Timezone hesaplamasi hata verirse destek akisinin tamamen durmasini engelle.
    return base;
  }
}

function getStatusFollowupMessage() {
  const template = MEMORY_TEMPLATE?.statusFollowupTemplate;
  if (typeof template === "string" && template.trim()) {
    return template.trim();
  }
  return CLOSED_TICKET_STATUS_MESSAGE;
}

function getOutsideSupportHoursMessage() {
  const template = MEMORY_TEMPLATE?.outsideSupportHoursTemplate;
  if (typeof template === "string" && template.trim()) {
    return template.trim();
  }
  return OUTSIDE_SUPPORT_HOURS_MESSAGE;
}

function sanitizeIssueSummary(text, branchCode = "") {
  let cleaned = text
    .replace(/(?:sube|[\u015f\u015e]ube)\s*(?:kodu|kod)?\s*[:=-]?\s*[A-Za-z0-9-]{2,20}/gi, "")
    .replace(/(?:ad\s*soyad|telefon|firma(?:\s*adi)?)\s*[:=-]?\s*[^,.;\n]+/gi, "")
    .replace(
      /^((merhaba|selam|iyi\s*g(?:u|\u00fc)nler|iyi\s*ak(?:s|\u015f)amlar|iyi\s*cali(?:s|\u015f)malar)[,.\s-]*)+/i,
      ""
    )
    .replace(/^yeni\s*talep\s*[:\-]?\s*/i, "")
    .replace(/,\s*\./g, ".")
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/([.]){2,}/g, ".")
    .replace(/^[,.;:\s-]+|[,.;:\s-]+$/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 240);

  if (branchCode) {
    const escapedBranch = String(branchCode).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    cleaned = cleaned
      .replace(new RegExp(`\\b${escapedBranch}\\b`, "gi"), "")
      .replace(/^\s*ve\s+/i, "")
      .replace(/\s+ve\s+$/i, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  if (!cleaned) {
    return "";
  }

  return cleaned[0].toUpperCase() + cleaned.slice(1);
}
function normalizeForMatching(text) {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ş/g, "s").replace(/Ş/g, "s")
    .replace(/ç/g, "c").replace(/Ç/g, "c")
    .replace(/ı/g, "i").replace(/İ/g, "i")
    .replace(/ö/g, "o").replace(/Ö/g, "o")
    .replace(/ü/g, "u").replace(/Ü/g, "u")
    .replace(/ğ/g, "g").replace(/Ğ/g, "g")
    .toLowerCase()
    .replace(/[.!?]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function detectTopicFromMessages(userMessages) {
  if (!TOPIC_INDEX.topics.length || !userMessages.length) {
    return { topicId: null, confidence: 0, method: "none" };
  }

  const allText = userMessages.join(" ");
  const normalized = normalizeForMatching(allText);

  let bestMatch = null;
  let bestScore = 0;

  for (const topic of TOPIC_INDEX.topics) {
    for (const keyword of topic.keywords) {
      const normalizedKeyword = normalizeForMatching(keyword);
      if (normalized.includes(normalizedKeyword)) {
        const score = normalizedKeyword.length;
        if (score > bestScore) {
          bestScore = score;
          bestMatch = topic.id;
        }
      }
    }
  }

  if (bestMatch) {
    return { topicId: bestMatch, confidence: 0.9, method: "keyword" };
  }

  return { topicId: null, confidence: 0, method: "none" };
}

function detectEscalationTriggers(text) {
  const normalized = normalizeForMatching(text);
  const toolName = REMOTE_TOOL_NAME || "remote_tool";
  const toolPattern = REMOTE_TOOL_NAME
    ? new RegExp(REMOTE_TOOL_NAME.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i")
    : null;

  if (toolPattern) {
    const idPattern = new RegExp(`(?:${toolPattern.source}\\s*(?:id|no|numara)?\\s*[:=\\-]?\\s*\\d+)`, "i");
    const passPattern = /(?:(?:parola|sifre|şifre)\s*[:=\-]?\s*\d+)/i;
    const hasToolId = idPattern.test(text);
    const hasToolPass = passPattern.test(text);

    if (hasToolId && hasToolPass) {
      return { shouldEscalate: true, reason: `${toolName}_credentials` };
    }

    const bothInOneLine = /\d{3,}[\s,;.\-]+\d{3,}/.test(text) &&
      toolPattern.test(normalized);
    if (bothInOneLine) {
      return { shouldEscalate: true, reason: `${toolName}_credentials` };
    }
  }

  return { shouldEscalate: false, reason: null };
}

function buildConversationContext(memory, userMessages) {
  const context = {
    currentTopic: null,
    topicConfidence: 0,
    conversationState: "welcome_or_greet",
    collectedInfo: {},
    turnCount: userMessages.length,
    escalationTriggered: false,
    escalationReason: null,
    farewellOffered: false
  };

  if (!userMessages.length) {
    return context;
  }

  const latestMessage = userMessages[userMessages.length - 1] || "";

  const escalation = detectEscalationTriggers(latestMessage);
  if (escalation.shouldEscalate) {
    context.escalationTriggered = true;
    context.escalationReason = escalation.reason;
    context.conversationState = "escalation_handoff";
    return context;
  }

  const topicResult = detectTopicFromMessages(userMessages);
  if (topicResult.topicId) {
    context.currentTopic = topicResult.topicId;
    context.topicConfidence = topicResult.confidence;
    context.conversationState = "topic_guided_support";
  } else if (isGreetingOnlyMessage(latestMessage)) {
    context.conversationState = "welcome_or_greet";
  } else {
    // Keyword eslesmese bile AI konu tespiti yapabilir.
    // Teknik icerikli mesajlarda topic_detection state'ine gec
    // boylece Gemini tum konu listesini gorur ve dogru yonlendirme yapar.
    context.conversationState = "topic_detection";
  }

  if (memory.branchCode) {
    context.collectedInfo.branchCode = memory.branchCode;
  }
  if (memory.companyName) {
    context.collectedInfo.companyName = memory.companyName;
  }

  return context;
}

function isNonIssueMessage(text) {
  return NON_ISSUE_MESSAGE_SET.has(normalizeForMatching(text));
}

function isStatusFollowupMessage(text) {
  if (typeof text !== "string" || !text.trim()) {
    return false;
  }

  const normalized = normalizeForMatching(text);
  if (!normalized) {
    return false;
  }

  if (ISSUE_HINT_REGEX.test(normalized)) {
    return false;
  }

  return STATUS_FOLLOWUP_REGEX.test(normalized);
}

function isFieldClarificationMessage(text) {
  if (typeof text !== "string" || !text.trim()) {
    return false;
  }

  const normalized = normalizeForMatching(text);
  const hasFieldTerm = FIELD_CLARIFICATION_REGEX.test(normalized);
  const hasQuestionIntent = QUESTION_INTENT_REGEX.test(normalized) || text.includes("?");

  return hasFieldTerm && hasQuestionIntent;
}

function isGreetingOnlyMessage(text) {
  const normalized = normalizeForMatching(text);
  if (!normalized) {
    return false;
  }

  if (NON_ISSUE_MESSAGE_SET.has(normalized)) {
    return true;
  }

  return /^(hi|hello|selamlar|merhabalar)$/.test(normalized);
}

function sanitizeAssistantReply(text) {
  return String(text || "")
    .replace(/\r/g, "")
    // Keep **bold** and *italic* for client-side markdown rendering
    .replace(/`{1,3}/g, "")
    .replace(/#{1,6}\s/g, "") // Remove heading markers
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, 800);
}

function buildMissingFieldsReply(memory, latestUserMessage = "") {
  const normalizedLatest = normalizeForMatching(latestUserMessage);

  if (FIELD_REQUIREMENT_QUESTION_REGEX.test(normalizedLatest)) {
    return FIELD_REQUIREMENT_MESSAGE;
  }

  if (BRANCH_LOCATION_QUESTION_REGEX.test(normalizedLatest)) {
    return BRANCH_LOCATION_MESSAGE;
  }

  if (!memory.branchCode && !memory.issueSummary) {
    return WELCOME_AND_COLLECT_MESSAGE;
  }

  if (!memory.branchCode) {
    return ASK_BRANCH_MESSAGE;
  }

  if (!memory.issueSummary) {
    return ASK_ISSUE_MESSAGE;
  }

  return WELCOME_AND_COLLECT_MESSAGE;
}

function buildDeterministicCollectionReply(memory, activeUserMessages, hasClosedTicketHistory) {
  if (!DETERMINISTIC_COLLECTION_MODE) {
    return null;
  }

  const latestUserMessage = activeUserMessages[activeUserMessages.length - 1] || "";
  const normalizedLatest = normalizeForMatching(latestUserMessage);

  if (!latestUserMessage) {
    return WELCOME_AND_COLLECT_MESSAGE;
  }

  if (
    !memory.branchCode &&
    !memory.issueSummary &&
    (isGreetingOnlyMessage(latestUserMessage) || NEW_TICKET_INTENT_REGEX.test(normalizedLatest))
  ) {
    return WELCOME_AND_COLLECT_MESSAGE;
  }

  if (isFieldClarificationMessage(latestUserMessage)) {
    if (FIELD_REQUIREMENT_QUESTION_REGEX.test(normalizedLatest)) {
      return FIELD_REQUIREMENT_MESSAGE;
    }

    if (BRANCH_LOCATION_QUESTION_REGEX.test(normalizedLatest)) {
      return BRANCH_LOCATION_MESSAGE;
    }

    return buildMissingFieldsReply(memory, latestUserMessage);
  }

  if (!memory.branchCode || !memory.issueSummary) {
    if (
      hasClosedTicketHistory &&
      !memory.branchCode &&
      !memory.issueSummary &&
      isNonIssueMessage(latestUserMessage)
    ) {
      return WELCOME_AND_COLLECT_MESSAGE;
    }

    return buildMissingFieldsReply(memory, latestUserMessage);
  }

  return null;
}

function isLikelyBranchCode(value) {
  if (typeof value !== "string") {
    return false;
  }

  const code = value.trim().toUpperCase();

  if (!/^[A-Z0-9-]{2,20}$/.test(code)) {
    return false;
  }

  if (!/[0-9]/.test(code)) {
    return false;
  }

  if (/^(?:\+?90)?0?\d{10}$/.test(code)) {
    return false;
  }

  return true;
}

function extractBranchCodeFromText(text) {
  if (typeof text !== "string" || !text.trim()) {
    return "";
  }

  const patterns = [
    /(?:sube|[\u015f\u015e]ube)\s*(?:kodu|kod)?\s*[:=-]\s*([A-Za-z0-9-]{2,20})/i,
    /(?:sube|[\u015f\u015e]ube)\s*(?:kodu|kod)?\s+([A-Za-z0-9-]{2,20})/i,
    /(?:branch)\s*(?:code)?\s*[:=-]\s*([A-Za-z0-9-]{2,20})/i,
    /(?:branch)\s*(?:code)?\s+([A-Za-z0-9-]{2,20})/i
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    const candidate = match?.[1]?.toUpperCase() || "";

    if (isLikelyBranchCode(candidate)) {
      return candidate;
    }
  }

  const standaloneMatch = text.match(/^\s*([A-Za-z0-9-]{2,20})\s*$/);
  const standaloneCandidate = standaloneMatch?.[1]?.toUpperCase() || "";

  if (isLikelyBranchCode(standaloneCandidate)) {
    return standaloneCandidate;
  }

  const hasIssueContext = ISSUE_HINT_REGEX.test(normalizeForMatching(text));
  if (hasIssueContext) {
    const tokens = text.match(/[A-Za-z0-9-]{2,20}/g) || [];
    for (const token of tokens) {
      const candidate = String(token || "").toUpperCase();
      if (!candidate) {
        continue;
      }

      if (!isLikelyBranchCode(candidate)) {
        continue;
      }

      if (!/[0-9]/.test(candidate)) {
        continue;
      }

      if (candidate.length > 8) {
        continue;
      }

      return candidate;
    }
  }

  return "";
}

function isAssistantConfirmationMessage(message) {
  return Boolean(
    message &&
      message.role === "assistant" &&
      typeof message.content === "string" &&
      CONFIRMATION_PREFIX_REGEX.test(message.content.trim())
  );
}

function isAssistantEscalationMessage(message) {
  return Boolean(
    message &&
      message.role === "assistant" &&
      typeof message.content === "string" &&
      ESCALATION_MESSAGE_REGEX.test(normalizeForMatching(message.content))
  );
}

function getLastAssistantMessage(messages) {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i]?.role === "assistant" && typeof messages[i]?.content === "string") {
      return messages[i];
    }
  }
  return null;
}

function parseClosedTicketFromAssistantMessage(message) {
  if (!isAssistantConfirmationMessage(message)) {
    return null;
  }

  const text = String(message.content || "");
  const branchCode = text.match(/Sube kodu:\s*([^.\n]+)\./i)?.[1]?.trim() || "";
  const issueSummary =
    text.match(/Kisa aciklama:\s*([\s\S]+?)\.\s*Destek ekibi/i)?.[1]?.trim() || "";

  if (!branchCode || !issueSummary) {
    return null;
  }

  return {
    branchCode: branchCode.toUpperCase(),
    issueSummary,
    companyName: "",
    fullName: "",
    phone: ""
  };
}

function getUserMessages(messages) {
  return messages
    .filter((item) => item?.role === "user" && typeof item?.content === "string")
    .map((item) => item.content.trim())
    .filter(Boolean);
}

function splitActiveTicketMessages(rawMessages) {
  let lastConfirmationIndex = -1;
  let lastClosedTicketMemory = null;

  for (let i = 0; i < rawMessages.length; i += 1) {
    const maybeClosedTicket = parseClosedTicketFromAssistantMessage(rawMessages[i]);
    if (maybeClosedTicket) {
      lastConfirmationIndex = i;
      lastClosedTicketMemory = maybeClosedTicket;
    }
  }

  const activeMessages = rawMessages.slice(lastConfirmationIndex + 1);
  const hasClosedTicketHistory = lastConfirmationIndex >= 0;

  return { activeMessages, hasClosedTicketHistory, lastClosedTicketMemory };
}

function extractTicketMemory(activeMessages) {
  const memory = {
    branchCode: "",
    issueSummary: "",
    companyName: "",
    fullName: "",
    phone: ""
  };

  const userMessages = getUserMessages(activeMessages);

  for (const text of userMessages) {
    if (!memory.branchCode) {
      const extractedBranchCode = extractBranchCodeFromText(text);
      if (extractedBranchCode) {
        memory.branchCode = extractedBranchCode;
      }
    }

    if (!memory.companyName) {
      const companyMatch = text.match(
        /(?:firma(?:\s*adi)?|company)\s*[:=-]?\s*([A-Za-z0-9 .,&-]{2,80})/i
      );
      if (companyMatch?.[1]) {
        memory.companyName = companyMatch[1].trim();
      }
    }

    if (!memory.fullName) {
      const fullNameMatch = text.match(
        /(?:ad\s*soyad|isim|yetkili)\s*[:=-]?\s*([A-Za-z .,'-]{3,80})/i
      );
      if (fullNameMatch?.[1]) {
        memory.fullName = fullNameMatch[1].trim();
      }
    }

    if (!memory.phone) {
      const phoneMatch = text.match(/(?:\+?90\s*)?(0?\d{10,11})/);
      if (phoneMatch?.[0]) {
        memory.phone = phoneMatch[0].replace(/\s+/g, "");
      }
    }
  }

  for (let i = userMessages.length - 1; i >= 0; i -= 1) {
    const rawUserText = userMessages[i];

    if (isFieldClarificationMessage(rawUserText)) {
      continue;
    }

    if (isStatusFollowupMessage(rawUserText)) {
      continue;
    }

    const candidate = sanitizeIssueSummary(rawUserText, memory.branchCode);
    if (!candidate || isNonIssueMessage(candidate)) {
      continue;
    }

    if (candidate.length >= 8 && /[A-Za-z]/.test(candidate)) {
      memory.issueSummary = candidate;
      break;
    }
  }

  return memory;
}

function hasRequiredFields(memory) {
  return Boolean(memory.branchCode && memory.issueSummary);
}

function buildConfirmationMessage(memory) {
  const template =
    typeof MEMORY_TEMPLATE?.confirmationTemplate === "string" &&
    MEMORY_TEMPLATE.confirmationTemplate.trim()
      ? MEMORY_TEMPLATE.confirmationTemplate
      : DEFAULT_MEMORY_TEMPLATE.confirmationTemplate;

  return template
    .replace("{{branchCode}}", memory.branchCode)
    .replace("{{issueSummary}}", memory.issueSummary);
}

function buildSystemPrompt(memory, conversationContext, knowledgeResults) {
  const parts = [];

  // 1. Kimlik
  if (SOUL_TEXT) {
    parts.push(SOUL_TEXT);
  }

  // 2. Alan bilgisi
  if (DOMAIN_TEXT) {
    parts.push(DOMAIN_TEXT);
  }

  // 3. Session başlatma
  if (BOOTSTRAP_TEXT) {
    parts.push(BOOTSTRAP_TEXT);
  }

  // 4. Konuşma tarzı
  parts.push(PERSONA_TEXT);

  // 5. Yetenek matrisi
  if (SKILLS_TEXT) {
    parts.push(SKILLS_TEXT);
  }

  // 6. Kesin yasaklar
  if (HARD_BANS_TEXT) {
    parts.push(HARD_BANS_TEXT);
  }

  // 7. Escalation matrisi
  if (ESCALATION_MATRIX_TEXT) {
    parts.push(ESCALATION_MATRIX_TEXT);
  }

  // 8. Durum akışı
  parts.push(RESPONSE_POLICY_TEXT);

  // 9. Başarı kriterleri
  if (DOD_TEXT) {
    parts.push(DOD_TEXT);
  }

  // 10. Çıktı filtreleme
  if (OUTPUT_FILTER_TEXT) {
    parts.push(OUTPUT_FILTER_TEXT);
  }

  // Konu listesini HER ZAMAN ekle - AI kendi anlamsal analiziyle dogru konuyu tespit eder
  parts.push(`## Destek Konuları Listesi\nKullanıcının talebini aşağıdaki konulardan en uygun olanıyla eşleştir. Keyword'lere değil anlama bak.\n${TOPIC_INDEX_SUMMARY}`);

  // Keyword ile on-eslesme yapildiysa detayli konu dosyasini da ekle (bonus context)
  if (conversationContext?.currentTopic) {
    const topicContent = loadTopicFile(conversationContext.currentTopic);
    const topicMeta = getTopicMeta(conversationContext.currentTopic);
    if (topicContent) {
      parts.push(`## Tespit Edilen Konu Detayı\nKonu: ${topicMeta?.title || conversationContext.currentTopic}\n${topicContent}`);
      if (topicMeta?.requiredInfo?.length) {
        parts.push(`## Bu Konu İçin Toplanması Gereken Bilgiler\n${topicMeta.requiredInfo.join(", ")}`);
      }
      if (topicMeta?.requiresEscalation) {
        parts.push("## Not: Bu konu sonunda canlı temsilciye aktarım gerektirir.");
      }
      if (topicMeta?.canResolveDirectly) {
        parts.push("## Not: Bu konuda bilgilendirme yapıldıktan sonra uğurlama prosedürüne geçilmelidir.");
      }
    }
  }

  if (conversationContext?.escalationTriggered) {
    parts.push(`## ESCALATION TETİKLENDİ\nSebep: ${conversationContext.escalationReason}\nEscalation mesajı gönder: "Sizi canlı destek temsilcimize aktarıyorum. Kısa sürede yardımcı olacaktır."`);
  }

  parts.push(`Memory schema: ${JSON.stringify(MEMORY_TEMPLATE)}`);
  parts.push(`Current memory: ${JSON.stringify(memory)}`);
  parts.push(`Conversation state: ${JSON.stringify(conversationContext || {})}`);

  parts.push("Yanıtları düz metin üret. Markdown, liste, kod bloğu ve başlık kullanma.");
  parts.push("Yanıtların kısa olsun (1-4 cümle, bilgilendirmelerde 5-6 cümle) ve destek amacına hizmet etsin.");
  parts.push("Kullanıcının talebini yukarıdaki konu listesiyle eşleştir. Sadece keyword'lere değil anlamına bak. Örneğin 'bilet kesemiyorum' = 'bilet yazdıramıyorum', 'ekran dondu' = 'giriş yapamıyorum' gibi.");
  parts.push("Konu tespit ettiysen o konunun akışını (troubleshooting, bilgilendirme, escalation) uygula. Detaylı konu dosyası varsa onu takip et, yoksa konu listesindeki başlığa uygun yönlendirme yap.");
  parts.push("Hiçbir konuyla eşleşmiyorsa ve teknik destek dışıysa, şube kodu + sorun özeti toplayarak ticket oluştur.");
  parts.push("ÖNEMLİ: Escalation yapmadan ÖNCE mutlaka şube kodunu topla. Şube kodu yoksa escalation mesajı verme, önce şube kodunu sor.");
  parts.push("ÖNEMLİ: Escalation öncesi ONAY sor. Direkt aktarma. Önce şu mesajı ver: 'Bu konuda canlı destek temsilcimiz size yardımcı olabilir. Sizi temsilcimize aktarmamı ister misiniz?' Kullanıcı onay verdikten sonra (evet, tamam, olur, aktar gibi): 'Sizi canlı destek temsilcimize aktarıyorum. Kısa sürede yardımcı olacaktır.' Tek istisna: Kullanıcı kendisi 'temsilciye aktar' veya 'canlı destek istiyorum' derse direkt aktarım mesajı ver.");
  parts.push("Onay metni (sadece ticket toplama için): Talebinizi aldım. Şube kodu: <KOD>. Kısa açıklama: <ÖZET>. Destek ekibi en kısa sürede dönüş yapacaktır.");
  parts.push("Uygun olduğunda yanıtının sonuna hızlı yanıt seçenekleri ekle: [QUICK_REPLIES: secenek1 | secenek2 | secenek3]. Maks 3 seçenek. Yalnızca kullanıcıyı yönlendirmek mantıklıysa ekle.");

  // RAG: Bilgi tabani sonuclarini ekle
  if (Array.isArray(knowledgeResults) && knowledgeResults.length > 0) {
    const kbLines = ["## Bilgi Tabanı Sonuçları",
      "Aşağıdaki soru-cevap çiftleri kullanıcının sorusuyla ilişkili olabilir.",
      "Bu bilgileri kullanarak yanıt ver, ama kullanıcının sorusuna uygun değilse görmezden gel.", ""];
    for (const item of knowledgeResults) {
      kbLines.push(`Soru: ${item.question}`);
      kbLines.push(`Cevap: ${item.answer}`);
      kbLines.push("");
    }
    parts.push(kbLines.join("\n"));
  }

  return parts.join("\n\n");
}

// buildGenerationConfig, callGemini, callGeminiWithFallback — moved to lib/providers.js

async function initKnowledgeBase() {
  try {
    const db = await lancedb.connect(LANCE_DB_PATH);
    knowledgeTable = await db.openTable("knowledge_qa");
    const rowCount = await knowledgeTable.countRows();
    console.log(`Bilgi tabani yuklendi: ${rowCount} kayit.`);
  } catch (err) {
    console.warn("Bilgi tabani yuklenemedi:", err.message);
  }
}

async function reingestKnowledgeBase() {
  const rows = loadCSVData();
  if (!rows.length) {
    knowledgeTable = null;
    return;
  }

  const records = [];
  for (const row of rows) {
    if (!row.question || !row.answer) continue;
    try {
      const vector = await embedText(row.question);
      records.push({ question: row.question, answer: row.answer, vector });
    } catch (err) {
      console.warn("Embedding hatasi (skip):", row.question?.slice(0, 40), err.message);
    }
  }

  if (!records.length) {
    knowledgeTable = null;
    return;
  }

  const db = await lancedb.connect(LANCE_DB_PATH);
  // Drop existing table and recreate
  try { await db.dropTable("knowledge_qa"); } catch (_e) { /* table may not exist */ }
  knowledgeTable = await db.createTable("knowledge_qa", records);
  console.log(`Bilgi tabani yeniden yuklendi: ${records.length} kayit.`);
}

// embedText — moved to lib/providers.js

// ── Full-text search helper ──────────────────────────────────────────────
function fullTextSearch(query, topK = 5) {
  try {
    const rows = loadCSVData();
    if (!rows.length) return [];
    const queryLower = query.toLowerCase();
    const queryWords = queryLower.split(/\s+/).filter(w => w.length > 2);
    if (!queryWords.length) return [];

    const scored = [];
    for (const row of rows) {
      if (!row.question || !row.answer) continue;
      const qLower = (row.question || "").toLowerCase();
      const aLower = (row.answer || "").toLowerCase();
      let score = 0;
      // Exact substring match (highest weight)
      if (qLower.includes(queryLower) || aLower.includes(queryLower)) {
        score += 10;
      }
      // Individual word matches
      for (const word of queryWords) {
        if (qLower.includes(word)) score += 2;
        if (aLower.includes(word)) score += 1;
      }
      if (score > 0) {
        scored.push({ question: row.question, answer: row.answer, textScore: score });
      }
    }
    scored.sort((a, b) => b.textScore - a.textScore);
    return scored.slice(0, topK);
  } catch (_e) {
    return [];
  }
}

// ── Reciprocal Rank Fusion ──────────────────────────────────────────────
function reciprocalRankFusion(vectorResults, textResults, k = 60) {
  const scoreMap = new Map();
  const dataMap = new Map();

  vectorResults.forEach((item, rank) => {
    const key = (item.question || "").slice(0, 100);
    scoreMap.set(key, (scoreMap.get(key) || 0) + 1 / (k + rank + 1));
    dataMap.set(key, item);
  });

  textResults.forEach((item, rank) => {
    const key = (item.question || "").slice(0, 100);
    scoreMap.set(key, (scoreMap.get(key) || 0) + 1 / (k + rank + 1));
    if (!dataMap.has(key)) dataMap.set(key, item);
  });

  return Array.from(scoreMap.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([key, score]) => ({ ...dataMap.get(key), rrfScore: score }));
}

async function searchKnowledge(query, topK = 3) {
  // Full-text search (always available)
  const textResults = fullTextSearch(query, topK * 2);

  // Vector search
  let vectorResults = [];
  if (knowledgeTable) {
    try {
      const queryVector = await embedText(query);
      const results = await knowledgeTable
        .vectorSearch(queryVector)
        .limit(topK * 2)
        .toArray();
      vectorResults = results
        .filter((r) => r._distance < 1.0)
        .map((r) => ({ question: r.question, answer: r.answer, distance: r._distance }));
    } catch (err) {
      console.warn("Bilgi tabani vector arama hatasi:", err.message);
    }
  }

  // Hybrid: RRF fusion if both have results
  if (vectorResults.length && textResults.length) {
    const fused = reciprocalRankFusion(vectorResults, textResults);
    return fused.slice(0, topK);
  }

  // Fallback to whichever has results
  if (vectorResults.length) return vectorResults.slice(0, topK);
  if (textResults.length) return textResults.slice(0, topK).map(r => ({ question: r.question, answer: r.answer, distance: 0.5 }));
  return [];
}

async function generateEscalationSummary(contents, memory, conversationContext) {
  const fallback = memory.issueSummary
    || conversationContext?.currentTopic
    || "Canlı destek talebi";

  const providerCfg = getProviderConfig();
  if (!providerCfg.apiKey && providerCfg.provider !== "ollama") return fallback;

  const summaryPrompt = [
    "Aşağıdaki konuşma geçmişini analiz et ve canlı destek temsilcisi için kısa bir sorun özeti yaz.",
    "Kurallar:",
    "- Türkçe yaz, düz metin, 1-2 cümle.",
    "- Kullanıcının sorununu, ilettiği bilgileri (şube kodu, firma, hata mesajı vb.) ve yapılan adımları özetle.",
    "- Sadece özeti yaz, başka bir şey yazma."
  ].join("\n");

  try {
    const result = await callLLMWithFallback(contents, summaryPrompt, 512);
    const summary = (result.reply || "").trim();
    return summary || fallback;
  } catch (_err) {
    return fallback;
  }
}

// ── Sentiment Analysis (keyword-based) ──────────────────────────────────
const POSITIVE_WORDS = new Set(["tesekkurler", "tesekkur", "sagol", "sagolun", "harika", "super", "muhtesem", "guzel", "memnunum", "tatmin", "basarili", "cozuldu", "duzeldim", "halloldu", "cok iyi"]);
const NEGATIVE_WORDS = new Set(["rezalet", "skandal", "berbat", "korkunç", "iğrenç", "kotu", "kizgin", "sinirli", "saçma", "aptal", "yetersiz", "beceriksiz", "cozumsuz", "hala bekliyorum", "maalesef", "hayal kirikligi", "sikayetci", "utanç"]);

function analyzeSentiment(text) {
  if (!text) return "neutral";
  const normalized = (text || "").toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, "");
  let posScore = 0, negScore = 0;
  for (const word of POSITIVE_WORDS) { if (normalized.includes(word)) posScore++; }
  for (const word of NEGATIVE_WORDS) { if (normalized.includes(word)) negScore++; }
  if (negScore >= 2) return "angry";
  if (negScore > posScore) return "negative";
  if (posScore > negScore) return "positive";
  return "neutral";
}

// ── Content Gap Detection ───────────────────────────────────────────────
function loadContentGaps() {
  try {
    if (fs.existsSync(CONTENT_GAPS_FILE)) return JSON.parse(fs.readFileSync(CONTENT_GAPS_FILE, "utf8"));
  } catch (_e) { /* silent */ }
  return { gaps: [] };
}

function saveContentGaps(data) {
  if (data.gaps.length > 500) data.gaps = data.gaps.slice(-500);
  fs.writeFileSync(CONTENT_GAPS_FILE, JSON.stringify(data, null, 2), "utf8");
}

function recordContentGap(query) {
  const data = loadContentGaps();
  const normalized = (query || "").toLowerCase().trim().slice(0, 200);
  if (!normalized) return;
  const existing = data.gaps.find(g => g.query === normalized);
  if (existing) {
    existing.count++;
    existing.lastSeen = nowIso();
  } else {
    data.gaps.push({ query: normalized, count: 1, firstSeen: nowIso(), lastSeen: nowIso() });
  }
  saveContentGaps(data);
}

// ── PII Masking ─────────────────────────────────────────────────────────
function maskPII(text) {
  if (!text || typeof text !== "string") return text;
  // TC Kimlik No (11 digits)
  let masked = text.replace(/\b\d{11}\b/g, "[TC_MASKED]");
  // Phone numbers (05xx xxx xx xx patterns)
  masked = masked.replace(/\b0?5\d{2}[\s\-.]?\d{3}[\s\-.]?\d{2}[\s\-.]?\d{2}\b/g, "[TEL_MASKED]");
  // Email
  masked = masked.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, "[EMAIL_MASKED]");
  // IBAN (TR + 24 digits)
  masked = masked.replace(/TR\s?\d{2}[\s]?\d{4}[\s]?\d{4}[\s]?\d{4}[\s]?\d{4}[\s]?\d{4}[\s]?\d{2}/gi, "[IBAN_MASKED]");
  return masked;
}

// ── Conversation Quality Score ──────────────────────────────────────────
function calculateQualityScore(ticket) {
  let score = 10;
  // More messages = likely harder to resolve (penalty)
  const msgCount = (ticket.chatHistory || []).length;
  if (msgCount > 15) score -= 2;
  else if (msgCount > 8) score -= 1;
  // Escalation = negative signal
  if (ticket.status === "handoff_pending" || ticket.status === "handoff_failed") score -= 1;
  // CSAT rating
  if (ticket.csatRating) {
    if (ticket.csatRating >= 4) score += 1;
    else if (ticket.csatRating <= 2) score -= 2;
  }
  // Sentiment
  const sentiment = ticket.sentiment || "neutral";
  if (sentiment === "angry") score -= 2;
  else if (sentiment === "negative") score -= 1;
  else if (sentiment === "positive") score += 1;
  // Resolution time
  if (ticket.resolvedAt && ticket.createdAt) {
    const resolveMs = Date.parse(ticket.resolvedAt) - Date.parse(ticket.createdAt);
    if (resolveMs < 5 * 60 * 1000) score += 1; // < 5 min
    else if (resolveMs > 60 * 60 * 1000) score -= 1; // > 1 hour
  }
  return Math.max(1, Math.min(10, score));
}

// ── Context Window Compression ──────────────────────────────────────────
async function compressConversationHistory(messages) {
  if (messages.length <= 10) return messages;
  const oldMessages = messages.slice(0, -6);
  const recentMessages = messages.slice(-6);

  // Try LLM-based summarization
  const providerCfg = getProviderConfig();
  if (providerCfg.apiKey || providerCfg.provider === "ollama") {
    try {
      const chatText = oldMessages
        .map(m => `${m.role === "user" ? "Kullanici" : "Bot"}: ${(m.content || "").slice(0, 200)}`)
        .join("\n");
      const result = await callLLM(
        [{ role: "user", parts: [{ text: chatText }] }],
        "Bu konusma gecmisini tek paragrafta ozetle. Turkce yaz, 2-3 cumle. Sadece ozeti yaz.",
        128
      );
      const summary = (result.reply || "").trim();
      if (summary) {
        return [
          { role: "assistant", content: `[Önceki konuşma özeti: ${summary}]` },
          ...recentMessages
        ];
      }
    } catch (_e) { /* fallback to simple truncation */ }
  }

  // Simple fallback: keep first 2 + last 6
  return [...messages.slice(0, 2), ...recentMessages];
}

// ── Response Quality Validation ─────────────────────────────────────────
function validateBotResponse(reply, sources) {
  if (!reply || typeof reply !== "string") return { valid: false, reason: "empty" };
  const trimmed = reply.trim();
  if (trimmed.length < 10) return { valid: false, reason: "too_short" };
  // Detect repetition (same sentence 3+ times)
  const sentences = trimmed.split(/[.!?]+/).filter(s => s.trim().length > 5);
  if (sentences.length >= 3) {
    const unique = new Set(sentences.map(s => s.trim().toLowerCase()));
    if (unique.size === 1) return { valid: false, reason: "repetitive" };
  }
  // Detect hallucination markers
  const hallucMarkers = ["ben bir yapay zeka olarak", "as an ai", "i cannot", "i'm sorry but"];
  for (const marker of hallucMarkers) {
    if (trimmed.toLowerCase().includes(marker)) return { valid: false, reason: "hallucination_marker" };
  }
  return { valid: true };
}

ensureTicketsDbFile();

app.use((req, res, next) => {
  // Security headers
  res.header("X-Content-Type-Options", "nosniff");
  res.header("X-Frame-Options", "DENY");
  res.header("X-XSS-Protection", "1; mode=block");
  res.header("Referrer-Policy", "strict-origin-when-cross-origin");
  res.header("Permissions-Policy", "geolocation=(), microphone=(), camera=()");

  // CORS - allow same-origin and configured origins
  const origin = req.headers.origin || "";
  const allowed = [
    "http://localhost:" + PORT,
    "http://127.0.0.1:" + PORT
  ];
  const envOrigin = (process.env.ALLOWED_ORIGIN || "").trim();
  if (envOrigin) envOrigin.split(",").forEach(o => allowed.push(o.trim()));
  if (allowed.includes(origin)) {
    res.header("Access-Control-Allow-Origin", origin);
  }
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, X-Admin-Token, X-API-Key");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  return next();
});
// --- Auto-deploy webhook (must be before express.json() to access raw body) ---
if (DEPLOY_WEBHOOK_SECRET) {
  app.post("/deploy", express.raw({ type: "application/json", limit: "500kb" }), (req, res) => {
    const sig = req.headers["x-hub-signature-256"] || "";
    const expected = "sha256=" + crypto.createHmac("sha256", DEPLOY_WEBHOOK_SECRET).update(req.body).digest("hex");
    if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
      return res.status(403).json({ error: "Invalid signature" });
    }

    let payload;
    try { payload = JSON.parse(req.body.toString()); } catch (_e) {
      return res.status(400).json({ error: "Invalid JSON" });
    }
    if (payload.ref !== "refs/heads/main") return res.json({ status: "ignored", reason: "not main branch" });

    console.log("[deploy] Main branch push detected, deploying...");
    res.json({ status: "deploying" });

    const { execSync } = require("child_process");
    const deployScript = path.join(__dirname, "deploy.sh");
    if (fs.existsSync(deployScript)) {
      try {
        execSync(`bash "${deployScript}"`, { cwd: __dirname, stdio: "inherit", timeout: 120000 });
      } catch (err) {
        console.error("[deploy] Deploy failed:", err.message);
      }
    } else {
      console.error("[deploy] deploy.sh not found");
    }
  });
  console.log("[deploy] Webhook endpoint aktif: POST /deploy");
}

app.use(express.json({ limit: "1mb", type: (req) => {
  const ct = req.headers["content-type"] || "";
  return ct.includes("application/json") || ct.includes("text/plain");
}}));
app.use(express.static(path.join(__dirname, "public")));

app.get("/api/health", (_req, res) => {
  const supportAvailability = getSupportAvailability();
  const ticketsDb = loadTicketsDb();
  const ticketSummary = getAdminSummary(ticketsDb.tickets);
  res.json({
    ok: llmHealthStatus.ok && Boolean(GOOGLE_API_KEY),
    model: GOOGLE_MODEL,
    hasApiKey: Boolean(GOOGLE_API_KEY),
    llmStatus: llmHealthStatus,
    maxOutputTokens: GOOGLE_MAX_OUTPUT_TOKENS,
    requestTimeoutMs: GOOGLE_REQUEST_TIMEOUT_MS,
    thinkingBudget: GOOGLE_THINKING_BUDGET,
    deterministicCollectionMode: DETERMINISTIC_COLLECTION_MODE,
    agentFilesLoaded: Boolean(PERSONA_TEXT && RESPONSE_POLICY_TEXT && SOUL_TEXT && DOMAIN_TEXT && SKILLS_TEXT),
    topicsLoaded: TOPIC_INDEX.topics.length,
    memoryTemplateLoaded: Boolean(MEMORY_TEMPLATE?.confirmationTemplate),
    zendeskEnabled: ZENDESK_ENABLED,
    zendeskSnippetConfigured: Boolean(ZENDESK_SNIPPET_KEY),
    sunshineEnabled: ZENDESK_SC_ENABLED || sunshineConfig.enabled,
    sunshineConfigured: Boolean((sunshineConfig.appId || ZENDESK_SC_APP_ID) && (sunshineConfig.keyId || ZENDESK_SC_KEY_ID)),
    supportAvailability,
    knowledgeBaseLoaded: Boolean(knowledgeTable),
    adminTokenRequired: Boolean(ADMIN_TOKEN),
    tickets: ticketSummary
  });
});

app.get("/api/config", (_req, res) => {
  const supportAvailability = getSupportAvailability();
  res.json({
    zendesk: {
      enabled: ZENDESK_ENABLED,
      snippetKey: ZENDESK_SNIPPET_KEY,
      defaultTags: ZENDESK_DEFAULT_TAGS
    },
    support: supportAvailability,
    admin: {
      tokenRequired: Boolean(ADMIN_TOKEN)
    },
    chatFlow: chatFlowConfig,
    site: siteConfig
  });
});

app.post("/api/tickets/:ticketId/handoff", (req, res) => {
  const ticketId = String(req.params.ticketId || "").trim();
  if (!ticketId) {
    return res.status(400).json({ error: "ticketId zorunludur." });
  }

  const status = String(req.body?.status || "").trim().toLowerCase();
  const detail = String(req.body?.detail || "").trim();
  const meta = req.body?.meta && typeof req.body.meta === "object" ? req.body.meta : {};

  const result = updateTicketHandoffResult(ticketId, status, detail, meta);
  if (result.error) {
    const isNotFound = /bulunamadi/i.test(result.error);
    return res.status(isNotFound ? 404 : 400).json({ error: result.error });
  }

  fireWebhook("handoff_result", { ticketId, status, detail });

  return res.json({
    ok: true,
    ticket: sanitizeTicketForList(result.ticket)
  });
});

// ── Conversation Close (inactivity / user / farewell) ────────────────────
app.post("/api/conversations/close", (req, res) => {
  const sessionId = String(req.body?.sessionId || "").trim();
  if (!sessionId) {
    return res.status(400).json({ error: "sessionId zorunludur." });
  }
  const reason = String(req.body?.reason || "inactivity").trim();
  const allowed = ["inactivity", "user", "farewell"];
  const safeReason = allowed.includes(reason) ? reason : "inactivity";

  upsertConversation(sessionId, null, null, { status: "closed" });
  recordAnalyticsEvent({ source: "chat-closed", reason: safeReason });

  return res.json({ ok: true });
});

app.post("/api/tickets/:ticketId/rating", (req, res) => {
  const ticketId = String(req.params.ticketId || "").trim();
  if (!ticketId) {
    return res.status(400).json({ error: "ticketId zorunludur." });
  }

  const rating = Number(req.body?.rating);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return res.status(400).json({ error: "Rating 1-5 arasi olmalidir." });
  }

  const db = loadTicketsDb();
  const ticket = db.tickets.find((item) => item.id === ticketId);
  if (!ticket) {
    return res.status(404).json({ error: "Ticket bulunamadi." });
  }

  const timestamp = nowIso();
  ticket.csatRating = rating;
  ticket.csatRatedAt = timestamp;
  ticket.updatedAt = timestamp;
  ticket.events = Array.isArray(ticket.events) ? ticket.events : [];
  ticket.events.push({
    at: timestamp,
    type: "csat_rating",
    message: `Kullanici ${rating}/5 puan verdi.`,
    rating
  });

  saveTicketsDb(db);
  recordCsatAnalytics(rating);
  fireWebhook("csat_rating", { ticketId, rating });
  return res.json({ ok: true, rating });
});

// ── Message Feedback (thumbs up/down) ────────────────────────────────────
function loadFeedback() {
  try {
    if (fs.existsSync(FEEDBACK_FILE)) return JSON.parse(fs.readFileSync(FEEDBACK_FILE, "utf8"));
  } catch (_e) { /* silent */ }
  return { entries: [] };
}

function saveFeedback(data) {
  // Keep last 1000 entries
  if (data.entries.length > 1000) data.entries = data.entries.slice(-1000);
  fs.writeFileSync(FEEDBACK_FILE, JSON.stringify(data, null, 2), "utf8");
}

// ── Chat File Upload (user→bot) ──────────────────────────────────────────
const chatUpload = multer({
  dest: UPLOADS_DIR,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ["image/jpeg", "image/png", "image/gif", "image/webp", "application/pdf"];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error("Desteklenmeyen dosya tipi. Sadece resim ve PDF kabul edilir."));
  }
});

app.post("/api/chat/upload", chatUpload.single("file"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Dosya gerekli." });
  const fileUrl = `/uploads/${req.file.filename}`;
  return res.json({ ok: true, url: fileUrl, name: req.file.originalname, size: req.file.size });
});

// Serve uploaded files
app.use("/uploads", express.static(UPLOADS_DIR));

app.post("/api/chat/feedback", (req, res) => {
  const { sessionId, messageIndex, rating } = req.body || {};
  if (!rating || !["up", "down"].includes(rating)) {
    return res.status(400).json({ error: "rating: 'up' veya 'down' olmalidir." });
  }
  const data = loadFeedback();
  data.entries.push({
    sessionId: String(sessionId || "").slice(0, 100),
    messageIndex: Number(messageIndex) || 0,
    rating,
    timestamp: nowIso()
  });
  saveFeedback(data);
  // Update analytics
  const dayKey = new Date().toISOString().slice(0, 10);
  if (!analyticsData.daily[dayKey]) {
    analyticsData.daily[dayKey] = { totalChats: 0, aiCalls: 0, deterministicReplies: 0, totalResponseMs: 0, responseCount: 0, escalationCount: 0, csatSum: 0, csatCount: 0, topicCounts: {}, sourceCounts: {} };
  }
  const day = analyticsData.daily[dayKey];
  if (!day.feedbackUp) day.feedbackUp = 0;
  if (!day.feedbackDown) day.feedbackDown = 0;
  if (rating === "up") day.feedbackUp++; else day.feedbackDown++;
  saveAnalyticsData();
  return res.json({ ok: true });
});

app.get("/api/admin/summary", requireAdminAccess, (_req, res) => {
  const db = loadTicketsDb();
  const summary = getAdminSummary(db.tickets);
  return res.json({
    ok: true,
    summary
  });
});

app.get("/api/admin/tickets", requireAdminAccess, (req, res) => {
  const limit = Math.max(1, Math.min(500, Number(req.query.limit) || 100));
  const offset = Math.max(0, Number(req.query.offset) || 0);
  const statusFilter = String(req.query.status || "").trim();
  const searchQuery = String(req.query.q || "").trim().toLowerCase();
  const sourceFilter = String(req.query.source || "").trim();
  const includeEvents = /^(1|true|yes)$/i.test(String(req.query.includeEvents || ""));

  const db = loadTicketsDb();
  let tickets = [...db.tickets];
  tickets.sort((a, b) => Date.parse(b.createdAt || "") - Date.parse(a.createdAt || ""));

  if (statusFilter) {
    tickets = tickets.filter((ticket) => ticket.status === statusFilter);
  }

  if (sourceFilter) {
    tickets = tickets.filter((ticket) => (ticket.source || "web") === sourceFilter);
  }

  if (searchQuery) {
    tickets = tickets.filter((ticket) => {
      const fields = [
        ticket.id, ticket.branchCode, ticket.issueSummary,
        ticket.companyName, ticket.fullName, ticket.phone, ticket.status
      ].filter(Boolean).join(" ").toLowerCase();
      if (fields.includes(searchQuery)) return true;
      // Also search chat history
      if (Array.isArray(ticket.chatHistory)) {
        return ticket.chatHistory.some((msg) =>
          String(msg.content || "").toLowerCase().includes(searchQuery)
        );
      }
      return false;
    });
  }

  const total = tickets.length;
  const page = tickets.slice(offset, offset + limit);

  return res.json({
    ok: true,
    total,
    limit,
    offset,
    tickets: page.map((ticket) => {
      const base = sanitizeTicketForList(ticket);
      if (includeEvents) {
        base.events = Array.isArray(ticket.events) ? ticket.events : [];
      }
      return base;
    })
  });
});

app.get("/api/admin/tickets/:ticketId", requireAdminAccess, (req, res) => {
  const ticketId = String(req.params.ticketId || "").trim();
  const db = loadTicketsDb();
  const ticket = db.tickets.find((item) => item.id === ticketId);

  if (!ticket) {
    return res.status(404).json({ error: "Ticket bulunamadi." });
  }

  return res.json({
    ok: true,
    ticket: {
      ...sanitizeTicketForList(ticket),
      supportSnapshot: ticket.supportSnapshot || {},
      events: Array.isArray(ticket.events) ? ticket.events : [],
      chatHistory: Array.isArray(ticket.chatHistory) ? ticket.chatHistory : [],
      internalNotes: Array.isArray(ticket.internalNotes) ? ticket.internalNotes : []
    }
  });
});

// Conversations (live chat sessions)
app.get("/api/admin/conversations", requireAdminAccess, (_req, res) => {
  const data = loadConversations();
  const statusFilter = String(_req.query.status || "").trim();
  let convs = [...data.conversations];
  convs.sort((a, b) => Date.parse(b.updatedAt || "") - Date.parse(a.updatedAt || ""));

  if (statusFilter) {
    convs = convs.filter(c => c.status === statusFilter);
  }

  res.json({
    ok: true,
    total: convs.length,
    conversations: convs.map(c => ({
      sessionId: c.sessionId,
      status: c.status,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
      messageCount: c.messageCount || 0,
      lastUserMessage: c.lastUserMessage || "",
      memory: c.memory || {},
      ticketId: c.ticketId || "",
      source: c.source || "web",
      chatHistory: c.chatHistory || []
    }))
  });
});

function updateConversationTicket(sessionId, ticketId) {
  if (!sessionId || !ticketId) return;
  const data = loadConversations();
  const conv = data.conversations.find(c => c.sessionId === sessionId);
  if (conv) {
    conv.ticketId = ticketId;
    conv.status = "ticketed";
    conv.updatedAt = new Date().toISOString();
    saveConversations(data);
  }
}

app.post("/api/chat", async (req, res) => {
  const chatStartTime = Date.now();
  try {
    // Rate limiting
    const clientIp = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.socket?.remoteAddress || "unknown";
    if (!checkRateLimit(clientIp)) {
      return res.status(429).json({ error: "Cok fazla istek gonderdiniz. Lutfen biraz bekleyin.", retryAfterMs: RATE_LIMIT_WINDOW_MS });
    }

    const rawMessages = Array.isArray(req.body?.messages) ? req.body.messages : [];
    const sessionId = String(req.body?.sessionId || "").trim() || ("auto-" + clientIp + "-" + Date.now().toString(36));

    if (!rawMessages.length) {
      return res.status(400).json({ error: "messages alani bos olamaz." });
    }

    const originalJson = res.json.bind(res);
    res.json = (data) => {
      if (data && typeof data === "object" && !data.sessionId) {
        data.sessionId = sessionId;
      }
      return originalJson(data);
    };

    const supportAvailability = getSupportAvailability();

    // Track conversation
    const earlyMemory = extractTicketMemory(rawMessages);
    upsertConversation(sessionId, rawMessages, earlyMemory, { ip: clientIp, source: req.body?.source || "web" });
    const { activeMessages, hasClosedTicketHistory, lastClosedTicketMemory } =
      splitActiveTicketMessages(rawMessages);
    const activeUserMessages = getUserMessages(activeMessages);
    const memory = extractTicketMemory(activeMessages);
    const latestUserMessage = activeUserMessages[activeUserMessages.length - 1] || "";

    // Gibberish detection
    if (isGibberishMessage(latestUserMessage)) {
      recordAnalyticsEvent({ source: "gibberish", responseTimeMs: Date.now() - chatStartTime });
      return res.json({
        reply: chatFlowConfig.gibberishMessage,
        model: GOOGLE_MODEL,
        source: "gibberish",
        memory,
        handoffReady: false,
        support: getSupportAvailability()
      });
    }

    // Farewell/closing flow detection
    if (isFarewellMessage(latestUserMessage)) {
      const hasTicket = hasRequiredFields(memory);
      if (hasTicket) {
        // Find existing ticket for CSAT
        const ticketsDb = loadTicketsDb();
        const recentTicket = findRecentDuplicateTicket(ticketsDb.tickets, memory);
        recordAnalyticsEvent({ source: "closing-flow", responseTimeMs: Date.now() - chatStartTime });
        return res.json({
          reply: chatFlowConfig.farewellMessage,
          model: GOOGLE_MODEL,
          source: "closing-flow",
          memory,
          handoffReady: false,
          closingFlow: true,
          csatTrigger: chatFlowConfig.csatEnabled,
          ticketId: recentTicket?.id || "",
          support: getSupportAvailability()
        });
      } else {
        recordAnalyticsEvent({ source: "closing-flow", responseTimeMs: Date.now() - chatStartTime });
        return res.json({
          reply: chatFlowConfig.anythingElseMessage,
          model: GOOGLE_MODEL,
          source: "closing-flow",
          memory,
          handoffReady: false,
          closingFlow: false,
          support: getSupportAvailability()
        });
      }
    }

    const chatHistorySnapshot = activeMessages
      .filter(m => m && m.content)
      .slice(-50)
      .map(m => ({ role: m.role, content: String(m.content).slice(0, 500) }));

    const allMessagesAreStatusLike =
      activeUserMessages.length > 0 &&
      activeUserMessages.every(
        (text) =>
          isNonIssueMessage(text) || isStatusFollowupMessage(text) || isFieldClarificationMessage(text)
      );

    const repeatsClosedTicketBranchWithoutNewIssue =
      activeUserMessages.length > 0 &&
      Boolean(lastClosedTicketMemory?.branchCode) &&
      Boolean(memory.branchCode) &&
      !memory.issueSummary &&
      memory.branchCode === String(lastClosedTicketMemory.branchCode).toUpperCase() &&
      activeUserMessages.every((text) => {
        const extracted = extractBranchCodeFromText(text);
        return (
          isNonIssueMessage(text) ||
          isStatusFollowupMessage(text) ||
          isFieldClarificationMessage(text) ||
          (extracted && extracted === memory.branchCode)
        );
      });

    const maintainClosedTicketContext =
      allMessagesAreStatusLike || repeatsClosedTicketBranchWithoutNewIssue;

    if (
      hasClosedTicketHistory &&
      lastClosedTicketMemory &&
      !hasRequiredFields(memory) &&
      maintainClosedTicketContext &&
      !NEW_TICKET_INTENT_REGEX.test(normalizeForMatching(latestUserMessage))
    ) {
      recordAnalyticsEvent({ source: "ticket-status", responseTimeMs: Date.now() - chatStartTime });
      return res.json({
        reply: getStatusFollowupMessage(),
        model: GOOGLE_MODEL,
        source: "ticket-status",
        memory: lastClosedTicketMemory,
        hasClosedTicketHistory,
        handoffReady: false,
        quickReplies: ["Yeni talep oluştur"],
        support: supportAvailability
      });
    }

    // Post-escalation kontrol: Onceki asistan mesaji escalation mesajiysa
    // ve kullanici yeni bir konu acmiyorsa, bekleme mesaji ver.
    const lastAssistant = getLastAssistantMessage(rawMessages);
    if (lastAssistant && isAssistantEscalationMessage(lastAssistant)) {
      const isNewIssue = ISSUE_HINT_REGEX.test(normalizeForMatching(latestUserMessage)) &&
        !isStatusFollowupMessage(latestUserMessage);
      if (!isNewIssue) {
        recordAnalyticsEvent({ source: "post-escalation", responseTimeMs: Date.now() - chatStartTime });
        return res.json({
          reply: POST_ESCALATION_FOLLOWUP_MESSAGE,
          model: GOOGLE_MODEL,
          source: "post-escalation",
          memory,
          hasClosedTicketHistory,
          handoffReady: true,
          handoffReason: "escalation_active",
          support: supportAvailability
        });
      }
    }

    // Context window compression: 10+ mesajda eski mesajlari ozetle
    let processedMessages = activeMessages;
    if (activeMessages.length > 10) {
      processedMessages = await compressConversationHistory(activeMessages);
    }

    const contents = processedMessages
      .filter((item) => item && typeof item.content === "string" && item.content.trim())
      .map((item) => ({
        role: item.role === "assistant" ? "model" : "user",
        parts: [{ text: item.content.trim() }]
      }));

    if (!contents.length) {
      return res.status(400).json({ error: "Geçerli mesaj bulunamadı." });
    }

    const conversationContext = buildConversationContext(memory, activeUserMessages);

    if (hasRequiredFields(memory) && !conversationContext.currentTopic) {
      const aiSummary = await generateEscalationSummary(contents, memory, conversationContext);
      memory.issueSummary = aiSummary;
      const ticketResult = createOrReuseTicket(memory, supportAvailability, {
        source: "chat-api",
        model: GOOGLE_MODEL,
        chatHistory: chatHistorySnapshot
      });
      const ticket = ticketResult.ticket;
      updateConversationTicket(sessionId, ticket.id);
      const handoffReady = Boolean(supportAvailability.isOpen);

      // Queue position: aktif bekleyen ticket sayisi
      const ticketsDb = loadTicketsDb();
      const activeCount = ticketsDb.tickets.filter(
        (t) => ACTIVE_TICKET_STATUSES.has(t.status) && t.id !== ticket.id
      ).length;

      recordAnalyticsEvent({ source: "memory-template", responseTimeMs: Date.now() - chatStartTime, topicId: conversationContext.currentTopic || null });
      if (ticketResult.created) {
        fireWebhook("ticket_created", { ticketId: ticket.id, memory, source: "memory-template" });
      }

      return res.json({
        reply: buildConfirmationMessage(memory),
        model: GOOGLE_MODEL,
        source: "memory-template",
        memory,
        conversationContext,
        ticketId: ticket.id,
        ticketStatus: ticket.status,
        ticketCreated: ticketResult.created,
        hasClosedTicketHistory,
        handoffReady,
        handoffReason: handoffReady ? "" : "outside-support-hours",
        handoffMessage: handoffReady ? "" : getOutsideSupportHoursMessage(),
        queuePosition: activeCount > 0 ? activeCount : 0,
        support: supportAvailability
      });
    }

    if (conversationContext.escalationTriggered) {
      const escalationReply = "Sizi canlı destek temsilcimize aktarıyorum. Kısa sürede yardımcı olacaktır.";
      const aiSummary = await generateEscalationSummary(contents, memory, conversationContext);
      const escalationMemory = {
        ...memory,
        issueSummary: aiSummary
      };
      const ticketResult = createOrReuseTicket(escalationMemory, supportAvailability, {
        source: "escalation-trigger",
        model: GOOGLE_MODEL,
        chatHistory: chatHistorySnapshot
      });
      updateConversationTicket(sessionId, ticketResult.ticket.id);
      const handoffReady = Boolean(supportAvailability.isOpen);
      recordAnalyticsEvent({ source: "escalation-trigger", responseTimeMs: Date.now() - chatStartTime, topicId: conversationContext.currentTopic || null });
      if (ticketResult.created) {
        fireWebhook("ticket_created", { ticketId: ticketResult.ticket.id, memory: escalationMemory, source: "escalation-trigger" });
        fireWebhook("escalation", { ticketId: ticketResult.ticket.id, memory: escalationMemory, reason: conversationContext.escalationReason });
      }
      return res.json({
        reply: escalationReply,
        model: GOOGLE_MODEL,
        source: "escalation-trigger",
        memory: escalationMemory,
        conversationContext,
        hasClosedTicketHistory,
        ticketId: ticketResult.ticket.id,
        ticketStatus: ticketResult.ticket.status,
        ticketCreated: ticketResult.created,
        handoffReady,
        handoffReason: conversationContext.escalationReason,
        handoffMessage: !handoffReady ? getOutsideSupportHoursMessage() : "",
        support: supportAvailability
      });
    }

    // Deterministic reply sadece topic_detection OLMAYAN durumlarda devreye girer.
    // Kullanici teknik bir sey soylediginde (topic_detection state) AI'a gonder,
    // sadece saf selamlama veya alan sorularinda deterministic cevap ver.
    const shouldUseDeterministicReply =
      conversationContext.conversationState === "welcome_or_greet" ||
      (conversationContext.conversationState !== "topic_detection" &&
       conversationContext.conversationState !== "topic_guided_support" &&
       !conversationContext.currentTopic);

    if (shouldUseDeterministicReply) {
      const deterministicReply = buildDeterministicCollectionReply(
        memory,
        activeUserMessages,
        hasClosedTicketHistory
      );
      if (deterministicReply) {
        // Max clarification retry check
        const sessionKey = getClarificationKey(rawMessages);
        const retryCount = incrementClarificationCount(sessionKey);
        if (retryCount > chatFlowConfig.maxClarificationRetries) {
          resetClarificationCount(sessionKey);
          recordAnalyticsEvent({ source: "max-retries", responseTimeMs: Date.now() - chatStartTime });
          return res.json({
            reply: "Gerekli bilgileri almakta güçlük yaşıyorum. Sizi canlı destek temsilcimize aktarıyorum.",
            model: GOOGLE_MODEL,
            source: "max-retries",
            memory,
            conversationContext,
            hasClosedTicketHistory,
            handoffReady: Boolean(getSupportAvailability().isOpen),
            handoffReason: "max-clarification-retries",
            support: getSupportAvailability()
          });
        }

        // Quick replies: eksik alanlara gore
        const quickReplies = [];
        if (!memory.branchCode && !memory.issueSummary) {
          // Baslangic durumu - hizli erisim butonlari
        } else if (!memory.branchCode) {
          // Sube kodu eksik
        } else if (!memory.issueSummary) {
          // Sorun ozeti eksik
        }

        recordAnalyticsEvent({ source: "rule-engine", responseTimeMs: Date.now() - chatStartTime });
        return res.json({
          reply: deterministicReply,
          model: GOOGLE_MODEL,
          source: "rule-engine",
          memory,
          conversationContext,
          hasClosedTicketHistory,
          handoffReady: false,
          quickReplies,
          support: supportAvailability
        });
      }
    }

    if (!getProviderConfig().apiKey && getProviderConfig().provider !== "ollama") {
      return res.json({
        reply: buildMissingFieldsReply(memory, latestUserMessage),
        model: GOOGLE_MODEL,
        source: "fallback-no-key",
        memory,
        conversationContext,
        hasClosedTicketHistory,
        handoffReady: false,
        support: supportAvailability
      });
    }

    let reply;

    // Keyword ile konu tespit edilemediyse, once Gemini'dan konu tespiti iste (hafif cagri)
    // Konu bulunursa detayli dosyayi yukleyip ikinci cagri ile asil yaniti uret
    if (!conversationContext.currentTopic && conversationContext.conversationState === "topic_detection") {
      const classifyPrompt = [
        "Kullanıcının mesajını analiz et. Aşağıdaki konu listesinden EN UYGUN konunun id'sini yaz.",
        "Sadece id yaz, başka bir şey yazma. Hiçbir konuyla eşleşmiyor ise sadece NONE yaz.",
        "",
        TOPIC_INDEX_SUMMARY
      ].join("\n");

      try {
        const classifyResult = await callLLM(contents, classifyPrompt, 64);
        const detectedId = (classifyResult.reply || "").trim().toLowerCase().replace(/[^a-z0-9\-]/g, "");
        const matchedTopic = TOPIC_INDEX.topics.find((t) => t.id === detectedId);

        if (matchedTopic) {
          conversationContext.currentTopic = matchedTopic.id;
          conversationContext.topicConfidence = 0.8;
          conversationContext.conversationState = "topic_guided_support";
        }
      } catch (_classifyError) {
        // Siniflandirma hatasi olursa sessizce devam et, normal akis calisssin
      }
    }

    // Sentiment analysis
    const sentiment = analyzeSentiment(latestUserMessage);

    // RAG: Bilgi tabanindan ilgili Q&A ciftlerini bul (hybrid search)
    const knowledgeResults = await searchKnowledge(latestUserMessage);
    // Content gap detection: if no good KB results, record the gap
    if (knowledgeResults.length === 0 && latestUserMessage.length > 10) {
      recordContentGap(latestUserMessage);
    }
    // Build citation sources for response
    const sources = knowledgeResults.map(r => ({
      question: r.question,
      answer: (r.answer || "").slice(0, 200),
      score: r.rrfScore || r.distance || 0
    }));
    const systemPrompt = buildSystemPrompt(memory, conversationContext, knowledgeResults);
    let geminiResult = await callLLMWithFallback(contents, systemPrompt, GOOGLE_MAX_OUTPUT_TOKENS);

    if (geminiResult.finishReason === "MAX_TOKENS" && geminiResult.reply.length < 160) {
      geminiResult = await callLLMWithFallback(contents, systemPrompt, GOOGLE_MAX_OUTPUT_TOKENS * 2);
    }
    if (geminiResult.fallbackUsed) {
      recordLLMError({ message: "Primary model failed, fallback used", status: 429 }, "web-chat-fallback");
    }

    reply = sanitizeAssistantReply(geminiResult.reply);

    // Response quality validation
    const qualityCheck = validateBotResponse(reply, sources);
    if (!qualityCheck.valid) {
      reply = buildMissingFieldsReply(memory, latestUserMessage);
    }

    if (!conversationContext.currentTopic && !hasRequiredFields(memory) && CONFIRMATION_PREFIX_REGEX.test(reply)) {
      reply = buildMissingFieldsReply(memory, latestUserMessage);
    }

    if (!reply) {
      reply = buildMissingFieldsReply(memory, latestUserMessage);
    }

    // Parse dynamic quick replies from LLM response
    let dynamicQuickReplies = [];
    const qrMatch = reply.match(/\[QUICK_REPLIES:\s*(.+?)\]/i);
    if (qrMatch) {
      dynamicQuickReplies = qrMatch[1].split("|").map(s => s.trim()).filter(Boolean).slice(0, 3);
      reply = reply.replace(/\s*\[QUICK_REPLIES:\s*.+?\]/i, "").trim();
    }

    const isEscalationReply = ESCALATION_MESSAGE_REGEX.test(normalizeForMatching(reply));
    const topicMeta = conversationContext.currentTopic ? getTopicMeta(conversationContext.currentTopic) : null;

    // Topic-guided escalation'da da ticket olustur
    let ticketId = "";
    let ticketStatus = "";
    let ticketCreated = false;
    if (isEscalationReply) {
      const aiSummary = await generateEscalationSummary(contents, memory, conversationContext);
      const escalationMemory = {
        ...memory,
        issueSummary: aiSummary
      };
      const ticketResult = createOrReuseTicket(escalationMemory, supportAvailability, {
        source: "topic-escalation",
        model: GOOGLE_MODEL,
        chatHistory: chatHistorySnapshot
      });
      ticketId = ticketResult.ticket.id;
      updateConversationTicket(sessionId, ticketId);
      ticketStatus = ticketResult.ticket.status;
      ticketCreated = ticketResult.created;
      // Guncel ozeti memory'ye de yansit
      memory.issueSummary = aiSummary;
    }

    const handoffReady = isEscalationReply && Boolean(supportAvailability.isOpen);

    const chatSource = conversationContext.currentTopic ? "topic-guided" : "gemini";
    recordAnalyticsEvent({
      source: chatSource,
      responseTimeMs: Date.now() - chatStartTime,
      topicId: conversationContext.currentTopic || null,
      fallbackUsed: Boolean(geminiResult.fallbackUsed),
      sentiment
    });

    if (isEscalationReply && ticketCreated) {
      fireWebhook("escalation", { ticketId, memory, source: chatSource });
    }
    if (ticketCreated) {
      fireWebhook("ticket_created", { ticketId, memory, source: chatSource });
    }

    return res.json({
      reply,
      model: GOOGLE_MODEL,
      source: chatSource,
      sources: sources.length ? sources : undefined,
      memory,
      conversationContext,
      hasClosedTicketHistory,
      ticketId,
      ticketStatus,
      ticketCreated,
      handoffReady,
      handoffReason: isEscalationReply ? (topicMeta?.id || "ai-escalation") : "",
      handoffMessage: !supportAvailability.isOpen && isEscalationReply ? getOutsideSupportHoursMessage() : "",
      quickReplies: dynamicQuickReplies.length ? dynamicQuickReplies : undefined,
      support: supportAvailability
    });
  } catch (error) {
    recordLLMError(error, "web-chat");
    const statusCode = Number(error?.status) || 500;
    if (statusCode >= 500) {
      const rawMessages = Array.isArray(req.body?.messages) ? req.body.messages : [];
      const { activeMessages, hasClosedTicketHistory } = splitActiveTicketMessages(rawMessages);
      const activeUserMessages = getUserMessages(activeMessages);
      const memory = extractTicketMemory(activeMessages);
      const latestUserMessage = activeUserMessages[activeUserMessages.length - 1] || "";
      const supportAvailability = getSupportAvailability();

      return res.json({
        reply: buildMissingFieldsReply(memory, latestUserMessage),
        model: GOOGLE_MODEL,
        source: "fallback-error",
        memory,
        hasClosedTicketHistory,
        handoffReady: false,
        support: supportAvailability,
        warning: error?.message || "Beklenmeyen bir hata olustu."
      });
    }

    return res.status(statusCode).json({
      error: error?.message || "Beklenmeyen bir hata olustu."
    });
  }
});

// KB: List all
app.get("/api/admin/knowledge", requireAdminAccess, (_req, res) => {
  try {
    const rows = loadCSVData();
    return res.json({ ok: true, records: rows.map((r, i) => ({ id: i + 1, question: r.question || "", answer: r.answer || "" })) });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// KB: Add new
app.post("/api/admin/knowledge", requireAdminAccess, async (req, res) => {
  try {
    const { question, answer } = req.body || {};
    if (!question || !answer) return res.status(400).json({ error: "question ve answer zorunludur." });

    const rows = loadCSVData();
    rows.push({ question, answer });
    saveCSVData(rows);

    // Re-embed and rebuild LanceDB table
    await reingestKnowledgeBase();

    return res.json({ ok: true, id: rows.length });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// KB: Reingest from CSV (must be before /:id routes)
app.post("/api/admin/knowledge/reingest", requireAdminAccess, async (_req, res) => {
  try {
    await reingestKnowledgeBase();
    const rowCount = knowledgeTable ? await knowledgeTable.countRows() : 0;
    return res.json({ ok: true, recordCount: rowCount });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// KB: Update
app.put("/api/admin/knowledge/:id", requireAdminAccess, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { question, answer } = req.body || {};
    if (!question || !answer) return res.status(400).json({ error: "question ve answer zorunludur." });

    const rows = loadCSVData();
    const idx = id - 1;
    if (idx < 0 || idx >= rows.length) return res.status(404).json({ error: "Kayit bulunamadi." });

    rows[idx] = { question, answer };
    saveCSVData(rows);

    await reingestKnowledgeBase();

    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// KB: Delete
app.delete("/api/admin/knowledge/:id", requireAdminAccess, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const rows = loadCSVData();
    const idx = id - 1;
    if (idx < 0 || idx >= rows.length) return res.status(404).json({ error: "Kayit bulunamadi." });

    rows.splice(idx, 1);
    saveCSVData(rows);

    await reingestKnowledgeBase();

    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// Agent: List files
app.get("/api/admin/agent/files", requireAdminAccess, (_req, res) => {
  try {
    const files = fs.readdirSync(AGENT_DIR).filter(f => f.endsWith(".md")).sort();
    return res.json({ ok: true, files });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// Agent: Read file
app.get("/api/admin/agent/files/:filename", requireAdminAccess, (req, res) => {
  const filename = req.params.filename;
  if (!isValidFilename(filename)) return res.status(400).json({ error: "Gecersiz dosya adi." });

  const filePath = path.join(AGENT_DIR, filename);
  try {
    const content = fs.readFileSync(filePath, "utf8");
    return res.json({ ok: true, filename, content });
  } catch (err) {
    return res.status(404).json({ error: "Dosya bulunamadi." });
  }
});

// Agent: Save file
app.put("/api/admin/agent/files/:filename", requireAdminAccess, (req, res) => {
  const filename = req.params.filename;
  if (!isValidFilename(filename)) return res.status(400).json({ error: "Gecersiz dosya adi." });

  const { content } = req.body || {};
  if (typeof content !== "string") return res.status(400).json({ error: "content zorunludur." });

  const filePath = path.join(AGENT_DIR, filename);
  try {
    // Save current version before overwriting (prompt versioning)
    if (fs.existsSync(filePath)) {
      const oldContent = fs.readFileSync(filePath, "utf8");
      savePromptVersion(filename, oldContent);
    }
    fs.writeFileSync(filePath, content, "utf8");
    loadAllAgentConfig();
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// Topics: List
app.get("/api/admin/agent/topics", requireAdminAccess, (_req, res) => {
  try {
    const index = readJsonFileSafe(path.join(TOPICS_DIR, "_index.json"), { topics: [] });
    return res.json({ ok: true, topics: index.topics });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// Topics: Get one (meta + content)
app.get("/api/admin/agent/topics/:topicId", requireAdminAccess, (req, res) => {
  try {
    const index = readJsonFileSafe(path.join(TOPICS_DIR, "_index.json"), { topics: [] });
    const topic = index.topics.find(t => t.id === req.params.topicId);
    if (!topic) return res.status(404).json({ error: "Konu bulunamadi." });

    const content = readTextFileSafe(path.join(TOPICS_DIR, topic.file), "");
    return res.json({ ok: true, topic, content });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// Topics: Update
app.put("/api/admin/agent/topics/:topicId", requireAdminAccess, (req, res) => {
  try {
    const { title, keywords, requiresEscalation, canResolveDirectly, requiredInfo, content } = req.body || {};
    const indexPath = path.join(TOPICS_DIR, "_index.json");
    const index = readJsonFileSafe(indexPath, { topics: [] });
    const topicIdx = index.topics.findIndex(t => t.id === req.params.topicId);
    if (topicIdx < 0) return res.status(404).json({ error: "Konu bulunamadi." });

    const topic = index.topics[topicIdx];
    if (title !== undefined) topic.title = title;
    if (Array.isArray(keywords)) topic.keywords = keywords;
    if (typeof requiresEscalation === "boolean") topic.requiresEscalation = requiresEscalation;
    if (typeof canResolveDirectly === "boolean") topic.canResolveDirectly = canResolveDirectly;
    if (Array.isArray(requiredInfo)) topic.requiredInfo = requiredInfo;

    fs.writeFileSync(indexPath, JSON.stringify(index, null, 2), "utf8");

    if (typeof content === "string") {
      fs.writeFileSync(path.join(TOPICS_DIR, topic.file), content, "utf8");
    }

    loadAllAgentConfig();
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// Topics: Create
app.post("/api/admin/agent/topics", requireAdminAccess, (req, res) => {
  try {
    const { id, title, keywords, requiresEscalation, canResolveDirectly, requiredInfo, content } = req.body || {};
    if (!id || !title) return res.status(400).json({ error: "id ve title zorunludur." });
    if (!/^[a-z0-9-]+$/.test(id)) return res.status(400).json({ error: "Gecersiz konu ID formati." });

    const indexPath = path.join(TOPICS_DIR, "_index.json");
    const index = readJsonFileSafe(indexPath, { topics: [] });
    if (index.topics.find(t => t.id === id)) return res.status(400).json({ error: "Bu ID zaten var." });

    const filename = `${id}.md`;
    const newTopic = {
      id,
      title,
      keywords: Array.isArray(keywords) ? keywords : [],
      file: filename,
      requiresEscalation: Boolean(requiresEscalation),
      requiredInfo: Array.isArray(requiredInfo) ? requiredInfo : [],
      canResolveDirectly: Boolean(canResolveDirectly)
    };

    index.topics.push(newTopic);
    fs.writeFileSync(indexPath, JSON.stringify(index, null, 2), "utf8");
    fs.writeFileSync(path.join(TOPICS_DIR, filename), content || "", "utf8");

    loadAllAgentConfig();
    return res.json({ ok: true, topic: newTopic });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// Topics: Delete
app.delete("/api/admin/agent/topics/:topicId", requireAdminAccess, (req, res) => {
  try {
    const indexPath = path.join(TOPICS_DIR, "_index.json");
    const index = readJsonFileSafe(indexPath, { topics: [] });
    const topicIdx = index.topics.findIndex(t => t.id === req.params.topicId);
    if (topicIdx < 0) return res.status(404).json({ error: "Konu bulunamadi." });

    const topic = index.topics[topicIdx];
    index.topics.splice(topicIdx, 1);
    fs.writeFileSync(indexPath, JSON.stringify(index, null, 2), "utf8");

    // Optionally delete the topic file
    const topicFile = path.join(TOPICS_DIR, topic.file);
    try { fs.unlinkSync(topicFile); } catch (_e) { /* ignore */ }

    loadAllAgentConfig();
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// Memory: Read files
app.get("/api/admin/agent/memory", requireAdminAccess, (_req, res) => {
  try {
    const ticketTemplate = readJsonFileSafe(path.join(MEMORY_DIR, "ticket-template.json"), {});
    const conversationSchema = readJsonFileSafe(path.join(MEMORY_DIR, "conversation-schema.json"), {});
    return res.json({ ok: true, files: { "ticket-template.json": ticketTemplate, "conversation-schema.json": conversationSchema } });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// Memory: Save file
app.put("/api/admin/agent/memory/:filename", requireAdminAccess, (req, res) => {
  const filename = req.params.filename;
  const allowed = ["ticket-template.json", "conversation-schema.json"];
  if (!allowed.includes(filename)) return res.status(400).json({ error: "Gecersiz dosya adi." });

  const { content } = req.body || {};
  if (typeof content !== "string") return res.status(400).json({ error: "content zorunludur." });

  // Validate JSON
  try { JSON.parse(content); } catch (err) {
    return res.status(400).json({ error: "Gecersiz JSON: " + err.message });
  }

  try {
    fs.writeFileSync(path.join(MEMORY_DIR, filename), content, "utf8");
    loadAllAgentConfig();
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// Env: Read
app.get("/api/admin/env", requireAdminAccess, (_req, res) => {
  try {
    const env = readEnvFile();
    // Mask sensitive values
    const SENSITIVE_KEYS = ["GOOGLE_API_KEY", "LLM_API_KEY", "EMBEDDING_API_KEY", "ADMIN_TOKEN", "ZENDESK_SNIPPET_KEY", "ZENDESK_SC_KEY_SECRET", "ZENDESK_SC_WEBHOOK_SECRET", "DEPLOY_WEBHOOK_SECRET", "TELEGRAM_BOT_TOKEN"];
    const masked = {};
    for (const [key, value] of Object.entries(env)) {
      if (SENSITIVE_KEYS.includes(key) && value) {
        masked[key] = value.slice(0, 4) + "****" + value.slice(-4);
      } else {
        masked[key] = value;
      }
    }
    return res.json({ ok: true, env: masked, sensitiveKeys: SENSITIVE_KEYS });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// Env: Update
app.put("/api/admin/env", requireAdminAccess, (req, res) => {
  try {
    const { updates } = req.body || {};
    if (!updates || typeof updates !== "object") return res.status(400).json({ error: "updates objesi zorunludur." });

    // Don't update masked values (containing ****)
    const cleanUpdates = {};
    for (const [key, value] of Object.entries(updates)) {
      if (typeof value === "string" && !value.includes("****")) {
        cleanUpdates[key] = value;
      }
    }

    writeEnvFile(cleanUpdates);
    reloadRuntimeEnv();
    return res.json({ ok: true, message: "Env guncellendi ve aninda uyguland\u0131." });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// Chat Flow Config
app.get("/api/admin/chat-flow", requireAdminAccess, (_req, res) => {
  res.json({ ok: true, config: chatFlowConfig, defaults: DEFAULT_CHAT_FLOW_CONFIG });
});

app.put("/api/admin/chat-flow", requireAdminAccess, (req, res) => {
  try {
    const updates = req.body?.config;
    if (!updates || typeof updates !== "object") {
      return res.status(400).json({ error: "config objesi zorunludur." });
    }
    // Only allow known keys
    const allowed = Object.keys(DEFAULT_CHAT_FLOW_CONFIG);
    const clean = {};
    for (const key of allowed) {
      if (updates[key] !== undefined) {
        clean[key] = updates[key];
      }
    }
    saveChatFlowConfig(clean);
    res.json({ ok: true, config: chatFlowConfig });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Site Config
app.get("/api/admin/site-config", requireAdminAccess, (_req, res) => {
  res.json({ ok: true, config: siteConfig, defaults: DEFAULT_SITE_CONFIG });
});

app.put("/api/admin/site-config", requireAdminAccess, (req, res) => {
  try {
    const updates = req.body?.config;
    if (!updates || typeof updates !== "object") {
      return res.status(400).json({ error: "config objesi zorunludur." });
    }
    const allowed = Object.keys(DEFAULT_SITE_CONFIG);
    const clean = {};
    for (const key of allowed) {
      if (updates[key] !== undefined) {
        clean[key] = updates[key];
      }
    }
    saveSiteConfig(clean);
    res.json({ ok: true, config: siteConfig });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Logo upload
const LOGO_ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/svg+xml", "image/webp", "image/gif"]);

app.post("/api/admin/site-logo", requireAdminAccess, express.raw({ type: ["image/jpeg", "image/png", "image/svg+xml", "image/webp", "image/gif"], limit: "2mb" }), (req, res) => {
  try {
    const contentType = req.headers["content-type"] || "";
    if (!LOGO_ALLOWED_TYPES.has(contentType)) {
      return res.status(400).json({ error: "Desteklenmeyen dosya tipi. JPEG, PNG, SVG, WebP veya GIF kullanin." });
    }
    const ext = contentType.split("/")[1] === "svg+xml" ? "svg" : contentType.split("/")[1];
    const logoPath = path.join(__dirname, "public", "custom-logo." + ext);
    // Remove old custom logos
    for (const old of ["custom-logo.jpeg", "custom-logo.png", "custom-logo.svg", "custom-logo.webp", "custom-logo.gif"]) {
      const oldPath = path.join(__dirname, "public", old);
      if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
    }
    fs.writeFileSync(logoPath, req.body);
    const logoUrl = "custom-logo." + ext;
    saveSiteConfig({ logoUrl });
    res.json({ ok: true, logoUrl });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Sunshine Config
app.get("/api/admin/sunshine-config", requireAdminAccess, (_req, res) => {
  const masked = { ...sunshineConfig };
  if (masked.keySecret) masked.keySecret = masked.keySecret.slice(0, 4) + "****" + masked.keySecret.slice(-4);
  if (masked.webhookSecret) masked.webhookSecret = masked.webhookSecret.slice(0, 4) + "****" + masked.webhookSecret.slice(-4);
  res.json({ ok: true, config: masked, defaults: DEFAULT_SUNSHINE_CONFIG });
});

app.put("/api/admin/sunshine-config", requireAdminAccess, (req, res) => {
  try {
    const updates = req.body?.config;
    if (!updates || typeof updates !== "object") {
      return res.status(400).json({ error: "config objesi zorunludur." });
    }
    const allowed = Object.keys(DEFAULT_SUNSHINE_CONFIG);
    const clean = {};
    for (const key of allowed) {
      if (updates[key] !== undefined) {
        // Don't overwrite with masked values
        if (typeof updates[key] === "string" && updates[key].includes("****")) continue;
        clean[key] = updates[key];
      }
    }
    saveSunshineConfig(clean);
    // Sync env vars
    if (clean.enabled !== undefined) ZENDESK_SC_ENABLED = Boolean(clean.enabled);
    res.json({ ok: true, config: sunshineConfig });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/admin/sunshine-config/test", requireAdminAccess, async (_req, res) => {
  try {
    const appId = sunshineConfig.appId || ZENDESK_SC_APP_ID;
    const keyId = sunshineConfig.keyId || ZENDESK_SC_KEY_ID;
    const keySecret = sunshineConfig.keySecret || ZENDESK_SC_KEY_SECRET;
    const subdomain = sunshineConfig.subdomain || ZENDESK_SC_SUBDOMAIN;

    if (!appId || !keyId || !keySecret || !subdomain) {
      return res.json({ ok: false, error: "Eksik ayarlar: appId, keyId, keySecret ve subdomain zorunludur." });
    }

    const url = "https://" + subdomain + ".zendesk.com/sc/v2/apps/" + appId;
    const resp = await fetch(url, {
      method: "GET",
      headers: { "Authorization": "Basic " + Buffer.from(keyId + ":" + keySecret).toString("base64") }
    });

    if (resp.ok) {
      res.json({ ok: true, message: "Baglanti basarili! Sunshine Conversations API erisimi dogrulandi." });
    } else {
      const errText = await resp.text().catch(() => "");
      res.json({ ok: false, error: "API hatasi: " + resp.status + " " + errText.slice(0, 200) });
    }
  } catch (err) {
    res.json({ ok: false, error: "Baglanti hatasi: " + err.message });
  }
});

// System: Status
app.get("/api/admin/system", requireAdminAccess, async (_req, res) => {
  try {
    const memUsage = process.memoryUsage();
    const kbRowCount = knowledgeTable ? await knowledgeTable.countRows().catch(() => 0) : 0;

    const agentFiles = ["soul.md", "persona.md", "domain.md", "bootstrap.md", "response-policy.md", "skills.md", "hard-bans.md", "escalation-matrix.md", "definition-of-done.md", "output-filter.md"];
    const agentStatus = agentFiles.map(f => ({
      file: f,
      loaded: Boolean(readTextFileSafe(path.join(AGENT_DIR, f), ""))
    }));

    return res.json({
      ok: true,
      uptime: process.uptime(),
      nodeVersion: process.version,
      memory: {
        rss: memUsage.rss,
        heapUsed: memUsage.heapUsed,
        heapTotal: memUsage.heapTotal
      },
      agentStatus,
      knowledgeBase: {
        loaded: Boolean(knowledgeTable),
        recordCount: kbRowCount
      },
      topicsCount: TOPIC_INDEX.topics.length,
      model: GOOGLE_MODEL,
      llmHealth: llmHealthStatus
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// Agent: Reload config
app.post("/api/admin/agent/reload", requireAdminAccess, (_req, res) => {
  try {
    loadAllAgentConfig();
    loadChatFlowConfig();
    loadSiteConfig();
    loadSunshineConfig();
    return res.json({ ok: true, message: "Agent config yeniden yuklendi." });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════════════════════════════════
// AUDIT LOG
// ══════════════════════════════════════════════════════════════════════════

function loadAuditLog() {
  try {
    if (fs.existsSync(AUDIT_LOG_FILE)) return JSON.parse(fs.readFileSync(AUDIT_LOG_FILE, "utf8"));
  } catch (_e) { /* silent */ }
  return { entries: [] };
}

function saveAuditLog(data) {
  if (data.entries.length > 500) data.entries = data.entries.slice(-500);
  fs.writeFileSync(AUDIT_LOG_FILE, JSON.stringify(data, null, 2), "utf8");
}

function recordAuditEvent(action, details, adminIp) {
  const data = loadAuditLog();
  data.entries.push({
    action,
    details: String(details || "").slice(0, 500),
    adminIp: String(adminIp || "").slice(0, 50),
    timestamp: nowIso()
  });
  saveAuditLog(data);
}

app.get("/api/admin/audit-log", requireAdminAccess, (_req, res) => {
  const data = loadAuditLog();
  return res.json({ ok: true, entries: (data.entries || []).slice(-100).reverse() });
});

// ══════════════════════════════════════════════════════════════════════════
// BULK TICKET OPERATIONS
// ══════════════════════════════════════════════════════════════════════════

app.post("/api/admin/tickets/bulk", requireAdminAccess, (req, res) => {
  const { ticketIds, action, value } = req.body || {};
  if (!Array.isArray(ticketIds) || !ticketIds.length) {
    return res.status(400).json({ error: "ticketIds dizisi zorunludur." });
  }
  const validActions = ["close", "assign", "priority"];
  if (!validActions.includes(action)) {
    return res.status(400).json({ error: "action: close/assign/priority olmalidir." });
  }

  const db = loadTicketsDb();
  const clientIp = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.socket?.remoteAddress || "unknown";
  let updated = 0;

  for (const ticketId of ticketIds.slice(0, 100)) {
    const ticket = db.tickets.find(t => t.id === ticketId);
    if (!ticket) continue;

    const timestamp = nowIso();
    ticket.updatedAt = timestamp;
    ticket.events = Array.isArray(ticket.events) ? ticket.events : [];

    if (action === "close") {
      ticket.status = "handoff_success";
      ticket.resolvedAt = timestamp;
      ticket.qualityScore = calculateQualityScore(ticket);
      ticket.events.push({ at: timestamp, type: "bulk_closed", message: "Toplu islemle kapatildi." });
    } else if (action === "assign") {
      ticket.assignedTo = String(value || "").trim().slice(0, 100);
      ticket.events.push({ at: timestamp, type: "bulk_assigned", message: `Toplu islemle ${ticket.assignedTo || "?"} atandi.` });
    } else if (action === "priority") {
      const validPriority = ["low", "normal", "high"];
      if (validPriority.includes(value)) {
        ticket.priority = value;
        ticket.events.push({ at: timestamp, type: "bulk_priority", message: `Toplu islemle oncelik ${value} yapildi.` });
      }
    }
    updated++;
  }

  saveTicketsDb(db);
  recordAuditEvent("bulk_" + action, `${updated} ticket guncellendi`, clientIp);
  return res.json({ ok: true, updated });
});

// ══════════════════════════════════════════════════════════════════════════
// EXPORT (CSV/JSON)
// ══════════════════════════════════════════════════════════════════════════

app.get("/api/admin/tickets/export", requireAdminAccess, (req, res) => {
  const format = String(req.query.format || "json").toLowerCase();
  const status = String(req.query.status || "").trim();
  const db = loadTicketsDb();
  let tickets = db.tickets;
  if (status) tickets = tickets.filter(t => t.status === status);

  const exportData = tickets.map(t => ({
    id: t.id, status: t.status, createdAt: t.createdAt, updatedAt: t.updatedAt,
    branchCode: t.branchCode, issueSummary: t.issueSummary, companyName: t.companyName || "",
    fullName: t.fullName || "", phone: t.phone || "", source: t.source || "",
    priority: t.priority || "normal", assignedTo: t.assignedTo || "",
    csatRating: t.csatRating || "", sentiment: t.sentiment || "",
    qualityScore: t.qualityScore || ""
  }));

  if (format === "csv") {
    const csv = Papa.unparse(exportData, { header: true });
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename=tickets-${new Date().toISOString().slice(0, 10)}.csv`);
    return res.send("\uFEFF" + csv); // BOM for Excel Turkish chars
  }

  res.setHeader("Content-Type", "application/json");
  res.setHeader("Content-Disposition", `attachment; filename=tickets-${new Date().toISOString().slice(0, 10)}.json`);
  return res.json(exportData);
});

app.get("/api/admin/analytics/export", requireAdminAccess, (req, res) => {
  const format = String(req.query.format || "json").toLowerCase();
  const range = String(req.query.range || "30d").trim();
  const days = range === "90d" ? 90 : range === "30d" ? 30 : 7;
  const cutoff = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);

  flushAnalyticsBuffer();
  const entries = [];
  for (const [dayKey, day] of Object.entries(analyticsData.daily || {})) {
    if (dayKey < cutoff) continue;
    entries.push({ date: dayKey, ...day });
  }
  entries.sort((a, b) => a.date.localeCompare(b.date));

  if (format === "csv") {
    const csv = Papa.unparse(entries, { header: true });
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename=analytics-${new Date().toISOString().slice(0, 10)}.csv`);
    return res.send("\uFEFF" + csv);
  }

  res.setHeader("Content-Type", "application/json");
  res.setHeader("Content-Disposition", `attachment; filename=analytics-${new Date().toISOString().slice(0, 10)}.json`);
  return res.json(entries);
});

// ══════════════════════════════════════════════════════════════════════════
// SLA TRACKING
// ══════════════════════════════════════════════════════════════════════════

const SLA_FIRST_RESPONSE_MIN = Number(process.env.SLA_FIRST_RESPONSE_MIN || 5);
const SLA_RESOLUTION_MIN = Number(process.env.SLA_RESOLUTION_MIN || 60);

function checkSLABreach(ticket) {
  const now = Date.now();
  const created = Date.parse(ticket.createdAt || "");
  if (!Number.isFinite(created)) return { firstResponse: false, resolution: false };

  const firstResponseBreach = !ticket.firstResponseAt && (now - created) > SLA_FIRST_RESPONSE_MIN * 60000;
  const resolutionBreach = !ticket.resolvedAt && (now - created) > SLA_RESOLUTION_MIN * 60000;

  return { firstResponse: firstResponseBreach, resolution: resolutionBreach };
}

app.get("/api/admin/sla", requireAdminAccess, (_req, res) => {
  const db = loadTicketsDb();
  const activeTickets = db.tickets.filter(t => !t.resolvedAt);
  let firstResponseBreaches = 0, resolutionBreaches = 0;
  const breachedTickets = [];

  for (const ticket of activeTickets) {
    const breach = checkSLABreach(ticket);
    if (breach.firstResponse) firstResponseBreaches++;
    if (breach.resolution) resolutionBreaches++;
    if (breach.firstResponse || breach.resolution) {
      breachedTickets.push({
        id: ticket.id, branchCode: ticket.branchCode, issueSummary: (ticket.issueSummary || "").slice(0, 100),
        createdAt: ticket.createdAt, firstResponseBreach: breach.firstResponse, resolutionBreach: breach.resolution
      });
    }
  }

  const resolvedTickets = db.tickets.filter(t => t.resolvedAt && t.createdAt);
  let totalResolutionMs = 0;
  for (const t of resolvedTickets) {
    totalResolutionMs += Date.parse(t.resolvedAt) - Date.parse(t.createdAt);
  }
  const avgResolutionMs = resolvedTickets.length ? Math.round(totalResolutionMs / resolvedTickets.length) : 0;
  const slaComplianceRate = activeTickets.length > 0
    ? Math.round(((activeTickets.length - breachedTickets.length) / activeTickets.length) * 100)
    : 100;

  return res.json({
    ok: true,
    config: { firstResponseMin: SLA_FIRST_RESPONSE_MIN, resolutionMin: SLA_RESOLUTION_MIN },
    summary: { activeTickets: activeTickets.length, firstResponseBreaches, resolutionBreaches, slaComplianceRate, avgResolutionMin: Math.round(avgResolutionMs / 60000) },
    breachedTickets: breachedTickets.slice(0, 50)
  });
});

// ══════════════════════════════════════════════════════════════════════════
// AUTO-FAQ GENERATION
// ══════════════════════════════════════════════════════════════════════════

const SUGGESTED_FAQS_FILE = path.join(DATA_DIR, "suggested-faqs.json");

function loadSuggestedFAQs() {
  try {
    if (fs.existsSync(SUGGESTED_FAQS_FILE)) return JSON.parse(fs.readFileSync(SUGGESTED_FAQS_FILE, "utf8"));
  } catch (_e) { /* silent */ }
  return { faqs: [] };
}

function saveSuggestedFAQs(data) {
  if (data.faqs.length > 200) data.faqs = data.faqs.slice(-200);
  fs.writeFileSync(SUGGESTED_FAQS_FILE, JSON.stringify(data, null, 2), "utf8");
}

app.post("/api/admin/auto-faq/generate", requireAdminAccess, async (_req, res) => {
  const providerCfg = getProviderConfig();
  if (!providerCfg.apiKey && providerCfg.provider !== "ollama") {
    return res.status(400).json({ error: "LLM API key gerekli." });
  }

  const db = loadTicketsDb();
  // Find resolved tickets with chat history
  const resolved = db.tickets
    .filter(t => t.status === "handoff_success" && Array.isArray(t.chatHistory) && t.chatHistory.length >= 3)
    .slice(-10);

  if (!resolved.length) {
    return res.json({ ok: true, generated: 0, message: "Uygun cozulmus ticket bulunamadi." });
  }

  const data = loadSuggestedFAQs();
  let generated = 0;

  for (const ticket of resolved.slice(0, 5)) {
    const chatText = ticket.chatHistory
      .map(m => `${m.role === "user" ? "Kullanici" : "Bot"}: ${(m.content || "").slice(0, 300)}`)
      .join("\n");

    try {
      const result = await callLLM(
        [{ role: "user", parts: [{ text: chatText }] }],
        'Bu konusma gecmisinden bir FAQ Q&A cifti olustur. Format: {"question":"...", "answer":"..."}. Turkce yaz. Sadece JSON yaz.',
        256
      );
      const reply = (result.reply || "").trim();
      // Try to parse JSON from reply
      const jsonMatch = reply.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        if (parsed.question && parsed.answer) {
          data.faqs.push({
            id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
            question: String(parsed.question).slice(0, 500),
            answer: String(parsed.answer).slice(0, 1000),
            ticketId: ticket.id,
            status: "pending",
            createdAt: nowIso()
          });
          generated++;
        }
      }
    } catch (_e) { /* skip */ }
  }

  saveSuggestedFAQs(data);
  return res.json({ ok: true, generated });
});

app.get("/api/admin/auto-faq", requireAdminAccess, (_req, res) => {
  const data = loadSuggestedFAQs();
  return res.json({ ok: true, faqs: (data.faqs || []).filter(f => f.status === "pending") });
});

app.post("/api/admin/auto-faq/:id/approve", requireAdminAccess, async (req, res) => {
  const data = loadSuggestedFAQs();
  const faq = data.faqs.find(f => f.id === req.params.id);
  if (!faq) return res.status(404).json({ error: "FAQ bulunamadi." });

  // Add to KB
  const rows = loadCSVData();
  rows.push({ question: faq.question, answer: faq.answer, source: "auto-faq" });
  saveCSVData(rows);
  await reingestKnowledgeBase();

  faq.status = "approved";
  saveSuggestedFAQs(data);
  const clientIp = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.socket?.remoteAddress || "";
  recordAuditEvent("faq_approved", faq.question.slice(0, 100), clientIp);
  return res.json({ ok: true });
});

app.post("/api/admin/auto-faq/:id/reject", requireAdminAccess, (req, res) => {
  const data = loadSuggestedFAQs();
  const faq = data.faqs.find(f => f.id === req.params.id);
  if (!faq) return res.status(404).json({ error: "FAQ bulunamadi." });
  faq.status = "rejected";
  saveSuggestedFAQs(data);
  return res.json({ ok: true });
});

// ══════════════════════════════════════════════════════════════════════════
// CONTENT GAPS
// ══════════════════════════════════════════════════════════════════════════

app.get("/api/admin/content-gaps", requireAdminAccess, (_req, res) => {
  const data = loadContentGaps();
  const sorted = (data.gaps || []).sort((a, b) => b.count - a.count).slice(0, 100);
  return res.json({ ok: true, gaps: sorted });
});

app.delete("/api/admin/content-gaps/:index", requireAdminAccess, (req, res) => {
  const data = loadContentGaps();
  const idx = Number(req.params.index);
  const sorted = (data.gaps || []).sort((a, b) => b.count - a.count);
  if (idx >= 0 && idx < sorted.length) {
    const query = sorted[idx].query;
    data.gaps = data.gaps.filter(g => g.query !== query);
    saveContentGaps(data);
  }
  return res.json({ ok: true });
});

// ══════════════════════════════════════════════════════════════════════════
// FEEDBACK
// ══════════════════════════════════════════════════════════════════════════

app.get("/api/admin/feedback", requireAdminAccess, (_req, res) => {
  const data = loadFeedback();
  return res.json({ ok: true, entries: (data.entries || []).slice(-100).reverse() });
});

// ══════════════════════════════════════════════════════════════════════════
// ANALYTICS
// ══════════════════════════════════════════════════════════════════════════

app.get("/api/admin/analytics", requireAdminAccess, (_req, res) => {
  try {
    flushAnalyticsBuffer();
    const range = String(_req.query.range || "7d").trim();
    const days = range === "90d" ? 90 : range === "30d" ? 30 : 7;
    const cutoff = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);

    const dailyEntries = [];
    let totalChats = 0, totalAiCalls = 0, totalDeterministic = 0;
    let totalResponseMs = 0, totalResponseCount = 0;
    let totalEscalations = 0, totalCsatSum = 0, totalCsatCount = 0, totalFallbacks = 0;
    let totalFeedbackUp = 0, totalFeedbackDown = 0;
    const topicTotals = {};
    const sentimentTotals = {};

    for (const [dayKey, day] of Object.entries(analyticsData.daily || {})) {
      if (dayKey < cutoff) continue;
      dailyEntries.push({ date: dayKey, ...day, avgResponseMs: day.responseCount > 0 ? Math.round(day.totalResponseMs / day.responseCount) : 0 });
      totalChats += day.totalChats || 0;
      totalAiCalls += day.aiCalls || 0;
      totalDeterministic += day.deterministicReplies || 0;
      totalResponseMs += day.totalResponseMs || 0;
      totalResponseCount += day.responseCount || 0;
      totalEscalations += day.escalationCount || 0;
      totalFallbacks += day.fallbackCount || 0;
      totalCsatSum += day.csatSum || 0;
      totalCsatCount += day.csatCount || 0;
      totalFeedbackUp += day.feedbackUp || 0;
      totalFeedbackDown += day.feedbackDown || 0;
      for (const [tid, cnt] of Object.entries(day.topicCounts || {})) {
        topicTotals[tid] = (topicTotals[tid] || 0) + cnt;
      }
      for (const [sent, cnt] of Object.entries(day.sentimentCounts || {})) {
        sentimentTotals[sent] = (sentimentTotals[sent] || 0) + cnt;
      }
    }

    dailyEntries.sort((a, b) => a.date.localeCompare(b.date));

    const topTopics = Object.entries(topicTotals)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([topicId, count]) => ({ topicId, count }));

    return res.json({
      ok: true,
      range,
      summary: {
        totalChats,
        aiCalls: totalAiCalls,
        deterministicReplies: totalDeterministic,
        avgResponseMs: totalResponseCount > 0 ? Math.round(totalResponseMs / totalResponseCount) : 0,
        escalationCount: totalEscalations,
        escalationRate: totalChats > 0 ? Math.round((totalEscalations / totalChats) * 100) : 0,
        fallbackCount: totalFallbacks,
        csatAverage: totalCsatCount > 0 ? Math.round((totalCsatSum / totalCsatCount) * 10) / 10 : 0,
        csatCount: totalCsatCount,
        deflectionRate: totalChats > 0 ? Math.round(((totalChats - totalEscalations) / totalChats) * 100) : 0,
        feedbackUp: totalFeedbackUp,
        feedbackDown: totalFeedbackDown,
        sentimentCounts: sentimentTotals
      },
      daily: dailyEntries,
      topTopics
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════════════════════════════════
// WEBHOOKS CRUD
// ══════════════════════════════════════════════════════════════════════════

app.get("/api/admin/webhooks", requireAdminAccess, (_req, res) => {
  const hooks = loadWebhooks().map(h => ({
    ...h,
    secret: h.secret ? h.secret.slice(0, 4) + "****" + h.secret.slice(-4) : ""
  }));
  return res.json({ ok: true, webhooks: hooks });
});

app.post("/api/admin/webhooks", requireAdminAccess, (req, res) => {
  const { url, events, secret } = req.body || {};
  if (!url) return res.status(400).json({ error: "url zorunludur." });
  const hooks = loadWebhooks();
  const hook = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    url,
    events: Array.isArray(events) ? events : ["*"],
    active: true,
    secret: secret || ""
  };
  hooks.push(hook);
  saveWebhooks(hooks);
  return res.json({ ok: true, webhook: hook });
});

app.put("/api/admin/webhooks/:id", requireAdminAccess, (req, res) => {
  const hooks = loadWebhooks();
  const hook = hooks.find(h => h.id === req.params.id);
  if (!hook) return res.status(404).json({ error: "Webhook bulunamadi." });
  const { url, events, active, secret } = req.body || {};
  if (url !== undefined) hook.url = url;
  if (Array.isArray(events)) hook.events = events;
  if (typeof active === "boolean") hook.active = active;
  if (secret !== undefined) hook.secret = secret;
  saveWebhooks(hooks);
  return res.json({ ok: true, webhook: hook });
});

app.get("/api/admin/webhooks/deliveries", requireAdminAccess, (_req, res) => {
  const data = loadWebhookDeliveryLog();
  return res.json({ ok: true, deliveries: (data.deliveries || []).slice(-50).reverse() });
});

app.delete("/api/admin/webhooks/:id", requireAdminAccess, (req, res) => {
  let hooks = loadWebhooks();
  const idx = hooks.findIndex(h => h.id === req.params.id);
  if (idx < 0) return res.status(404).json({ error: "Webhook bulunamadi." });
  hooks.splice(idx, 1);
  saveWebhooks(hooks);
  return res.json({ ok: true });
});

app.post("/api/admin/webhooks/:id/test", requireAdminAccess, async (req, res) => {
  const hooks = loadWebhooks();
  const hook = hooks.find(h => h.id === req.params.id);
  if (!hook) return res.status(404).json({ error: "Webhook bulunamadi." });
  try {
    const body = JSON.stringify({ event: "test", data: { message: "Qragy webhook test" }, timestamp: new Date().toISOString() });
    const headers = { "Content-Type": "application/json" };
    if (hook.secret) {
      headers["X-Qragy-Signature"] = crypto.createHmac("sha256", hook.secret).update(body).digest("hex");
    }
    const resp = await fetch(hook.url, { method: "POST", headers, body });
    return res.json({ ok: true, status: resp.status });
  } catch (err) {
    return res.json({ ok: false, error: err.message });
  }
});

// ══════════════════════════════════════════════════════════════════════════
// KB: FILE UPLOAD (PDF/DOCX/TXT)
// ══════════════════════════════════════════════════════════════════════════

// multer already required at top for chat upload
const upload = multer({ dest: UPLOADS_DIR, limits: { fileSize: 10 * 1024 * 1024 } });

// chunkText — moved to lib/chunker.js

async function extractTextFromFile(filePath, mimetype, originalname) {
  const ext = path.extname(originalname).toLowerCase();
  if (ext === ".txt" || mimetype === "text/plain") {
    return fs.readFileSync(filePath, "utf8");
  }
  if (ext === ".pdf" || mimetype === "application/pdf") {
    const pdfParse = require("pdf-parse");
    const buffer = fs.readFileSync(filePath);
    const data = await pdfParse(buffer);
    return data.text || "";
  }
  if (ext === ".docx" || mimetype === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
    const mammoth = require("mammoth");
    const result = await mammoth.extractRawText({ path: filePath });
    return result.value || "";
  }
  throw new Error("Desteklenmeyen dosya formati: " + ext);
}

app.post("/api/admin/knowledge/upload", requireAdminAccess, upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Dosya gerekli." });
  try {
    const text = await extractTextFromFile(req.file.path, req.file.mimetype, req.file.originalname);
    if (!text.trim()) return res.status(400).json({ error: "Dosyadan metin cikarilamadi." });

    const chunks = chunkText(text, { filename: req.file.originalname });
    if (!chunks.length) return res.status(400).json({ error: "Yeterli icerik bulunamadi." });

    const rows = loadCSVData();
    let added = 0;

    for (const chunk of chunks) {
      // Generate a question from the chunk using Gemini
      let question;
      try {
        const qResult = await callLLM(
          [{ role: "user", parts: [{ text: chunk }] }],
          "Bu metin parcasini ozetleyen tek bir soru yaz. Turkce yaz. Sadece soruyu yaz, baska bir sey yazma.",
          64
        );
        question = (qResult.reply || "").trim();
      } catch (_e) {
        question = chunk.slice(0, 100) + "...";
      }
      if (!question) question = chunk.slice(0, 100) + "...";

      rows.push({ question, answer: chunk, source: req.file.originalname });
      added++;
    }

    saveCSVData(rows);
    await reingestKnowledgeBase();

    // Cleanup uploaded file
    try { fs.unlinkSync(req.file.path); } catch (_e) { /* ignore */ }

    return res.json({ ok: true, chunksAdded: added, totalRecords: rows.length });
  } catch (err) {
    try { fs.unlinkSync(req.file.path); } catch (_e) { /* ignore */ }
    return res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════════════════════════════════
// TICKET: TEAM FEATURES (assign, notes, priority)
// ══════════════════════════════════════════════════════════════════════════

app.put("/api/admin/tickets/:ticketId/assign", requireAdminAccess, (req, res) => {
  const ticketId = String(req.params.ticketId || "").trim();
  const { assignedTo } = req.body || {};
  const db = loadTicketsDb();
  const ticket = db.tickets.find(t => t.id === ticketId);
  if (!ticket) return res.status(404).json({ error: "Ticket bulunamadi." });
  ticket.assignedTo = String(assignedTo || "").trim();
  ticket.updatedAt = nowIso();
  if (!ticket.firstResponseAt) ticket.firstResponseAt = ticket.updatedAt;
  ticket.events = Array.isArray(ticket.events) ? ticket.events : [];
  ticket.events.push({ at: ticket.updatedAt, type: "assigned", message: `Ticket ${ticket.assignedTo || "kimseye"} atandi.` });
  saveTicketsDb(db);
  const clientIp = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.socket?.remoteAddress || "";
  recordAuditEvent("ticket_assign", `${ticketId} -> ${ticket.assignedTo}`, clientIp);
  return res.json({ ok: true, ticket: sanitizeTicketForList(ticket) });
});

app.post("/api/admin/tickets/:ticketId/notes", requireAdminAccess, (req, res) => {
  const ticketId = String(req.params.ticketId || "").trim();
  const { note, author } = req.body || {};
  if (!note) return res.status(400).json({ error: "note zorunludur." });
  const db = loadTicketsDb();
  const ticket = db.tickets.find(t => t.id === ticketId);
  if (!ticket) return res.status(404).json({ error: "Ticket bulunamadi." });
  if (!Array.isArray(ticket.internalNotes)) ticket.internalNotes = [];
  const entry = { at: nowIso(), note: String(note).slice(0, 2000), author: String(author || "admin").slice(0, 100) };
  ticket.internalNotes.push(entry);
  ticket.updatedAt = entry.at;
  saveTicketsDb(db);
  return res.json({ ok: true, note: entry });
});

app.put("/api/admin/tickets/:ticketId/priority", requireAdminAccess, (req, res) => {
  const ticketId = String(req.params.ticketId || "").trim();
  const { priority } = req.body || {};
  const valid = ["low", "normal", "high"];
  if (!valid.includes(priority)) return res.status(400).json({ error: "priority: low/normal/high olmalidir." });
  const db = loadTicketsDb();
  const ticket = db.tickets.find(t => t.id === ticketId);
  if (!ticket) return res.status(404).json({ error: "Ticket bulunamadi." });
  ticket.priority = priority;
  ticket.updatedAt = nowIso();
  ticket.events = Array.isArray(ticket.events) ? ticket.events : [];
  ticket.events.push({ at: ticket.updatedAt, type: "priority_changed", message: `Oncelik ${priority} olarak degistirildi.` });
  saveTicketsDb(db);
  const clientIp = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.socket?.remoteAddress || "";
  recordAuditEvent("ticket_priority", `${ticketId} -> ${priority}`, clientIp);
  return res.json({ ok: true, ticket: sanitizeTicketForList(ticket) });
});

// ══════════════════════════════════════════════════════════════════════════
// PROMPT VERSIONING
// ══════════════════════════════════════════════════════════════════════════

app.get("/api/admin/prompt-versions", requireAdminAccess, (_req, res) => {
  const data = loadPromptVersions();
  return res.json({ ok: true, versions: data.versions || [] });
});

app.post("/api/admin/prompt-versions/:id/rollback", requireAdminAccess, (req, res) => {
  const data = loadPromptVersions();
  const version = data.versions.find(v => v.id === req.params.id);
  if (!version) return res.status(404).json({ error: "Versiyon bulunamadi." });
  const filePath = path.join(AGENT_DIR, version.filename);
  try {
    // Save current as new version before rollback
    if (fs.existsSync(filePath)) {
      savePromptVersion(version.filename, fs.readFileSync(filePath, "utf8"));
    }
    fs.writeFileSync(filePath, version.content, "utf8");
    loadAllAgentConfig();
    return res.json({ ok: true, message: `${version.filename} geri alindi.` });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════════════════════════════════
// TELEGRAM BOT (long polling)
// ══════════════════════════════════════════════════════════════════════════

let telegramOffset = 0;

async function processChatMessage(messagesArray, source = "web") {
  // Core chat logic extracted for multi-channel support
  const chatStartTime = Date.now();
  const rawMessages = Array.isArray(messagesArray) ? messagesArray : [];
  if (!rawMessages.length) return { reply: "Mesaj bulunamadi.", source: "error" };

  const supportAvailability = getSupportAvailability();
  const { activeMessages, hasClosedTicketHistory, lastClosedTicketMemory } = splitActiveTicketMessages(rawMessages);
  const activeUserMessages = getUserMessages(activeMessages);
  const memory = extractTicketMemory(activeMessages);
  const latestUserMessage = activeUserMessages[activeUserMessages.length - 1] || "";

  const chatHistorySnapshot = activeMessages
    .filter(m => m && m.content)
    .slice(-50)
    .map(m => ({ role: m.role, content: String(m.content).slice(0, 500) }));

  const conversationContext = buildConversationContext(memory, activeUserMessages);

  // Deterministic reply
  if (conversationContext.conversationState === "welcome_or_greet" ||
      (conversationContext.conversationState !== "topic_detection" &&
       conversationContext.conversationState !== "topic_guided_support" &&
       !conversationContext.currentTopic)) {
    const deterministicReply = buildDeterministicCollectionReply(memory, activeUserMessages, hasClosedTicketHistory);
    if (deterministicReply) {
      recordAnalyticsEvent({ source: "rule-engine", responseTimeMs: Date.now() - chatStartTime });
      return { reply: deterministicReply, source: "rule-engine", memory };
    }
  }

  if (!getProviderConfig().apiKey && getProviderConfig().provider !== "ollama") {
    return { reply: buildMissingFieldsReply(memory, latestUserMessage), source: "fallback-no-key", memory };
  }

  const contents = activeMessages
    .filter(item => item && typeof item.content === "string" && item.content.trim())
    .map(item => ({ role: item.role === "assistant" ? "model" : "user", parts: [{ text: item.content.trim() }] }));

  if (!contents.length) return { reply: "Gecerli mesaj bulunamadi.", source: "error" };

  // Required fields → ticket
  if (hasRequiredFields(memory) && !conversationContext.currentTopic) {
    const aiSummary = await generateEscalationSummary(contents, memory, conversationContext);
    memory.issueSummary = aiSummary;
    const ticketResult = createOrReuseTicket(memory, supportAvailability, {
      source: ["telegram", "sunshine"].includes(source) ? source : "chat-api",
      model: GOOGLE_MODEL,
      chatHistory: chatHistorySnapshot
    });
    recordAnalyticsEvent({ source: "memory-template", responseTimeMs: Date.now() - chatStartTime });
    if (ticketResult.created) fireWebhook("ticket_created", { ticketId: ticketResult.ticket.id, memory, source });
    return { reply: buildConfirmationMessage(memory), source: "memory-template", memory, ticketId: ticketResult.ticket.id };
  }

  // Escalation
  if (conversationContext.escalationTriggered) {
    const aiSummary = await generateEscalationSummary(contents, memory, conversationContext);
    const escalationMemory = { ...memory, issueSummary: aiSummary };
    const ticketResult = createOrReuseTicket(escalationMemory, supportAvailability, {
      source: ["telegram", "sunshine"].includes(source) ? source : "escalation-trigger",
      model: GOOGLE_MODEL,
      chatHistory: chatHistorySnapshot
    });
    recordAnalyticsEvent({ source: "escalation-trigger", responseTimeMs: Date.now() - chatStartTime });
    if (ticketResult.created) {
      fireWebhook("ticket_created", { ticketId: ticketResult.ticket.id, memory: escalationMemory, source });
      fireWebhook("escalation", { ticketId: ticketResult.ticket.id, memory: escalationMemory, reason: conversationContext.escalationReason });
    }
    return { reply: "Sizi canli destek temsilcimize aktariyorum. Kisa surede yardimci olacaktir.", source: "escalation-trigger", memory: escalationMemory };
  }

  // AI reply
  const knowledgeResults = await searchKnowledge(latestUserMessage);
  const systemPrompt = buildSystemPrompt(memory, conversationContext, knowledgeResults);
  let geminiResult = await callLLMWithFallback(contents, systemPrompt, GOOGLE_MAX_OUTPUT_TOKENS);
  if (geminiResult.finishReason === "MAX_TOKENS" && geminiResult.reply.length < 160) {
    geminiResult = await callLLMWithFallback(contents, systemPrompt, GOOGLE_MAX_OUTPUT_TOKENS * 2);
  }
  if (geminiResult.fallbackUsed) {
    recordLLMError({ message: "Primary model failed, fallback used", status: 429 }, "tg-chat-fallback");
  }
  let reply = sanitizeAssistantReply(geminiResult.reply);
  if (!reply) reply = buildMissingFieldsReply(memory, latestUserMessage);

  recordAnalyticsEvent({ source: conversationContext.currentTopic ? "topic-guided" : "gemini", responseTimeMs: Date.now() - chatStartTime, topicId: conversationContext.currentTopic || null, fallbackUsed: Boolean(geminiResult.fallbackUsed) });
  return { reply, source: conversationContext.currentTopic ? "topic-guided" : "gemini", memory };
}

// ── Sunshine Conversations API Client ───────────────────────────────────
function getSunshineAuthHeader() {
  const keyId = sunshineConfig.keyId || ZENDESK_SC_KEY_ID;
  const keySecret = sunshineConfig.keySecret || ZENDESK_SC_KEY_SECRET;
  return "Basic " + Buffer.from(keyId + ":" + keySecret).toString("base64");
}

function getSunshineBaseUrl() {
  const subdomain = sunshineConfig.subdomain || ZENDESK_SC_SUBDOMAIN;
  return "https://" + subdomain + ".zendesk.com/sc/v2";
}

async function sunshineSendMessage(appId, conversationId, text) {
  const baseUrl = getSunshineBaseUrl();
  const url = baseUrl + "/apps/" + appId + "/conversations/" + conversationId + "/messages";
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": getSunshineAuthHeader()
    },
    body: JSON.stringify({
      author: { type: "business" },
      content: { type: "text", text }
    }),
    signal: controller.signal
  }).finally(() => clearTimeout(timeoutId));
  if (!resp.ok) {
    const errText = await resp.text().catch(() => "");
    console.warn("[Sunshine] Mesaj gonderilemedi:", resp.status, errText);
  }
  return resp.ok;
}

async function sunshinePassControl(appId, conversationId) {
  const baseUrl = getSunshineBaseUrl();
  const url = baseUrl + "/apps/" + appId + "/conversations/" + conversationId + "/passControl";
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": getSunshineAuthHeader()
    },
    body: JSON.stringify({
      switchboardIntegration: { next: true },
      metadata: { reason: "escalation" }
    }),
    signal: controller.signal
  }).finally(() => clearTimeout(timeoutId));
  if (!resp.ok) {
    const errText = await resp.text().catch(() => "");
    console.warn("[Sunshine] passControl hatasi:", resp.status, errText);
  }
  return resp.ok;
}

// ── Sunshine Conversations Webhook ──────────────────────────────────────
app.post("/api/sunshine/webhook", express.json({ limit: "100kb" }), (req, res) => {
  // Validate webhook secret (timing-safe)
  const secret = sunshineConfig.webhookSecret || ZENDESK_SC_WEBHOOK_SECRET;
  if (secret) {
    const provided = (req.headers["x-api-key"] || "").trim();
    if (!provided || provided.length !== secret.length ||
        !crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(secret))) {
      return res.status(401).json({ error: "Unauthorized" });
    }
  }

  // Respond immediately (Zendesk has 20s timeout)
  res.status(200).json({ ok: true });

  // Process async
  const events = req.body?.events || [];
  for (const event of events) {
    if (event.type !== "conversation:message") continue;
    const payload = event.payload || {};
    const message = payload.message || {};
    const conversation = payload.conversation || {};

    // Skip non-user messages
    if (message.author?.type !== "user") continue;
    if (message.content?.type !== "text") continue;

    const conversationId = conversation._id || conversation.id || "";
    const appId = sunshineConfig.appId || ZENDESK_SC_APP_ID || req.body?.app?.id || "";
    if (!conversationId || !appId) continue;

    // Process in background
    (async () => {
      try {
        const sessionKey = "zd-" + conversationId;
        const sessions = loadSunshineSessions();
        if (!sessions[sessionKey]) {
          sessions[sessionKey] = {
            messages: [],
            appId,
            userId: message.author?.userId || "",
            lastActivity: Date.now()
          };
        }

        const session = sessions[sessionKey];
        session.messages.push({ role: "user", content: message.content.text });
        session.lastActivity = Date.now();
        session.nudge75Sent = false;
        session.nudge90Sent = false;
        session.closed = false;

        // Keep last 30 messages
        if (session.messages.length > 30) {
          session.messages = session.messages.slice(-30);
        }

        const result = await processChatMessage(session.messages, "sunshine");
        session.messages.push({ role: "assistant", content: result.reply });
        saveSunshineSessions(sessions);

        // Track conversation
        const memory = result.memory || {};
        upsertConversation(sessionKey, session.messages, memory, { source: "sunshine" });

        // Check for escalation
        const isEscalation = ESCALATION_MESSAGE_REGEX.test(result.reply);
        if (isEscalation) {
          // Send farewell message first
          const farewell = sunshineConfig.farewellMessage || DEFAULT_SUNSHINE_CONFIG.farewellMessage;
          await sunshineSendMessage(appId, conversationId, farewell);
          // Pass control to agent workspace
          await sunshinePassControl(appId, conversationId);
        } else {
          // Send bot reply
          await sunshineSendMessage(appId, conversationId, result.reply);
        }
      } catch (err) {
        console.warn("[Sunshine] Webhook isleme hatasi:", err.message);
      }
    })();
  }
});

async function handleTelegramUpdate(update) {
  const msg = update.message;
  if (!msg || !msg.text) return;

  const chatId = String(msg.chat.id);
  const sessions = loadTelegramSessions();
  if (!sessions[chatId]) sessions[chatId] = { messages: [] };

  // Track activity & reset nudge flags
  sessions[chatId].lastActivity = Date.now();
  sessions[chatId].nudge75Sent = false;
  sessions[chatId].nudge90Sent = false;
  sessions[chatId].closed = false;

  sessions[chatId].messages.push({ role: "user", content: msg.text });
  // Keep last 30 messages
  if (sessions[chatId].messages.length > 30) {
    sessions[chatId].messages = sessions[chatId].messages.slice(-30);
  }

  try {
    const result = await processChatMessage(sessions[chatId].messages, "telegram");
    sessions[chatId].messages.push({ role: "assistant", content: result.reply });
    saveTelegramSessions(sessions);

    // Track conversation
    const memory = result.memory || {};
    upsertConversation("tg-" + chatId, sessions[chatId].messages, memory, { source: "telegram" });

    // Send reply via Telegram API
    await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: result.reply })
    });
  } catch (err) {
    console.warn("Telegram mesaj isleme hatasi:", err.message);
    saveTelegramSessions(sessions);
  }
}

async function pollTelegram() {
  if (!TELEGRAM_ENABLED || !TELEGRAM_BOT_TOKEN) return;
  try {
    const resp = await fetch(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getUpdates?offset=${telegramOffset}&timeout=10&allowed_updates=["message"]`
    );
    const data = await resp.json();
    if (data.ok && Array.isArray(data.result)) {
      for (const update of data.result) {
        telegramOffset = update.update_id + 1;
        await handleTelegramUpdate(update);
      }
    }
  } catch (err) {
    console.warn("Telegram polling hatasi:", err.message);
  }
}

function startTelegramPolling() {
  if (!TELEGRAM_ENABLED || !TELEGRAM_BOT_TOKEN) return;
  console.log("Telegram polling baslatildi.");
  setInterval(pollTelegram, TELEGRAM_POLLING_INTERVAL_MS);
  pollTelegram();
}

// ── Telegram Inactivity Helper ──────────────────────────────────────────
async function sendTelegramMessage(chatId, text) {
  if (!TELEGRAM_BOT_TOKEN || !text) return;
  await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text })
  }).catch(() => {});
}

function checkTelegramInactivity() {
  if (!TELEGRAM_ENABLED || !TELEGRAM_BOT_TOKEN) return;
  const sessions = loadTelegramSessions();
  const timeout = chatFlowConfig.inactivityTimeoutMs || 600000;
  const now = Date.now();
  let changed = false;

  for (const [chatId, session] of Object.entries(sessions)) {
    if (!session.lastActivity || session.closed) continue;
    const elapsed = now - session.lastActivity;

    // 75% nudge
    if (elapsed >= timeout * 0.75 && !session.nudge75Sent) {
      const msg75 = chatFlowConfig.nudgeAt75Message || "Hala buradayım. Size nasıl yardımcı olabilirim?";
      sendTelegramMessage(chatId, msg75);
      session.nudge75Sent = true;
      changed = true;
    }
    // 90% nudge
    if (elapsed >= timeout * 0.90 && !session.nudge90Sent) {
      const msg90 = chatFlowConfig.nudgeAt90Message || "Son birkaç dakikadır mesaj almadım. Yardımcı olabilir miyim?";
      sendTelegramMessage(chatId, msg90);
      session.nudge90Sent = true;
      changed = true;
    }
    // 100% close
    if (elapsed >= timeout) {
      const closeMsg = chatFlowConfig.inactivityCloseMessage || "Uzun süredir mesaj almadığım için sohbeti sonlandırıyorum.";
      sendTelegramMessage(chatId, closeMsg);
      session.closed = true;
      session.messages = [];
      changed = true;
      upsertConversation("tg-" + chatId, [], {}, { source: "telegram", status: "closed" });
      recordAnalyticsEvent({ source: "chat-closed", reason: "inactivity" });
    }
  }

  if (changed) saveTelegramSessions(sessions);
}

// ── Sunshine Inactivity Check ───────────────────────────────────────────
function checkSunshineInactivity() {
  const sessions = loadSunshineSessions();
  const timeout = chatFlowConfig.inactivityTimeoutMs || 600000;
  const now = Date.now();
  let changed = false;

  for (const [sessionKey, session] of Object.entries(sessions)) {
    if (!session.lastActivity || session.closed) continue;
    if (!session.appId) continue;
    const elapsed = now - session.lastActivity;
    // Extract conversationId from sessionKey (format: "zd-<conversationId>")
    const conversationId = sessionKey.startsWith("zd-") ? sessionKey.slice(3) : sessionKey;

    // 75% nudge
    if (elapsed >= timeout * 0.75 && !session.nudge75Sent) {
      const msg75 = chatFlowConfig.nudgeAt75Message || "Hala buradayım. Size nasıl yardımcı olabilirim?";
      sunshineSendMessage(session.appId, conversationId, msg75).catch(() => {});
      session.nudge75Sent = true;
      changed = true;
    }
    // 90% nudge
    if (elapsed >= timeout * 0.90 && !session.nudge90Sent) {
      const msg90 = chatFlowConfig.nudgeAt90Message || "Son birkaç dakikadır mesaj almadım. Yardımcı olabilir miyim?";
      sunshineSendMessage(session.appId, conversationId, msg90).catch(() => {});
      session.nudge90Sent = true;
      changed = true;
    }
    // 100% close
    if (elapsed >= timeout) {
      const closeMsg = chatFlowConfig.inactivityCloseMessage || "Uzun süredir mesaj almadığım için sohbeti sonlandırıyorum.";
      sunshineSendMessage(session.appId, conversationId, closeMsg).catch(() => {});
      session.closed = true;
      session.messages = [];
      changed = true;
      upsertConversation(sessionKey, [], {}, { source: "sunshine", status: "closed" });
      recordAnalyticsEvent({ source: "chat-closed", reason: "inactivity" });
    }
  }

  if (changed) saveSunshineSessions(sessions);
}

app.get("/admin", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "admin.html"));
});

app.get("*", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

(async () => {
  loadAnalyticsData();
  // Cleanup stale Sunshine sessions (older than 7 days)
  try {
    const sessions = loadSunshineSessions();
    const cutoff = Date.now() - 7 * 86400000;
    let changed = false;
    for (const key of Object.keys(sessions)) {
      if ((sessions[key].lastActivity || 0) < cutoff) {
        delete sessions[key];
        changed = true;
      }
    }
    if (changed) saveSunshineSessions(sessions);
  } catch (_e) { /* silent */ }
  // Ensure uploads directory
  if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  await initKnowledgeBase();

  // Data retention: clean up old tickets daily
  function runDataRetention() {
    try {
      const cutoffMs = Date.now() - DATA_RETENTION_DAYS * 86400000;
      const db = loadTicketsDb();
      const before = db.tickets.length;
      db.tickets = db.tickets.filter(t => {
        const ts = Date.parse(t.createdAt || "");
        return Number.isFinite(ts) && ts > cutoffMs;
      });
      if (db.tickets.length < before) {
        saveTicketsDb(db);
        console.log(`[Retention] ${before - db.tickets.length} eski ticket silindi (${DATA_RETENTION_DAYS} gun).`);
      }
    } catch (_e) { /* silent */ }
  }
  // Run once at startup, then daily
  runDataRetention();
  setInterval(runDataRetention, 24 * 60 * 60 * 1000);

  // Start inactivity checks every 60s (Telegram + Sunshine)
  setInterval(checkTelegramInactivity, 60000);
  setInterval(checkSunshineInactivity, 60000);

  app.listen(PORT, () => {
    console.log(`${BOT_NAME} ${PORT} portunda hazir.`);
    startTelegramPolling();

    // LLM health check: ilk kontrol 10s sonra, sonra her 5dk'da bir
    setTimeout(checkLLMHealth, 10000);
    setInterval(checkLLMHealth, 5 * 60 * 1000);
  });
})();

// ── LLM Health Check ──────────────────────────────────────────────────────
function recordLLMError(error, context) {
  const now = Date.now();
  llmErrorLog.push({ timestamp: now, error: (error?.message || String(error)).slice(0, 200), status: Number(error?.status) || 0, context });
  // Eski kayitlari temizle (10dk pencere)
  while (llmErrorLog.length > 0 && llmErrorLog[0].timestamp < now - LLM_ERROR_WINDOW_MS) {
    llmErrorLog.shift();
  }
  // Maks 100 kayit tut
  if (llmErrorLog.length > 100) llmErrorLog.splice(0, llmErrorLog.length - 100);
}

function getLLMErrorSummary() {
  const now = Date.now();
  const recent = llmErrorLog.filter(e => e.timestamp > now - LLM_ERROR_WINDOW_MS);
  if (!recent.length) return { recentErrors: 0, lastError: null };
  const statusCounts = {};
  for (const e of recent) {
    const key = e.status || "unknown";
    statusCounts[key] = (statusCounts[key] || 0) + 1;
  }
  return {
    recentErrors: recent.length,
    statusCounts,
    lastError: recent[recent.length - 1].error,
    lastErrorAt: new Date(recent[recent.length - 1].timestamp).toISOString()
  };
}

async function checkLLMHealth() {
  const start = Date.now();
  const cfg = getProviderConfig();
  try {
    const result = await callLLM(
      [{ role: "user", parts: [{ text: "ping" }] }],
      "Respond with pong.",
      8
    );
    const latencyMs = Date.now() - start;
    const reply = (result?.reply || "").toLowerCase();
    // Yanit dogrulamasi — API cevap donmeli
    if (!reply) {
      throw new Error("API yanit donmedi (bos response)");
    }
    const errorSummary = getLLMErrorSummary();
    llmHealthStatus = {
      ok: true,
      checkedAt: new Date().toISOString(),
      error: null,
      latencyMs,
      provider: cfg.provider + " / " + cfg.model,
      recentErrors: errorSummary.recentErrors,
      lastError: errorSummary.lastError,
      lastErrorAt: errorSummary.lastErrorAt || null
    };
    // Eger son 10dk'da hatalar varsa uyari ver
    if (errorSummary.recentErrors > 0) {
      llmHealthStatus.warning = errorSummary.recentErrors + " hata (son 10dk)";
      console.log(`[LLM Health] OK (${latencyMs}ms) — UYARI: ${errorSummary.recentErrors} hata (son 10dk)`);
    } else {
      console.log(`[LLM Health] OK (${latencyMs}ms)`);
    }
  } catch (err) {
    recordLLMError(err, "health-check");
    const errorSummary = getLLMErrorSummary();
    llmHealthStatus = {
      ok: false,
      checkedAt: new Date().toISOString(),
      error: err.message || "Bilinmeyen hata",
      latencyMs: null,
      provider: cfg.provider + " / " + cfg.model,
      recentErrors: errorSummary.recentErrors,
      lastError: errorSummary.lastError,
      lastErrorAt: errorSummary.lastErrorAt || null
    };
    console.error("[LLM Health] FAIL:", err.message);
  }
}



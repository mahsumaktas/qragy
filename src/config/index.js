const path = require("path");

const parseBool = (val, defaultVal = false) => {
  if (val === undefined || val === null || val === "") return defaultVal;
  return /^(1|true|yes)$/i.test(String(val));
};

const parseCommaSeparated = (val, defaultVal = "") =>
  (val || defaultVal).split(",").map((s) => s.trim()).filter(Boolean);

const parseNumberArray = (val, defaultVal = "1,2,3,4,5,6,7") =>
  parseCommaSeparated(val, defaultVal).map(Number).filter((n) => Number.isInteger(n));

function loadConfig(env = process.env) {
  const zendeskSnippetKey = (env.ZENDESK_SNIPPET_KEY || "").trim();
  return {
    port: Number(env.PORT || 3000),
    googleApiKey: env.GOOGLE_API_KEY || env.GEMINI_API_KEY || "",
    googleModel: env.GOOGLE_MODEL || "gemini-3-pro-preview",
    googleMaxOutputTokens: Number(env.GOOGLE_MAX_OUTPUT_TOKENS || 1024),
    googleThinkingBudget: Number(env.GOOGLE_THINKING_BUDGET || 64),
    googleRequestTimeoutMs: Number(env.GOOGLE_REQUEST_TIMEOUT_MS || 15000),
    googleFallbackModel: (env.GOOGLE_FALLBACK_MODEL || "").trim(),
    zendeskSnippetKey,
    zendeskEnabled: parseBool(env.ZENDESK_ENABLED) || Boolean(zendeskSnippetKey),
    zendeskDefaultTags: parseCommaSeparated(env.ZENDESK_DEFAULT_TAGS, "qragy,ai_handoff"),
    zendeskScEnabled: parseBool(env.ZENDESK_SC_ENABLED),
    zendeskScAppId: (env.ZENDESK_SC_APP_ID || "").trim(),
    zendeskScKeyId: (env.ZENDESK_SC_KEY_ID || "").trim(),
    zendeskScKeySecret: (env.ZENDESK_SC_KEY_SECRET || "").trim(),
    zendeskScWebhookSecret: (env.ZENDESK_SC_WEBHOOK_SECRET || "").trim(),
    zendeskScSubdomain: (env.ZENDESK_SC_SUBDOMAIN || "").trim(),
    supportHoursEnabled: parseBool(env.SUPPORT_HOURS_ENABLED),
    supportTimezone: env.SUPPORT_TIMEZONE || "Europe/Istanbul",
    supportOpenHour: Number(env.SUPPORT_OPEN_HOUR || 7),
    supportCloseHour: Number(env.SUPPORT_CLOSE_HOUR || 24),
    supportOpenDays: parseNumberArray(env.SUPPORT_OPEN_DAYS, "1,2,3,4,5,6,7").filter((d) => d >= 1 && d <= 7),
    rateLimitEnabled: parseBool(env.RATE_LIMIT_ENABLED, true),
    rateLimitMax: Number(env.RATE_LIMIT_MAX || 20),
    rateLimitWindowMs: Number(env.RATE_LIMIT_WINDOW_MS || 60000),
    deterministicCollectionMode: !parseBool(env.DETERMINISTIC_COLLECTION_MODE === "false" ? "true" : "false", false),
    adminToken: (env.ADMIN_TOKEN || "").trim(),
    botName: (env.BOT_NAME || "QRAGY Bot").trim(),
    companyName: (env.COMPANY_NAME || "").trim(),
    remoteToolName: (env.REMOTE_TOOL_NAME || "").trim(),
    telegramEnabled: parseBool(env.TELEGRAM_ENABLED),
    telegramBotToken: (env.TELEGRAM_BOT_TOKEN || "").trim(),
    telegramPollingIntervalMs: Number(env.TELEGRAM_POLLING_INTERVAL_MS || 2000),
    deployWebhookSecret: (env.DEPLOY_WEBHOOK_SECRET || "").trim(),
    dataRetentionDays: Number(env.DATA_RETENTION_DAYS || 90),
    agentDir: path.join(__dirname, "..", "..", "agent"),
    topicsDir: path.join(__dirname, "..", "..", "agent", "topics"),
    memoryDir: path.join(__dirname, "..", "..", "memory"),
    dataDir: path.join(__dirname, "..", "..", "data"),
    lanceDbPath: path.join(__dirname, "..", "..", "data", "lancedb"),
    uploadsDir: path.join(__dirname, "..", "..", "data", "uploads"),
  };
}

module.exports = { loadConfig, parseBool, parseCommaSeparated, parseNumberArray };

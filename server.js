require("dotenv").config();

const fs = require("fs");
const express = require("express");
const path = require("path");
const lancedb = require("@lancedb/lancedb");
const Papa = require("papaparse");
const CSV_FILE = path.join(__dirname, "knowledge_base.csv");

const app = express();

const PORT = Number(process.env.PORT || 3000);
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY || "";
const GOOGLE_MODEL = process.env.GOOGLE_MODEL || "gemini-3-pro-preview";
const GOOGLE_MAX_OUTPUT_TOKENS = Number(process.env.GOOGLE_MAX_OUTPUT_TOKENS || 1024);
const GOOGLE_THINKING_BUDGET = Number(process.env.GOOGLE_THINKING_BUDGET || 64);
const GOOGLE_REQUEST_TIMEOUT_MS = Number(process.env.GOOGLE_REQUEST_TIMEOUT_MS || 15000);
const ZENDESK_SNIPPET_KEY = (process.env.ZENDESK_SNIPPET_KEY || "").trim();
const ZENDESK_ENABLED =
  /^(1|true|yes)$/i.test(process.env.ZENDESK_ENABLED || "") || Boolean(ZENDESK_SNIPPET_KEY);
const ZENDESK_DEFAULT_TAGS = (process.env.ZENDESK_DEFAULT_TAGS || "qragy,ai_handoff")
  .split(",")
  .map((item) => item.trim())
  .filter(Boolean);
const SUPPORT_HOURS_ENABLED = /^(1|true|yes)$/i.test(process.env.SUPPORT_HOURS_ENABLED || "");
const SUPPORT_TIMEZONE = process.env.SUPPORT_TIMEZONE || "Europe/Istanbul";
const SUPPORT_OPEN_HOUR = Number(process.env.SUPPORT_OPEN_HOUR || 7);
const SUPPORT_CLOSE_HOUR = Number(process.env.SUPPORT_CLOSE_HOUR || 24);
const SUPPORT_OPEN_DAYS = (process.env.SUPPORT_OPEN_DAYS || "1,2,3,4,5,6,7")
  .split(",")
  .map((item) => Number(item.trim()))
  .filter((day) => Number.isInteger(day) && day >= 1 && day <= 7);
const DETERMINISTIC_COLLECTION_MODE =
  !/^(0|false|no)$/i.test(process.env.DETERMINISTIC_COLLECTION_MODE || "true");
const ADMIN_TOKEN = (process.env.ADMIN_TOKEN || "").trim();
const BOT_NAME = (process.env.BOT_NAME || "QRAGY Bot").trim();
const COMPANY_NAME = (process.env.COMPANY_NAME || "").trim();
const REMOTE_TOOL_NAME = (process.env.REMOTE_TOOL_NAME || "").trim();

const AGENT_DIR = path.join(__dirname, "agent");
const TOPICS_DIR = path.join(AGENT_DIR, "topics");
const MEMORY_DIR = path.join(__dirname, "memory");
const DATA_DIR = path.join(__dirname, "data");
const LANCE_DB_PATH = path.join(DATA_DIR, "lancedb");
const TICKETS_DB_FILE = path.join(DATA_DIR, "tickets.json");

let knowledgeTable = null;

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

function ensureTicketsDbFile() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

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
    lastHandoffAt: ticket.lastHandoffAt || ""
  };
}

function requireAdminAccess(req, res, next) {
  if (!ADMIN_TOKEN) {
    return next();
  }

  const headerToken = String(req.headers["x-admin-token"] || "").trim();
  const queryToken = String(req.query.token || "").trim();
  const candidate = headerToken || queryToken;
  if (!candidate || candidate !== ADMIN_TOKEN) {
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

function buildGenerationConfig(maxOutputTokens) {
  const config = {
    temperature: 0.2,
    maxOutputTokens
  };

  if (GOOGLE_THINKING_BUDGET > 0) {
    config.thinkingConfig = { thinkingBudget: GOOGLE_THINKING_BUDGET };
  }

  return config;
}

async function callGemini(contents, systemPrompt, maxOutputTokens) {
  const endpoint =
    "https://generativelanguage.googleapis.com/v1beta/models/" +
    encodeURIComponent(GOOGLE_MODEL) +
    ":generateContent?key=" +
    encodeURIComponent(GOOGLE_API_KEY);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), GOOGLE_REQUEST_TIMEOUT_MS);
  let geminiResponse;

  try {
    geminiResponse = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: systemPrompt }]
        },
        contents,
        generationConfig: buildGenerationConfig(maxOutputTokens)
      })
    });
  } catch (error) {
    if (error?.name === "AbortError") {
      const timeoutError = new Error("Gemini istegi zaman asimina ugradi.");
      timeoutError.status = 504;
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }

  const payload = await geminiResponse.json().catch(() => ({}));

  if (!geminiResponse.ok) {
    const error = new Error(payload?.error?.message || "Gemini API hatasi.");
    error.status = geminiResponse.status;
    throw error;
  }

  const reply = (payload?.candidates?.[0]?.content?.parts || [])
    .map((part) => (typeof part?.text === "string" ? part.text : ""))
    .join("\n")
    .trim();

  return {
    reply,
    finishReason: payload?.candidates?.[0]?.finishReason || "",
    payload
  };
}

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

async function embedText(text) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${encodeURIComponent(GOOGLE_API_KEY)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content: { parts: [{ text }] } })
  });
  if (!res.ok) throw new Error(`Embedding hatasi: ${res.status}`);
  const data = await res.json();
  return data.embedding.values;
}

async function searchKnowledge(query, topK = 3) {
  if (!knowledgeTable) return [];
  try {
    const queryVector = await embedText(query);
    const results = await knowledgeTable
      .vectorSearch(queryVector)
      .limit(topK)
      .toArray();
    return results
      .filter((r) => r._distance < 1.0)
      .map((r) => ({ question: r.question, answer: r.answer, distance: r._distance }));
  } catch (err) {
    console.warn("Bilgi tabani arama hatasi:", err.message);
    return [];
  }
}

async function generateEscalationSummary(contents, memory, conversationContext) {
  const fallback = memory.issueSummary
    || conversationContext?.currentTopic
    || "Canlı destek talebi";

  if (!GOOGLE_API_KEY) return fallback;

  const summaryPrompt = [
    "Aşağıdaki konuşma geçmişini analiz et ve canlı destek temsilcisi için kısa bir sorun özeti yaz.",
    "Kurallar:",
    "- Türkçe yaz, düz metin, 1-2 cümle.",
    "- Kullanıcının sorununu, ilettiği bilgileri (şube kodu, firma, hata mesajı vb.) ve yapılan adımları özetle.",
    "- Sadece özeti yaz, başka bir şey yazma."
  ].join("\n");

  try {
    const result = await callGemini(contents, summaryPrompt, 512);
    const summary = (result.reply || "").trim();
    return summary || fallback;
  } catch (_err) {
    return fallback;
  }
}

ensureTicketsDbFile();

app.use((_req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, X-Admin-Token");
  if (_req.method === "OPTIONS") return res.sendStatus(204);
  return next();
});
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
    ok: true,
    model: GOOGLE_MODEL,
    hasApiKey: Boolean(GOOGLE_API_KEY),
    maxOutputTokens: GOOGLE_MAX_OUTPUT_TOKENS,
    requestTimeoutMs: GOOGLE_REQUEST_TIMEOUT_MS,
    thinkingBudget: GOOGLE_THINKING_BUDGET,
    deterministicCollectionMode: DETERMINISTIC_COLLECTION_MODE,
    agentFilesLoaded: Boolean(PERSONA_TEXT && RESPONSE_POLICY_TEXT && SOUL_TEXT && DOMAIN_TEXT && SKILLS_TEXT),
    topicsLoaded: TOPIC_INDEX.topics.length,
    memoryTemplateLoaded: Boolean(MEMORY_TEMPLATE?.confirmationTemplate),
    zendeskEnabled: ZENDESK_ENABLED,
    zendeskSnippetConfigured: Boolean(ZENDESK_SNIPPET_KEY),
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
    }
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

  return res.json({
    ok: true,
    ticket: sanitizeTicketForList(result.ticket)
  });
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
  return res.json({ ok: true, rating });
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
  const includeEvents = /^(1|true|yes)$/i.test(String(req.query.includeEvents || ""));

  const db = loadTicketsDb();
  let tickets = [...db.tickets];
  tickets.sort((a, b) => Date.parse(b.createdAt || "") - Date.parse(a.createdAt || ""));

  if (statusFilter) {
    tickets = tickets.filter((ticket) => ticket.status === statusFilter);
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
      chatHistory: Array.isArray(ticket.chatHistory) ? ticket.chatHistory : []
    }
  });
});

app.post("/api/chat", async (req, res) => {
  try {
    const rawMessages = Array.isArray(req.body?.messages) ? req.body.messages : [];

    if (!rawMessages.length) {
      return res.status(400).json({ error: "messages alani bos olamaz." });
    }

    const supportAvailability = getSupportAvailability();
    const { activeMessages, hasClosedTicketHistory, lastClosedTicketMemory } =
      splitActiveTicketMessages(rawMessages);
    const activeUserMessages = getUserMessages(activeMessages);
    const memory = extractTicketMemory(activeMessages);
    const latestUserMessage = activeUserMessages[activeUserMessages.length - 1] || "";

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

    const contents = activeMessages
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
      const handoffReady = Boolean(supportAvailability.isOpen);

      // Queue position: aktif bekleyen ticket sayisi
      const ticketsDb = loadTicketsDb();
      const activeCount = ticketsDb.tickets.filter(
        (t) => ACTIVE_TICKET_STATUSES.has(t.status) && t.id !== ticket.id
      ).length;

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
      const handoffReady = Boolean(supportAvailability.isOpen);
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
        // Quick replies: eksik alanlara gore
        const quickReplies = [];
        if (!memory.branchCode && !memory.issueSummary) {
          // Baslangic durumu - hizli erisim butonlari
        } else if (!memory.branchCode) {
          // Sube kodu eksik
        } else if (!memory.issueSummary) {
          // Sorun ozeti eksik
        }

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

    if (!GOOGLE_API_KEY) {
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
        const classifyResult = await callGemini(contents, classifyPrompt, 64);
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

    // RAG: Bilgi tabanindan ilgili Q&A ciftlerini bul
    const knowledgeResults = await searchKnowledge(latestUserMessage);
    const systemPrompt = buildSystemPrompt(memory, conversationContext, knowledgeResults);
    let geminiResult = await callGemini(contents, systemPrompt, GOOGLE_MAX_OUTPUT_TOKENS);

    if (geminiResult.finishReason === "MAX_TOKENS" && geminiResult.reply.length < 160) {
      geminiResult = await callGemini(contents, systemPrompt, GOOGLE_MAX_OUTPUT_TOKENS * 2);
    }

    reply = sanitizeAssistantReply(geminiResult.reply);

    if (!conversationContext.currentTopic && !hasRequiredFields(memory) && CONFIRMATION_PREFIX_REGEX.test(reply)) {
      reply = buildMissingFieldsReply(memory, latestUserMessage);
    }

    if (!reply) {
      reply = buildMissingFieldsReply(memory, latestUserMessage);
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
      ticketStatus = ticketResult.ticket.status;
      ticketCreated = ticketResult.created;
      // Guncel ozeti memory'ye de yansit
      memory.issueSummary = aiSummary;
    }

    const handoffReady = isEscalationReply && Boolean(supportAvailability.isOpen);

    return res.json({
      reply,
      model: GOOGLE_MODEL,
      source: conversationContext.currentTopic ? "topic-guided" : "gemini",
      memory,
      conversationContext,
      hasClosedTicketHistory,
      ticketId,
      ticketStatus,
      ticketCreated,
      handoffReady,
      handoffReason: isEscalationReply ? (topicMeta?.id || "ai-escalation") : "",
      handoffMessage: !supportAvailability.isOpen && isEscalationReply ? getOutsideSupportHoursMessage() : "",
      support: supportAvailability
    });
  } catch (error) {
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
    const SENSITIVE_KEYS = ["GOOGLE_API_KEY", "ADMIN_TOKEN", "ZENDESK_SNIPPET_KEY"];
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
    return res.json({ ok: true, message: "Env guncellendi. Bazi degisiklikler restart gerektirebilir." });
  } catch (err) {
    return res.status(500).json({ error: err.message });
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
      model: GOOGLE_MODEL
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// Agent: Reload config
app.post("/api/admin/agent/reload", requireAdminAccess, (_req, res) => {
  try {
    loadAllAgentConfig();
    return res.json({ ok: true, message: "Agent config yeniden yuklendi." });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.get("/admin", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "admin.html"));
});

app.get("*", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

(async () => {
  await initKnowledgeBase();
  app.listen(PORT, () => {
    console.log(`${BOT_NAME} ${PORT} portunda hazir.`);
  });
})();



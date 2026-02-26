"use strict";

const { normalizeForMatching, sanitizeReply } = require("../utils/sanitizer.js");
const { isLikelyBranchCode } = require("../utils/validators.js");

// ── Constants ────────────────────────────────────────────────────────────

const FAREWELL_WORDS = new Set([
  "hosca kal", "hoscakal", "gorusuruz", "gorusmek uzere",
  "iyi gunler", "iyi aksamlar", "iyi geceler", "iyi calismalar",
  "bye", "goodbye", "kendine iyi bak",
  "hoscakalin", "hosca kalin", "bay bay", "bb",
  "hayirli gunler", "hayirli isler", "hayirli aksamlar",
  "sagolun", "sag olun", "sagolasin", "sagolasiniz", "eyvallah", "eyv",
  "tesekkurler", "tesekkur ederim", "tesekkur ediyorum", "tsk", "tskler",
  "sagol", "cok tesekkurler", "cok sagol",
  "cok tesekkur ederim", "tamam tesekkurler", "anladim tesekkurler",
  "tamamdir sagol", "tamamdir tesekkurler", "oldu tesekkurler",
  "kolay gelsin", "hadi gorusuruz", "allaha ismarladik"
]);

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

const CONFIRMATION_PREFIX_REGEX = /^Talebinizi ald[ıi]m\.\s*Kullan[ıi]c[ıi] ad[ıi]:/i;
const ESCALATION_MESSAGE_REGEX = /sizi canl[ıi] destek temsilci(?:mize|sine) aktar[ıi]yorum/i;
const POST_ESCALATION_FOLLOWUP_MESSAGE =
  "Talebiniz canlı destek ekibine iletildi. En kısa sürede bir temsilci size yardımcı olacaktır. Lütfen bekleyiniz.";

const FIELD_CLARIFICATION_REGEX = /(?:kullanici\s*ad(?:i|ı)?|sube\s*kod(?:u)?|firma\s*adi|ad\s*soyad|telefon|branch\s*code)/i;
const QUESTION_INTENT_REGEX =
  /(?:nerede|nerde|nasil|nasil|gerekli|lazim|zorunlu|hangi|ne|yaziyor|yazilir|nereden)/i;
const STATUS_FOLLOWUP_REGEX =
  /(?:bekliyorum|beklemedeyim|durum|ne zaman|donus|donus yapacak|hadi|hala|halen|acil|sirada)/i;
const ISSUE_HINT_REGEX =
  /(?:hata|kesemiyor|baglan|odeme|yazici|program|acilm|donuyor|yanlis|iptal|koltuk|pnr|sefer|bilet)/i;
const NEW_TICKET_INTENT_REGEX = /(?:yeni\s*talep|yeniden\s*talep|baska\s*talep|tekrar\s*talep)/i;
const BRANCH_LOCATION_QUESTION_REGEX =
  /(?:(?:kullanici\s*ad|sube\s*kodu?).*(?:nerede|nerden|nereden|ne)|nerede.*(?:kullanici\s*ad|sube\s*kodu?))/i;
const FIELD_REQUIREMENT_QUESTION_REGEX =
  /(?:firma\s*adi|ad\s*soyad|telefon).*(?:gerekli|zorunlu|lazim|sart)|(?:gerekli|zorunlu|lazim|sart).*(?:firma\s*adi|ad\s*soyad|telefon)/i;

const DEFAULT_MEMORY_TEMPLATE = {
  requiredFields: ["branchCode", "issueSummary"],
  optionalFields: ["fullName", "phone"],
  confirmationTemplate:
    "Talebinizi aldım. Kullanıcı adı: {{branchCode}}. Sorun özeti: {{issueSummary}}. Destek ekibi en kısa sürede dönüş yapacaktır."
};

const CLOSED_TICKET_STATUS_MESSAGE =
  "Talebiniz daha önce alındı ve destek ekibine iletildi. Dönüş bekleniyor. Yeni bir talep açmak isterseniz kullanıcı adınızı ve sorun özetini yazabilirsiniz.";
const OUTSIDE_SUPPORT_HOURS_MESSAGE =
  "Canlı destek şu an mesai dışındadır. Talebiniz kayda alındı; mesai saatlerinde temsilciye aktarılacaktır.";

// ── Message Classification ───────────────────────────────────────────────

/**
 * @param {string} text
 * @param {object} opts
 * @param {object} opts.chatFlowConfig
 */
function isGibberishMessage(text, opts = {}) {
  const { chatFlowConfig = {} } = opts;
  if (chatFlowConfig.gibberishDetectionEnabled === false) return false;
  const trimmed = (text || "").trim();
  if (!trimmed) return false;
  // Single character
  if (trimmed.length === 1) return true;
  // Only emojis/symbols (no letters or digits)
  const stripped = trimmed.replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}\s\p{P}\p{S}]/gu, "");
  if (!stripped) return true;
  // Repeated single char: "aaaaaaa", "xxxxxxx"
  if (/^(.)\1{4,}$/i.test(trimmed)) return true;
  // Random consonant strings (no vowels in 6+ chars) — but exempt branch codes, phone numbers, order numbers
  if (trimmed.length >= 6 && !/[aeıioöuüAEIİOÖUÜ]/i.test(trimmed) && !/\d/.test(trimmed)) return true;
  // Very short random text (2-3 chars, not a known word)
  if (trimmed.length <= 2 && !/^(ok|no|da|de|bi|bu|şu|ne|ve|ya|ki|ha|he|hi)$/i.test(trimmed)) return true;
  return false;
}

/**
 * @param {string} text
 * @param {number} turnCount
 * @param {object} opts
 * @param {object} opts.chatFlowConfig
 */
function isFarewellMessage(text, turnCount, opts = {}) {
  const { chatFlowConfig = {} } = opts;
  if (chatFlowConfig.closingFlowEnabled === false) return false;
  // Konusmanin basinda (ilk 2 tur) tesekkur/sagol farewell degil, kibarliktir
  if (turnCount !== undefined && turnCount < 3) return false;
  const normalized = normalizeForMatching(text);
  if (!normalized) return false;
  // Uzun mesajlar farewell degildir — ek icerik var demektir
  if (normalized.split(/\s+/).length > 8) return false;
  if (FAREWELL_WORDS.has(normalized)) return true;
  for (const word of FAREWELL_WORDS) {
    if (normalized.includes(word)) return true;
  }
  return false;
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

function getLastAssistantMessage(messages) {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i]?.role === "assistant" && typeof messages[i]?.content === "string") {
      return messages[i];
    }
  }
  return null;
}

function isAssistantEscalationMessage(message) {
  return Boolean(
    message &&
      message.role === "assistant" &&
      typeof message.content === "string" &&
      ESCALATION_MESSAGE_REGEX.test(normalizeForMatching(message.content))
  );
}

function isAssistantConfirmationMessage(message) {
  return Boolean(
    message &&
      message.role === "assistant" &&
      typeof message.content === "string" &&
      CONFIRMATION_PREFIX_REGEX.test(message.content.trim())
  );
}

/**
 * @param {object} opts
 * @param {object} opts.memoryTemplate
 */
function getStatusFollowupMessage(opts = {}) {
  const { memoryTemplate } = opts;
  const template = memoryTemplate?.statusFollowupTemplate;
  if (typeof template === "string" && template.trim()) {
    return template.trim();
  }
  return CLOSED_TICKET_STATUS_MESSAGE;
}

/**
 * @param {object} opts
 * @param {object} opts.memoryTemplate
 */
function getOutsideSupportHoursMessage(opts = {}) {
  const { memoryTemplate } = opts;
  const template = memoryTemplate?.outsideSupportHoursTemplate;
  if (typeof template === "string" && template.trim()) {
    return template.trim();
  }
  return OUTSIDE_SUPPORT_HOURS_MESSAGE;
}

// ── Branch Code & Memory Extraction ──────────────────────────────────────

function extractBranchCodeFromText(text) {
  if (typeof text !== "string" || !text.trim()) {
    return "";
  }

  const patterns = [
    /(?:kullan[ıi]c[ıi])\s*(?:ad[ıi])?\s*[:=-]\s*([A-Za-z0-9_.@-]{2,40})/i,
    /(?:kullan[ıi]c[ıi])\s*(?:ad[ıi])?\s+([A-Za-z0-9_.@-]{2,40})/i,
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

    // Explicit "sube kodu" baglami varsa pure numeric de kabul et (2-10 hane)
    if (candidate && /^\d{2,10}$/.test(candidate)) {
      return candidate;
    }
  }

  // Standalone text — kullanıcı adı olarak kabul et (2-40 karakter, tek kelime veya kısa metin)
  const standaloneMatch = text.match(/^\s*([A-Za-z0-9_.@-]{2,40})\s*$/);
  const standaloneCandidate = standaloneMatch?.[1] || "";

  // Selamlama veya genel mesajları kullanıcı adı olarak kabul etme
  if (standaloneCandidate && (isNonIssueMessage(standaloneCandidate) || isGreetingOnlyMessage(standaloneCandidate))) {
    // "Merhaba", "Selam", "Tamam" vb. kullanıcı adı değil
  } else {
    if (isLikelyBranchCode(standaloneCandidate.toUpperCase())) {
      return standaloneCandidate;
    }

    // Standalone pure numeric (2-6 hane) — kullanıcı kodu olarak kabul et
    if (standaloneCandidate && /^\d{2,6}$/.test(standaloneCandidate)) {
      return standaloneCandidate;
    }

    // Standalone kısa alfanumerik — kullanıcı adı olarak kabul et
    if (standaloneCandidate && standaloneCandidate.length >= 3 && /[A-Za-z]/.test(standaloneCandidate)) {
      return standaloneCandidate;
    }
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

function sanitizeIssueSummary(text, branchCode = "") {
  let cleaned = text
    .replace(/(?:kullan[ıi]c[ıi])\s*(?:ad[ıi])?\s*[:=-]?\s*[A-Za-z0-9_.@-]{2,40}/gi, "")
    .replace(/(?:sube|[\u015f\u015e]ube)\s*(?:kodu|kod)?\s*[:=-]?\s*[A-Za-z0-9-]{2,20}/gi, "")
    .replace(/(?:ad\s*soyad|telefon|firma(?:\s*adi)?)\s*[:=-]?\s*[^,.;\n]+/gi, "")
    .replace(
      /^((merhaba|selam|iyi\s*g(?:u|\u00fc)nler|iyi\s*ak(?:s|\u015f)amlar|iyi\s*cali(?:s|\u015f)malar)[,.\s-]*)+/i,
      ""
    )
    .replace(/^yeni\s*talep\s*[:-]?\s*/i, "")
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

function getUserMessages(messages) {
  return messages
    .filter((item) => item?.role === "user" && typeof item?.content === "string")
    .map((item) => item.content.trim())
    .filter(Boolean);
}

function parseClosedTicketFromAssistantMessage(message) {
  if (!isAssistantConfirmationMessage(message)) {
    return null;
  }

  const text = String(message.content || "");
  const branchCode = text.match(/Kullan[ıi]c[ıi] ad[ıi]:\s*([^.\n]+)\./i)?.[1]?.trim() ||
    text.match(/Sube kodu:\s*([^.\n]+)\./i)?.[1]?.trim() || "";
  const issueSummary =
    text.match(/Sorun [öo]zeti:\s*([\s\S]+?)\.\s*Destek ekibi/i)?.[1]?.trim() ||
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

/**
 * @param {object} memory
 * @param {object} opts
 * @param {object} opts.memoryTemplate
 */
function buildConfirmationMessage(memory, opts = {}) {
  const { memoryTemplate } = opts;
  const template =
    typeof memoryTemplate?.confirmationTemplate === "string" &&
    memoryTemplate.confirmationTemplate.trim()
      ? memoryTemplate.confirmationTemplate
      : DEFAULT_MEMORY_TEMPLATE.confirmationTemplate;

  return template
    .replace("{{branchCode}}", memory.branchCode)
    .replace("{{issueSummary}}", memory.issueSummary);
}

// ── Reply Building ───────────────────────────────────────────────────────

function sanitizeAssistantReply(text) {
  return sanitizeReply(text);
}

/**
 * @param {object} memory
 * @param {string} latestUserMessage
 * @param {object} opts
 * @param {string} opts.companyName
 * @param {string} opts.botName
 */
function buildMissingFieldsReply(memory, latestUserMessage = "", opts = {}) {
  const { companyName = "" } = opts;

  const fieldRequirementMessage =
    "Talep açmak için kullanıcı adı ve sorun özeti zorunludur. Ad soyad ve telefon bilgileri isteğe bağlıdır.";
  const branchLocationMessage =
    "Kullanıcı adı, OBUS sistemine giriş yaparken kullandığınız kimlik bilgisidir. Emin değilseniz firma yöneticinizden teyit edip iletebilirsiniz.";

  const normalizedLatest = normalizeForMatching(latestUserMessage);

  if (FIELD_REQUIREMENT_QUESTION_REGEX.test(normalizedLatest)) {
    return fieldRequirementMessage;
  }

  if (BRANCH_LOCATION_QUESTION_REGEX.test(normalizedLatest)) {
    return branchLocationMessage;
  }

  // Bilgi toplama LLM'e bırakılır — konu dosyasında gerektiğinde LLM sorar
  return null;
}

/**
 * @param {object} memory
 * @param {string[]} activeUserMessages
 * @param {boolean} hasClosedTicketHistory
 * @param {object} opts
 * @param {boolean} opts.deterministicMode
 * @param {string} opts.companyName
 * @param {string} opts.botName
 */
function buildDeterministicCollectionReply(memory, activeUserMessages, hasClosedTicketHistory, opts = {}) {
  const { deterministicMode = true, companyName = "", botName = "" } = opts;

  if (!deterministicMode) {
    return null;
  }

  const replyOpts = { companyName, botName };

  const welcomeMessage =
    `Merhaba, ben OBUS Teknik Destek Asistanı. Size nasıl yardımcı olabilirim?`;
  const fieldRequirementMessage =
    "Talep açmak için kullanıcı adı ve sorun özeti zorunludur. Ad soyad ve telefon bilgileri isteğe bağlıdır.";
  const branchLocationMessage =
    "Kullanıcı adı, OBUS sistemine giriş yaparken kullandığınız kimlik bilgisidir. Emin değilseniz firma yöneticinizden teyit edip iletebilirsiniz.";

  const latestUserMessage = activeUserMessages[activeUserMessages.length - 1] || "";
  const normalizedLatest = normalizeForMatching(latestUserMessage);

  if (!latestUserMessage) {
    return welcomeMessage;
  }

  // Selamlama mesajı geldiğinde sadece karşılama yap — ama sadece ilk turda
  if (activeUserMessages.length <= 1 && (isGreetingOnlyMessage(latestUserMessage) || NEW_TICKET_INTENT_REGEX.test(normalizedLatest))) {
    return welcomeMessage;
  }

  if (isFieldClarificationMessage(latestUserMessage)) {
    if (FIELD_REQUIREMENT_QUESTION_REGEX.test(normalizedLatest)) {
      return fieldRequirementMessage;
    }

    if (BRANCH_LOCATION_QUESTION_REGEX.test(normalizedLatest)) {
      return branchLocationMessage;
    }

    return buildMissingFieldsReply(memory, latestUserMessage, replyOpts);
  }

  if (!memory.branchCode || !memory.issueSummary) {
    if (
      hasClosedTicketHistory &&
      !memory.branchCode &&
      !memory.issueSummary &&
      isNonIssueMessage(latestUserMessage)
    ) {
      return welcomeMessage;
    }

    // Konu belirlenmeden bilgi toplama — LLM'e bırak (null dön)
    return null;
  }

  return null;
}

// ── Conversation Context Building ────────────────────────────────────────

/**
 * @param {object} memory
 * @param {string[]} userMessages
 * @param {object} opts
 * @param {object} opts.topicIndex  - { topics: [...] }
 * @param {string} opts.remoteToolName
 * @param {Function} opts.classifyTopicWithLLM - async (text) => topicId | null
 */
async function buildConversationContext(memory, userMessages, opts = {}) {
  const { topicIndex = { topics: [] }, remoteToolName = "", classifyTopicWithLLM } = opts;

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

  const escalation = _detectEscalationTriggersLocal(latestMessage, remoteToolName);
  if (escalation.shouldEscalate) {
    context.escalationTriggered = true;
    context.escalationReason = escalation.reason;
    context.conversationState = "escalation_handoff";
    return context;
  }

  const topicResult = _detectTopicFromMessages(userMessages, topicIndex);
  context._topicDetection = { method: topicResult.method, keyword: topicResult.matchedKeyword || null };
  if (topicResult.topicId) {
    context.currentTopic = topicResult.topicId;
    context.topicConfidence = topicResult.confidence;
    context.conversationState = "topic_guided_support";
  } else if (userMessages.length <= 1 && isGreetingOnlyMessage(latestMessage)) {
    // Sadece ilk turda greeting algıla — devam eden konuşmada "tamam", "ok" gibi mesajlar greeting değil
    context.conversationState = "welcome_or_greet";
  } else {
    // Keyword eslesmedi — LLM-based classification dene (tum mesajlari gonder, baglam icin)
    const llmTopicId = typeof classifyTopicWithLLM === "function"
      ? await classifyTopicWithLLM(userMessages)
      : null;
    if (llmTopicId) {
      context.currentTopic = llmTopicId;
      context.topicConfidence = 0.7;
      context.conversationState = "topic_guided_support";
      context._topicDetection.method = "llm";
    } else {
      context.conversationState = "topic_detection";
      context._topicDetection.method = "none";
    }
  }

  // Not: Erken escalation kaldirildi. Ilk turda her zaman KB bilgisi paylasarak yardimci ol.
  // Failure indicator (olmuyor, yapamiyorum vb.) varsa bile once troubleshooting/KB bilgisi ver,
  // sonraki turlarda escalation gerektiriyorsa yonlendir.

  if (memory.branchCode) {
    context.collectedInfo.branchCode = memory.branchCode;
  }
  if (memory.companyName) {
    context.collectedInfo.companyName = memory.companyName;
  }

  return context;
}

// ── Internal helpers (not exported) ──────────────────────────────────────

/**
 * Inline topic detection from user messages using keyword matching.
 * Mirrors the original detectTopicFromMessages in server.js.
 */
function _detectTopicFromMessages(userMessages, topicIndex) {
  if (!topicIndex.topics.length || !userMessages.length) {
    return { topicId: null, confidence: 0, method: "none" };
  }

  // Tum mesajlara bak (topic ilk mesajlarda belirtilir, sonraki turlarda kaybolmamali)
  const allText = userMessages.join(" ");
  const normalized = normalizeForMatching(allText);

  let bestMatch = null;
  let bestScore = 0;
  let matchedKeyword = null;

  for (const topic of topicIndex.topics) {
    for (const keyword of topic.keywords) {
      const normalizedKeyword = normalizeForMatching(keyword);
      if (normalized.includes(normalizedKeyword)) {
        const score = normalizedKeyword.length;
        if (score > bestScore) {
          bestScore = score;
          bestMatch = topic.id;
          matchedKeyword = keyword;
        }
      }
    }
  }

  if (bestMatch) {
    return { topicId: bestMatch, confidence: 0.9, method: "keyword", matchedKeyword };
  }

  return { topicId: null, confidence: 0, method: "none", matchedKeyword: null };
}

/**
 * Kullanicinin mesajinda GUCLU basarisizlik ifadesi olup olmadigini tespit et.
 * Guclu = kullanici denedigini ve basaramadigini acikca bildiriyor.
 * Zayif belirtiler (hata veriyor, acilmiyor) buraya dahil DEGIL — bunlar sadece sorunu tanimlar.
 */
function _hasFailureIndicator(text) {
  const normalized = normalizeForMatching(text);
  const strongIndicators = [
    "yapamiyorum", "yapamadim", "yapamiyor",
    "olmuyor", "olmadi", "olmuyo",
    "calismadi", "calismiyor",
    "tekrar deneyiniz", "sonra tekrar",
    "basarisiz", "basarili olamadi",
    "cozemiyorum", "cozemedim",
    "beceremedim", "beceremiyorum",
  ];
  return strongIndicators.some(ind => normalized.includes(ind));
}

/**
 * Inline escalation trigger detection (tool credential based).
 * Mirrors the original detectEscalationTriggers in server.js.
 */
function _detectEscalationTriggersLocal(text, remoteToolName) {
  const normalized = normalizeForMatching(text);

  // Direkt temsilci/canli destek istegi
  // Not: "canli destek" tek basina cok genis — saat/bilgi sorularini da yakaliyor.
  // "canli destek" icin bilgi sorusu mu yoksa talep mi ayirimi yap.
  const DIRECT_AGENT_PATTERNS = [
    "canli destek istiyorum", "canli destege bagla",
    "temsilci istiyorum", "temsilci ile gorusmek", "temsilciye bagla",
    "gercek kisi", "gercek birisi",
    "insan ile", "insanla konusmak",
    "yetkili ile", "yetkiliyle",
    "operatore bagla",
    "mudur ile gorusmek",
  ];
  if (DIRECT_AGENT_PATTERNS.some(p => normalized.includes(normalizeForMatching(p)))) {
    return { shouldEscalate: true, reason: "direct_agent_request" };
  }
  // "canli destek" genel pattern: sadece bilgi sorusu degilse escalation yap
  const INFO_QUESTION_WORDS = ["saat", "ne zaman", "kacta", "saatleri", "acilis", "kapanis", "mesai", "calisma"];
  if (normalized.includes("canli destek") && !INFO_QUESTION_WORDS.some(w => normalized.includes(w))) {
    return { shouldEscalate: true, reason: "direct_agent_request" };
  }

  // Alpemix ID + Parola algılama (hardcode — OBUS'un uzak bağlantı aracı)
  const alpemixPattern = /alpemix/i;
  const hasAlpemix = alpemixPattern.test(text);
  if (hasAlpemix) {
    const idPattern = /alpemix\s*(?:id|no|numara)?\s*[:=-]?\s*\d+/i;
    const passPattern = /(?:parola|sifre|şifre|password|pass)\s*[:=-]?\s*\S+/i;
    const hasToolId = idPattern.test(text);
    const hasToolPass = passPattern.test(text);

    if (hasToolId && hasToolPass) {
      return { shouldEscalate: true, reason: "alpemix_credentials" };
    }

    // İki ayrı sayı grubu + alpemix kelimesi = muhtemelen ID ve parola
    const bothInOneLine = /\d{3,}[\s,;.-]+\d{3,}/.test(text);
    if (bothInOneLine) {
      return { shouldEscalate: true, reason: "alpemix_credentials" };
    }
  }

  // Ek remote tool pattern (varsa)
  const toolName = remoteToolName || "remote_tool";
  if (remoteToolName) {
    const toolPattern = new RegExp(remoteToolName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    const idPattern = new RegExp(`(?:${toolPattern.source}\\s*(?:id|no|numara)?\\s*[:=-]?\\s*\\d+)`, "i");
    const passPattern = /(?:(?:parola|sifre|şifre)\s*[:=-]?\s*\d+)/i;
    if (idPattern.test(text) && passPattern.test(text)) {
      return { shouldEscalate: true, reason: `${toolName}_credentials` };
    }
  }

  return { shouldEscalate: false, reason: null };
}

// ── Exports ──────────────────────────────────────────────────────────────

module.exports = {
  // Constants
  FAREWELL_WORDS,
  NON_ISSUE_MESSAGE_SET,
  CONFIRMATION_PREFIX_REGEX,
  ESCALATION_MESSAGE_REGEX,
  POST_ESCALATION_FOLLOWUP_MESSAGE,
  FIELD_CLARIFICATION_REGEX,
  QUESTION_INTENT_REGEX,
  STATUS_FOLLOWUP_REGEX,
  ISSUE_HINT_REGEX,
  NEW_TICKET_INTENT_REGEX,
  BRANCH_LOCATION_QUESTION_REGEX,
  FIELD_REQUIREMENT_QUESTION_REGEX,
  DEFAULT_MEMORY_TEMPLATE,
  CLOSED_TICKET_STATUS_MESSAGE,
  OUTSIDE_SUPPORT_HOURS_MESSAGE,

  // Message classification
  isGibberishMessage,
  isFarewellMessage,
  isNonIssueMessage,
  isStatusFollowupMessage,
  isFieldClarificationMessage,
  isGreetingOnlyMessage,
  getLastAssistantMessage,
  isAssistantEscalationMessage,
  isAssistantConfirmationMessage,
  getStatusFollowupMessage,
  getOutsideSupportHoursMessage,

  // Branch code & memory extraction
  extractBranchCodeFromText,
  sanitizeIssueSummary,
  extractTicketMemory,
  hasRequiredFields,
  buildConfirmationMessage,
  splitActiveTicketMessages,
  getUserMessages,
  parseClosedTicketFromAssistantMessage,

  // Reply building
  buildMissingFieldsReply,
  buildDeterministicCollectionReply,
  sanitizeAssistantReply,

  // Conversation context
  buildConversationContext,
};

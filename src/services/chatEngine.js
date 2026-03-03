"use strict";

const { normalizeForMatching, sanitizeReply } = require("../utils/sanitizer.js");
const { isLikelyBranchCode } = require("../utils/validators.js");

// ── Constants ────────────────────────────────────────────────────────────

const FAREWELL_WORDS = new Set([
  "bye", "goodbye", "see you", "see ya", "take care",
  "have a good day", "have a nice day", "have a great day",
  "good night", "good evening", "good bye",
  "thanks bye", "thank you bye", "thanks goodbye",
  "cheers", "later", "talk later", "ttyl",
  "thanks", "thank you", "thx", "ty",
  "thank you so much", "thanks a lot", "many thanks",
  "ok thanks", "got it thanks", "understood thanks",
  "ok thank you", "alright thanks", "done thanks",
  "appreciate it", "much appreciated"
]);

const NON_ISSUE_MESSAGE_SET = new Set([
  "thanks",
  "thank you",
  "thx",
  "ty",
  "ok",
  "okay",
  "alright",
  "got it",
  "understood",
  "sure",
  "you're welcome",
  "hello",
  "hi",
  "hey",
  "good morning",
  "good evening",
  "good afternoon"
]);

const CONFIRMATION_PREFIX_REGEX = /^I['']ve noted your request\.\s*Account ID:/i;
const ESCALATION_MESSAGE_REGEX = /connecting you with a live support agent/i;
const POST_ESCALATION_FOLLOWUP_MESSAGE =
  "Your request has been forwarded to the live support team. An agent will assist you shortly. Please hold on.";

const FIELD_CLARIFICATION_REGEX = /(?:account\s*id|user\s*(?:name|id)|email|branch\s*code|organization)/i;
const QUESTION_INTENT_REGEX =
  /(?:where|how|what|which|required|needed|mandatory|find|locate)/i;
const STATUS_FOLLOWUP_REGEX =
  /(?:waiting|status|update|when|how long|still|urgent|any news|follow.?up|progress)/i;
const ISSUE_HINT_REGEX =
  /(?:error|can't|cannot|broken|fail|crash|bug|issue|problem|not working|slow|stuck|freeze|wrong|printer|report|billing|login)/i;
const NEW_TICKET_INTENT_REGEX = /(?:new\s*(?:request|ticket|issue)|another\s*(?:request|issue)|start\s*over)/i;
const BRANCH_LOCATION_QUESTION_REGEX =
  /(?:(?:account\s*id|user\s*(?:name|id)).*(?:where|find|what)|(?:where|find).*(?:account\s*id|user\s*(?:name|id)))/i;
const FIELD_REQUIREMENT_QUESTION_REGEX =
  /(?:(?:name|email|phone).*(?:required|needed|mandatory)|(?:required|needed|mandatory).*(?:name|email|phone))/i;

const DEFAULT_MEMORY_TEMPLATE = {
  requiredFields: ["branchCode", "issueSummary"],
  optionalFields: ["fullName", "phone"],
  confirmationTemplate:
    "I've noted your request. Account ID: {{branchCode}}. Issue: {{issueSummary}}. Our support team will follow up shortly."
};

const CLOSED_TICKET_STATUS_MESSAGE =
  "Your request was previously received and forwarded to the support team. We're waiting for a response. If you'd like to open a new request, please share your account ID and a brief description of the issue.";
const OUTSIDE_SUPPORT_HOURS_MESSAGE =
  "Live support is currently unavailable outside business hours. Your request has been logged and will be forwarded to an agent during business hours.";

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
  if (trimmed.length <= 2 && !/^(ok|no|hi|go|up|am|an|as|at|be|by|do|if|in|is|it|me|my|of|on|or|so|to|us|we)$/i.test(trimmed)) return true;
  // Keyboard mash: known QWERTY mash patterns (explicit pattern matching to avoid false positives)
  const noSpaceMsg = trimmed.replace(/\s+/g, "").toLowerCase();
  if (noSpaceMsg.length >= 4 && /^(asdf|qwert|zxcv|hjkl|uiop|fghj|sdfg|poiu|lkjh|mnbv|cvbn)/.test(noSpaceMsg)) return true;
  // Programming keywords: standalone or short combinations
  const PROGRAMMING_KEYWORDS = /^(select|insert|update|delete|drop|alter|create|from|where|null|undefined|nan|console\.log|var|let|const|function|return|import|require|true|false|void|typeof|instanceof|class|int|string|float|bool|print|echo|sudo|chmod|grep|curl|wget|pip|npm|git|docker)(\s+(1\+1|\d+|null|undefined|nan|true|false|from|into|table|where|\*|\.|\w{1,8}))*[;()]*$/i;
  if (PROGRAMMING_KEYWORDS.test(trimmed)) return true;
  // Meaningless short text: 5+ chars, no vowel pair, purely alphanumeric
  if (trimmed.length >= 5 && trimmed.length <= 20 && /^[a-zA-Z0-9]+$/.test(trimmed)) {
    const hasVowelPair = /[aeiouAEIOU].*[aeiouAEIOU]/i.test(trimmed);
    if (!hasVowelPair && !/\d/.test(trimmed)) return true;
  }
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
  // In the first 2 turns, thanks/thank you is politeness, not farewell
  if (turnCount !== undefined && turnCount < 3) return false;
  const normalized = normalizeForMatching(text);
  if (!normalized) return false;
  // Long messages are not farewells — they contain additional content
  if (normalized.split(/\s+/).length > 8) return false;
  // Negative override: messages with thanks but ongoing issue or new question are not farewells
  const NEGATIVE_OVERRIDE = /\b(but|however|still|again|didn'?t work|not working|can'?t|couldn'?t|failed|issue|problem|error|broken)\b/;
  if (NEGATIVE_OVERRIDE.test(normalized)) return false;
  // Messages containing questions are not farewells: "thanks but how do I do it?"
  const QUESTION_OVERRIDE = /\b(how|what|where|when|which|also|another|one more|by the way)\b/;
  if (QUESTION_OVERRIDE.test(normalized)) return false;
  if (text.includes("?")) return false;
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

  return /^(hi|hello|hey|greetings|good morning|good afternoon|good evening)$/.test(normalized);
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
    /(?:account)\s*(?:id)?\s*[:=-]\s*([A-Za-z0-9_.@-]{2,40})/i,
    /(?:account)\s*(?:id)?\s+([A-Za-z0-9_.@-]{2,40})/i,
    /(?:user)\s*(?:name|id)?\s*[:=-]\s*([A-Za-z0-9_.@-]{2,40})/i,
    /(?:user)\s*(?:name|id)?\s+([A-Za-z0-9_.@-]{2,40})/i,
    /(?:branch)\s*(?:code)?\s*[:=-]\s*([A-Za-z0-9-]{2,20})/i,
    /(?:branch)\s*(?:code)?\s+([A-Za-z0-9-]{2,20})/i
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    const candidate = match?.[1]?.toUpperCase() || "";

    if (isLikelyBranchCode(candidate)) {
      return candidate;
    }

    // If explicit "account id" context exists, accept pure numeric (2-10 digits)
    if (candidate && /^\d{2,10}$/.test(candidate)) {
      return candidate;
    }
  }

  // Standalone text — accept as account ID (2-40 chars, single word or short text)
  const standaloneMatch = text.match(/^\s*([A-Za-z0-9_.@-]{2,40})\s*$/);
  const standaloneCandidate = standaloneMatch?.[1] || "";

  // Don't accept greetings or generic messages as account IDs
  if (standaloneCandidate && (isNonIssueMessage(standaloneCandidate) || isGreetingOnlyMessage(standaloneCandidate))) {
    // "Hello", "Hi", "Ok" etc. are not account IDs
  } else {
    if (isLikelyBranchCode(standaloneCandidate.toUpperCase())) {
      return standaloneCandidate;
    }

    // Standalone pure numeric (2-6 digits) — accept as account ID
    if (standaloneCandidate && /^\d{2,6}$/.test(standaloneCandidate)) {
      return standaloneCandidate;
    }

    // Standalone short alphanumeric — accept as account ID
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
    .replace(/(?:account)\s*(?:id)?\s*[:=-]?\s*[A-Za-z0-9_.@-]{2,40}/gi, "")
    .replace(/(?:user)\s*(?:name|id)?\s*[:=-]?\s*[A-Za-z0-9_.@-]{2,40}/gi, "")
    .replace(/(?:(?:full\s*)?name|phone|email|organization)\s*[:=-]?\s*[^,.;\n]+/gi, "")
    .replace(
      /^((hello|hi|hey|good\s*morning|good\s*afternoon|good\s*evening)[,.\s-]*)+/i,
      ""
    )
    .replace(/^new\s*(?:request|ticket)\s*[:-]?\s*/i, "")
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
      .replace(/^\s*and\s+/i, "")
      .replace(/\s+and\s+$/i, "")
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
  const branchCode = text.match(/Account ID:\s*([^.\n]+)\./i)?.[1]?.trim() ||
    text.match(/Branch code:\s*([^.\n]+)\./i)?.[1]?.trim() || "";
  const issueSummary =
    text.match(/Issue:\s*([\s\S]+?)\.\s*(?:Our )?support team/i)?.[1]?.trim() ||
    text.match(/Summary:\s*([\s\S]+?)\.\s*(?:Our )?support team/i)?.[1]?.trim() || "";

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
        /(?:(?:company|organization)(?:\s*name)?)\s*[:=-]?\s*([A-Za-z0-9 .,&-]{2,80})/i
      );
      if (companyMatch?.[1]) {
        memory.companyName = companyMatch[1].trim();
      }
    }

    if (!memory.fullName) {
      const fullNameMatch = text.match(
        /(?:(?:full\s*)?name|contact\s*person)\s*[:=-]?\s*([A-Za-z .,'-]{3,80})/i
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
  const { companyName: _companyName = "" } = opts;

  const fieldRequirementMessage =
    "To open a support request, your account ID and a brief issue description are required. Full name and phone number are optional.";
  const branchLocationMessage =
    "Your account ID is the unique identifier you use to log in to the platform. If you're not sure, you can check with your organization administrator.";

  const normalizedLatest = normalizeForMatching(latestUserMessage);

  if (FIELD_REQUIREMENT_QUESTION_REGEX.test(normalizedLatest)) {
    return fieldRequirementMessage;
  }

  if (BRANCH_LOCATION_QUESTION_REGEX.test(normalizedLatest)) {
    return branchLocationMessage;
  }

  // Info collection is delegated to the LLM — it asks when needed based on topic files
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
    `Hello, I'm the Technical Support Assistant. How can I help you?`;
  const fieldRequirementMessage =
    "To open a support request, your account ID and a brief issue description are required. Full name and phone number are optional.";
  const branchLocationMessage =
    "Your account ID is the unique identifier you use to log in to the platform. If you're not sure, you can check with your organization administrator.";

  const latestUserMessage = activeUserMessages[activeUserMessages.length - 1] || "";
  const normalizedLatest = normalizeForMatching(latestUserMessage);

  if (!latestUserMessage) {
    return welcomeMessage;
  }

  // Only respond with a welcome when greeting is received — but only on the first turn
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

    // No info collection without topic detection — delegate to LLM (return null)
    return null;
  }

  return null;
}

// ── Loop Detection ──────────────────────────────────────────────────────

function detectConversationLoop(userMessages) {
  if (userMessages.length < 2) return { isLoop: false, repeatCount: 0 };

  const normalized = userMessages.map(m => normalizeForMatching(m));
  const last = normalized[normalized.length - 1];

  // Compare the last message with previous ones
  let exactRepeatCount = 0;
  for (let i = normalized.length - 2; i >= 0; i--) {
    if (normalized[i] === last) exactRepeatCount++;
  }

  // Similarity check: last 3 messages with 80%+ overlap
  let similarCount = 0;
  if (normalized.length >= 3) {
    const lastThree = normalized.slice(-3);
    const words0 = new Set(lastThree[0].split(" "));
    for (let i = 1; i < lastThree.length; i++) {
      const wordsI = new Set(lastThree[i].split(" "));
      const intersection = [...words0].filter(w => wordsI.has(w)).length;
      const union = new Set([...words0, ...wordsI]).size;
      if (union > 0 && intersection / union > 0.8) similarCount++;
    }
  }

  const isLoop = exactRepeatCount >= 2 || similarCount >= 2;
  return { isLoop, repeatCount: Math.max(exactRepeatCount, similarCount) };
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
    farewellOffered: false,
    loopDetected: false,
    loopRepeatCount: 0,
    turnLimitReached: false,
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
    // Only detect greeting on first turn — in ongoing conversation "ok", "sure" etc. are not greetings
    context.conversationState = "welcome_or_greet";
  } else {
    // Keyword matching failed — try LLM-based classification (send all messages for context)
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

  // Note: Early escalation removed. Always provide KB info on the first turn.
  // Even if failure indicators (not working, can't do it, etc.) are present, provide troubleshooting/KB info first,
  // then redirect to escalation in subsequent turns if needed.

  if (memory.branchCode) {
    context.collectedInfo.branchCode = memory.branchCode;
  }
  if (memory.companyName) {
    context.collectedInfo.companyName = memory.companyName;
  }

  // Loop detection
  const loopResult = detectConversationLoop(userMessages);
  if (loopResult.isLoop) {
    context.loopDetected = true;
    context.loopRepeatCount = loopResult.repeatCount;
  }

  // Turn limit (7+)
  if (userMessages.length >= 7) {
    context.turnLimitReached = true;
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

  // Check all messages (topic is usually stated in early messages, should not be lost in later turns)
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
 * Detects whether the user's message contains a STRONG failure expression.
 * Strong = user explicitly states they tried and failed.
 * Weak indicators (showing error, not opening) are NOT included — they only describe the problem.
 */
function _hasFailureIndicator(text) {
  const normalized = normalizeForMatching(text);
  const strongIndicators = [
    "can't do it", "couldn't do it", "unable to",
    "not working", "didn't work", "doesn't work",
    "still not working", "still broken",
    "try again later", "please try again",
    "failed", "unsuccessful",
    "can't fix", "couldn't fix",
    "can't resolve", "couldn't resolve",
  ];
  return strongIndicators.some(ind => normalized.includes(ind));
}

/**
 * Inline escalation trigger detection (tool credential based).
 * Mirrors the original detectEscalationTriggers in server.js.
 */
function _detectEscalationTriggersLocal(text, remoteToolName) {
  const normalized = normalizeForMatching(text);

  // Direct agent/live support request
  // Note: "live support" alone is too broad — it also catches hour/info questions.
  // Distinguish between info questions and actual requests for "live support".
  const DIRECT_AGENT_PATTERNS = [
    "i want live support", "connect me to support",
    "i want an agent", "talk to an agent", "connect me to an agent",
    "real person", "real human",
    "speak to someone", "talk to someone",
    "speak to a manager", "talk to a manager",
    "transfer me", "escalate this",
  ];
  if (DIRECT_AGENT_PATTERNS.some(p => normalized.includes(normalizeForMatching(p)))) {
    return { shouldEscalate: true, reason: "direct_agent_request" };
  }
  // "live support" general pattern: only escalate if it's not an info question
  const INFO_QUESTION_WORDS = ["hours", "when", "what time", "schedule", "open", "close", "available"];
  if (normalized.includes("live support") && !INFO_QUESTION_WORDS.some(w => normalized.includes(w))) {
    return { shouldEscalate: true, reason: "direct_agent_request" };
  }

  // Remote support tool credential detection (ID + password/access code)
  const REMOTE_TOOL_NAMES = ["anydesk", "teamviewer", "remote desktop", "remote support"];
  const detectedTool = REMOTE_TOOL_NAMES.find(name => normalized.includes(name));
  if (detectedTool) {
    const idPattern = /(?:id|code|number)\s*[:=-]?\s*\d+/i;
    const passPattern = /(?:password|pass|access\s*code|pin)\s*[:=-]?\s*\S+/i;
    const hasToolId = idPattern.test(text);
    const hasToolPass = passPattern.test(text);

    if (hasToolId && hasToolPass) {
      return { shouldEscalate: true, reason: "remote_tool_credentials" };
    }

    // Two separate number groups + tool name = likely ID and password
    const bothInOneLine = /\d{3,}[\s,;.-]+\d{3,}/.test(text);
    if (bothInOneLine) {
      return { shouldEscalate: true, reason: "remote_tool_credentials" };
    }
  }

  // Additional remote tool pattern (configurable)
  const toolName = remoteToolName || "remote_tool";
  if (remoteToolName) {
    const toolPattern = new RegExp(remoteToolName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    const idPattern = new RegExp(`(?:${toolPattern.source}\\s*(?:id|code|number)?\\s*[:=-]?\\s*\\d+)`, "i");
    const passPattern = /(?:(?:password|pass|access\s*code)\s*[:=-]?\s*\S+)/i;
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

  // Loop detection
  detectConversationLoop,
};

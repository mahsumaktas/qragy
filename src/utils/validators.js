const PHONE_PATTERN = /^(?:\+?90)?0?\d{10}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PURE_NUMERIC_PATTERN = /^\d+$/;

function isLikelyBranchCode(value) {
  if (!value || typeof value !== "string") return false;
  const code = value.trim();
  if (code.length < 2 || code.length > 12) return false;
  if (!/^[A-Za-z0-9-]+$/.test(code)) return false;
  if (PURE_NUMERIC_PATTERN.test(code)) return false;
  if (!/[0-9]/.test(code)) return false;
  if (!/[A-Za-z]/.test(code)) return false;
  if (PHONE_PATTERN.test(code.replace(/[-\s]/g, ""))) return false;
  if (EMAIL_PATTERN.test(code)) return false;
  return true;
}

const GREETING_PATTERNS = [
  /^(hello|hi|hey|greetings|good\s*(morning|afternoon|evening|day))[\s!.,]*$/i,
];

function isGreetingOnly(text) {
  if (!text || typeof text !== "string") return false;
  const trimmed = text.trim();
  if (trimmed.length > 60) return false;
  return GREETING_PATTERNS.some((p) => p.test(trimmed));
}

const FAREWELL_POSITIVE = /\b(thanks?\w*|thank\s*you|cheers|bye\w*|goodbye|great|awesome|perfect|resolved|fixed|worked|got\s*it|understood)\b/i;
const FAREWELL_NEGATIVE_OVERRIDE = /\b(but|however|still|again|didn'?t\s*work|not\s*working|can'?t|couldn'?t|failed|issue|problem)\b/i;

function isFarewellMessage(text) {
  if (!text || typeof text !== "string") return false;
  const trimmed = text.trim();
  if (trimmed.length > 120) return false;
  if (!FAREWELL_POSITIVE.test(trimmed)) return false;
  if (FAREWELL_NEGATIVE_OVERRIDE.test(trimmed)) return false;
  return true;
}

module.exports = { isLikelyBranchCode, isGreetingOnly, isFarewellMessage, PHONE_PATTERN, EMAIL_PATTERN };

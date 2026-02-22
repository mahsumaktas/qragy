const PHONE_PATTERN = /^(?:\+?90)?0?\d{10}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PURE_NUMERIC_PATTERN = /^\d+$/;

function isLikelyBranchCode(value) {
  if (!value || typeof value !== "string") return false;
  const code = value.trim();
  if (code.length < 2 || code.length > 20) return false;
  if (!/^[A-Za-z0-9-]+$/.test(code)) return false;
  if (PURE_NUMERIC_PATTERN.test(code)) return false;
  if (!/[0-9]/.test(code)) return false;
  if (!/[A-Za-z]/.test(code)) return false;
  if (PHONE_PATTERN.test(code.replace(/[-\s]/g, ""))) return false;
  if (EMAIL_PATTERN.test(code)) return false;
  return true;
}

const GREETING_PATTERNS = [
  /^(merhaba|selam|selamlar|hey|hello|hi|gunaydin|iyi\s*(gunler|aksamlar|geceler))[\s!.,]*$/i,
];

function isGreetingOnly(text) {
  if (!text || typeof text !== "string") return false;
  const trimmed = text.trim();
  if (trimmed.length > 60) return false;
  return GREETING_PATTERNS.some((p) => p.test(trimmed));
}

const FAREWELL_POSITIVE = /\b(tesekkur\w*|sagol\w*|saol\w*|eyv\w*|tamam\w*|oldu|cozuldu|calisti|harika|super|anladim)\b/i;
const FAREWELL_NEGATIVE_OVERRIDE = /\b(ama|fakat|hala|yine|olmadi|calismadi|yapamadim|cozemedim|devam)\b/i;

function isFarewellMessage(text) {
  if (!text || typeof text !== "string") return false;
  const trimmed = text.trim();
  if (trimmed.length > 120) return false;
  if (!FAREWELL_POSITIVE.test(trimmed)) return false;
  if (FAREWELL_NEGATIVE_OVERRIDE.test(trimmed)) return false;
  return true;
}

module.exports = { isLikelyBranchCode, isGreetingOnly, isFarewellMessage, PHONE_PATTERN, EMAIL_PATTERN };

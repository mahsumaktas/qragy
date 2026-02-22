const TC_PATTERN = /\b[1-9]\d{10}\b/g;
const PHONE_PATTERN = /(?:\+?90|0)?\s*5\d{2}[\s-]?\d{3}[\s-]?\d{2}[\s-]?\d{2}/g;
const EMAIL_PATTERN = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const IBAN_PATTERN = /\bTR\d{24}\b/gi;

function maskPII(text) {
  if (!text || typeof text !== "string") return text;
  return text
    .replace(IBAN_PATTERN, "***IBAN***")
    .replace(TC_PATTERN, "***TC***")
    .replace(PHONE_PATTERN, "***TEL***")
    .replace(EMAIL_PATTERN, "***EMAIL***");
}

function sanitizeReply(text) {
  if (!text || typeof text !== "string") return "";
  return String(text)
    .replace(/\r/g, "")
    .replace(/`{1,3}/g, "")
    .replace(/#{1,6}\s/g, "")
    .replace(/\*{1,2}([^*]+)\*{1,2}/g, "$1")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, 800);
}

const TURKISH_DIACRITICS = { "ç":"c","ğ":"g","ı":"i","ö":"o","ş":"s","ü":"u","Ç":"c","Ğ":"g","İ":"i","Ö":"o","Ş":"s","Ü":"u" };

function normalizeForMatching(text) {
  if (!text || typeof text !== "string") return "";
  return text
    .toLowerCase()
    .replace(/[çğıöşüÇĞİÖŞÜ]/g, (ch) => TURKISH_DIACRITICS[ch] || ch)
    .replace(/\s+/g, " ")
    .trim();
}

const CREDENTIAL_PATTERN = /(?:sifre|parola|password|pin|şifre)\s*[:=]?\s*\S+/gi;

function maskCredentials(text) {
  if (!text || typeof text !== "string") return text;
  return text.replace(CREDENTIAL_PATTERN, "[MASKED-CREDENTIAL]");
}

module.exports = { maskPII, sanitizeReply, normalizeForMatching, maskCredentials };

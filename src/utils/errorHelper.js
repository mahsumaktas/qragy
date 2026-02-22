// src/utils/errorHelper.js

const SAFE_PREFIXES = ["Gecersiz", "Eksik", "Bulunamadi"];
const GENERIC_ERROR = "Bir hata olustu. Lutfen tekrar deneyin.";

function safeError(err, context = "unknown") {
  const message = err?.message || String(err || "");
  console.error(`[${context}] Error:`, message);

  if (!message) return GENERIC_ERROR;

  // JSON parse errors
  if (err instanceof SyntaxError || message.includes("JSON")) {
    return "Gecersiz veri formati.";
  }

  // Known safe prefixes — pass through
  for (const prefix of SAFE_PREFIXES) {
    if (message.startsWith(prefix)) return message;
  }

  return GENERIC_ERROR;
}

module.exports = { safeError, GENERIC_ERROR };

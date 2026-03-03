// src/utils/errorHelper.js

const SAFE_PREFIXES = ["Invalid", "Missing", "Not found"];
const GENERIC_ERROR = "An error occurred. Please try again.";

function safeError(err, context = "unknown") {
  const message = err?.message || String(err || "");
  console.error(`[${context}] Error:`, message);

  if (!message) return GENERIC_ERROR;

  // JSON parse errors
  if (err instanceof SyntaxError || message.includes("JSON")) {
    return "Invalid data format.";
  }

  // Known safe prefixes — pass through
  for (const prefix of SAFE_PREFIXES) {
    if (message.startsWith(prefix)) return message;
  }

  return GENERIC_ERROR;
}

module.exports = { safeError, GENERIC_ERROR };

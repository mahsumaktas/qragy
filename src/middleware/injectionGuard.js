const INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?(previous|prior|above|earlier)\s+(instructions|prompts|rules|context)/i,
  /(?:^|\s)(you are now|from now on you are)\s/i,
  /(?:^|\s)(act as|pretend to be|roleplay as|behave as)\s/i,
  /(?:^|\s)(repeat|show|display|print|reveal|tell me)\s+(your|the|system)\s+(prompt|instructions|rules|system message)/i,
  /SYSTEM\s*(OVERRIDE|COMMAND|MODE|PROMPT)\s*[:=]/i,
  /```\s*(system|admin|root)\b/i,
  /###\s*SYSTEM\b/i,
  /\b(jailbreak|DAN|do anything now)\b/i,
  /(?:^|\s)new\s+instructions?\s*:/i,
  /(?:^|\s)forget\s+(everything|all|your\s+rules)/i,
];

const SUSPICIOUS_KEYWORDS = [
  /\b(instruction|prompt|system\s*message|your\s*rules|your\s*training)\b/i,
  /\b(override|bypass|hack|exploit|inject)\b/i,
];

function detectInjection(text) {
  if (!text || typeof text !== "string") return { blocked: false, suspicious: false };
  const normalized = text.trim();
  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(normalized)) return { blocked: true, layer: 1, pattern: pattern.source };
  }
  for (const keyword of SUSPICIOUS_KEYWORDS) {
    if (keyword.test(normalized)) return { blocked: false, suspicious: true, keyword: keyword.source };
  }
  return { blocked: false, suspicious: false };
}

function validateOutput(reply, systemPromptFragments = []) {
  if (!reply || typeof reply !== "string") return { safe: true };
  const confessionPatterns = [
    /ben bir yapay zeka/i, /ben bir ai/i, /ben bir dil modeli/i,
    /as an ai/i, /i am an ai/i, /i('m| am) a language model/i,
    /my instructions (say|tell|are)/i, /my system prompt/i,
  ];
  for (const pattern of confessionPatterns) {
    if (pattern.test(reply)) return { safe: false, reason: "ai_confession", pattern: pattern.source };
  }
  for (const fragment of systemPromptFragments) {
    if (fragment.length > 20 && reply.toLowerCase().includes(fragment.toLowerCase())) {
      return { safe: false, reason: "prompt_leak" };
    }
  }
  return { safe: true };
}

const GENERIC_REPLY = "Size teknik destek konusunda yardimci olmak icin buradayim. Nasil yardimci olabilirim?";

module.exports = { detectInjection, validateOutput, INJECTION_PATTERNS, SUSPICIOUS_KEYWORDS, GENERIC_REPLY };

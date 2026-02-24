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

// ── LLM-based Relevance Guardrail ─────────────────────────────────────
const RELEVANCE_SYSTEM_PROMPT = [
  "Sen musteri destek sistemi icin ilgililik kontrol modulusun.",
  "Kullanicinin mesaji teknik destek veya musteri hizmetleri ile ilgili mi belirle.",
  "",
  "ILGILI: Yazilim/sistem sorunu, hesap sorunu, sifre, yazici, rapor, baglanti, iletisim bilgisi, selamlama, vedalasmalar, temsilci istegi, onay/ret (evet/hayir), kisa sayisal kodlar (sube kodu olabilir), firma islemleri (sefer, bilet, fatura vb).",
  "ILGISIZ: Siyaset, spor, genel kultur, matematik, yaratici yazim, AI/model hakkinda sorular, tamamen alakasiz konular.",
  "",
  'Sadece JSON cevap ver: {"relevant":true} veya {"relevant":false,"reason":"kisa aciklama"}',
].join("\n");

/**
 * LLM-based relevance check — off-topic mesajlari ucuz model ile yakala.
 * Fail-open: LLM hatasi veya parse hatasi durumunda mesaj gecerli sayilir.
 * @param {string} userMessage
 * @param {Function} callLLMFn - callLLM(messages, systemPrompt, maxTokens, options)
 * @returns {Promise<{relevant: boolean, reason: string}>}
 */
async function checkRelevanceLLM(userMessage, callLLMFn) {
  try {
    const messages = [{ role: "user", parts: [{ text: userMessage }] }];
    const result = await callLLMFn(messages, RELEVANCE_SYSTEM_PROMPT, 64, { thinkingBudget: 0 });
    const raw = (result.reply || "").trim();
    const jsonMatch = raw.match(/\{[\s\S]*?\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return { relevant: parsed.relevant !== false, reason: parsed.reason || "" };
    }
    return { relevant: true, reason: "parse_fallback" };
  } catch {
    return { relevant: true, reason: "error_fallback" };
  }
}

module.exports = { detectInjection, validateOutput, checkRelevanceLLM, INJECTION_PATTERNS, SUSPICIOUS_KEYWORDS, GENERIC_REPLY };

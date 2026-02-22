const EXPLICIT_REQUEST_PATTERNS = [
  /\b(temsilci(ye|yle)?\s*(aktar|bagla|gorusmek|konusmak))/i,
  /\b(canli\s*destek\s*(istiyorum|baglayın|bagin|lutfen)?)/i,
  /\b(biriyle\s*gorusmek\s*istiyorum)/i,
  /\b(insan(la)?\s*(gorusmek|konusmak)\s*istiyorum)/i,
  /\b(yetkiliy(le|e)\s*(bagla|aktar|gorusmek))/i,
];

const THREAT_PATTERNS = [
  /\b(sikayet\s*edecegim|dava\s*acacagim|avukat|mahkeme)\b/i,
];

const NEGATIVE_WORDS = ["yapamadim","olmadi","cozemedim","calismadi","calismıyor","hata","bozuk","bozuldu","sikinti","sorun","sinirli","biktim","rezalet","berbat","imkansiz","yine","hala","tekrar"];
const POSITIVE_WORDS = ["tesekkur","sagol","saol","harika","super","oldu","cozuldu","calisti","tamam","anladim"];

function detectEscalationTriggers(text, remoteToolName = "") {
  if (!text || typeof text !== "string") return { shouldEscalate: false };
  for (const pattern of EXPLICIT_REQUEST_PATTERNS) {
    if (pattern.test(text)) return { shouldEscalate: true, reason: "user_request", layer: 1 };
  }
  for (const pattern of THREAT_PATTERNS) {
    if (pattern.test(text)) return { shouldEscalate: true, reason: "threat_detected", layer: 1 };
  }
  if (remoteToolName) {
    const toolPattern = new RegExp(remoteToolName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    const hasToolMention = toolPattern.test(text);
    const hasId = /(?:id|no|numara)\s*[:=\-]?\s*\S+/i.test(text);
    const hasPass = /(?:parola|sifre|şifre|password)\s*[:=\-]?\s*\S+/i.test(text);
    if ((hasToolMention || hasId) && hasPass) {
      return { shouldEscalate: true, reason: "remote_tool_credentials", layer: 1 };
    }
  }
  return { shouldEscalate: false };
}

function detectSentiment(text) {
  if (!text || typeof text !== "string") return { score: 0, label: "neutral" };
  const lower = text.toLowerCase();
  let score = 0;
  for (const word of NEGATIVE_WORDS) { if (lower.includes(word)) score -= 1; }
  for (const word of POSITIVE_WORDS) { if (lower.includes(word)) score += 1; }
  const label = score < 0 ? "negative" : score > 0 ? "positive" : "neutral";
  return { score: Math.sign(score), label };
}

function shouldAutoEscalate(sentimentHistory) {
  if (!Array.isArray(sentimentHistory) || sentimentHistory.length < 3) return false;
  const lastThree = sentimentHistory.slice(-3);
  return lastThree.every((s) => s < 0);
}

module.exports = { detectEscalationTriggers, detectSentiment, shouldAutoEscalate, EXPLICIT_REQUEST_PATTERNS, NEGATIVE_WORDS, POSITIVE_WORDS };

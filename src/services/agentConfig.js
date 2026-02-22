"use strict";

/**
 * Agent Config Service
 *
 * Loads agent personality files (soul, persona, bootstrap, etc.),
 * topic index, memory template, and provides cached topic file loading.
 * Factory pattern — paths and helpers injected via deps.
 */
function createAgentConfigService(deps) {
  const {
    fs, path, logger,
    agentDir,
    topicsDir,
    memoryDir,
    getBotName,
    getCompanyName,
    topicFileCache,
  } = deps;

  const DEFAULT_PERSONA_TEXT = [
    `# ${getBotName()} Teknik Destek Persona`,
    `- Rol: ${getBotName()}, ${getCompanyName() || "sirket"} teknik destek yapay zeka asistani.`,
    "- Kanal: Canli destek oncesi AI karsilama ve yonlendirme katmani.",
    "- Hedef: Konu bazli teknik destek saglamak, mumkunse sorunu cozmek, gerektiginde canli temsilciye aktarmak.",
    "- Dil/Ton: Turkce, resmi, net, kisa.",
    "- Sinir: Teknik cozum anlatma, yalnizca talep topla."
  ].join("\n");

  const DEFAULT_POLICY_TEXT = [
    "# Response Policy",
    "1. Eksik zorunlu alanları tek tek sor.",
    "2. Şube kodu ve sorun özeti zorunludur.",
    "3. Zorunlu alanlar tamamlanınca standart onay metni ver.",
    "4. Teknik adım anlatma.",
    "5. Yanıtları 1-3 cümlede tut ve düz metin kullan."
  ].join("\n");

  const DEFAULT_MEMORY_TEMPLATE = {
    requiredFields: ["branchCode", "issueSummary"],
    optionalFields: ["companyName", "fullName", "phone"],
    confirmationTemplate:
      "Talebinizi aldım. Şube kodu: {{branchCode}}. Kısa açıklama: {{issueSummary}}. Destek ekibi en kısa sürede dönüş yapacaktır."
  };

  function readTextFileSafe(filePath, fallback = "") {
    try {
      let text = fs.readFileSync(filePath, "utf8").trim() || fallback;
      const companyName = getCompanyName();
      if (companyName) {
        text = text.replace(/\{\{COMPANY_NAME\}\}/g, companyName);
      } else {
        text = text.replace(/\{\{COMPANY_NAME\}\}/g, getBotName());
      }
      return text;
    } catch (_error) {
      return fallback;
    }
  }

  function readJsonFileSafe(filePath, fallback = {}) {
    try {
      return JSON.parse(fs.readFileSync(filePath, "utf8"));
    } catch (_error) {
      return fallback;
    }
  }

  // ── Mutable agent state ────────────────────────────────────────────────
  let SOUL_TEXT = readTextFileSafe(path.join(agentDir, "soul.md"), "");
  let BOOTSTRAP_TEXT = readTextFileSafe(path.join(agentDir, "bootstrap.md"), "");
  let PERSONA_TEXT = readTextFileSafe(path.join(agentDir, "persona.md"), DEFAULT_PERSONA_TEXT);
  let RESPONSE_POLICY_TEXT = readTextFileSafe(path.join(agentDir, "response-policy.md"), DEFAULT_POLICY_TEXT);
  let DOMAIN_TEXT = readTextFileSafe(path.join(agentDir, "domain.md"));
  let SKILLS_TEXT = readTextFileSafe(path.join(agentDir, "skills.md"));
  let HARD_BANS_TEXT = readTextFileSafe(path.join(agentDir, "hard-bans.md"));
  let ESCALATION_MATRIX_TEXT = readTextFileSafe(path.join(agentDir, "escalation-matrix.md"));
  let DOD_TEXT = readTextFileSafe(path.join(agentDir, "definition-of-done.md"));
  let OUTPUT_FILTER_TEXT = readTextFileSafe(path.join(agentDir, "output-filter.md"));
  let MEMORY_TEMPLATE = readJsonFileSafe(path.join(memoryDir, "ticket-template.json"), DEFAULT_MEMORY_TEMPLATE);
  let CONVERSATION_SCHEMA = readJsonFileSafe(
    path.join(memoryDir, "conversation-schema.json"),
    { sessionFields: { currentTopic: null, conversationState: "welcome", collectedInfo: {}, turnCount: 0, escalationTriggered: false } }
  );
  let TOPIC_INDEX = readJsonFileSafe(path.join(topicsDir, "_index.json"), { topics: [] });
  let TOPIC_INDEX_SUMMARY = TOPIC_INDEX.topics.map(
    (t) => `[${t.id}] ${t.title}: ${t.keywords.join(", ")}`
  ).join("\n");

  function loadAllAgentConfig() {
    SOUL_TEXT = readTextFileSafe(path.join(agentDir, "soul.md"), "");
    BOOTSTRAP_TEXT = readTextFileSafe(path.join(agentDir, "bootstrap.md"), "");
    PERSONA_TEXT = readTextFileSafe(path.join(agentDir, "persona.md"), DEFAULT_PERSONA_TEXT);
    RESPONSE_POLICY_TEXT = readTextFileSafe(path.join(agentDir, "response-policy.md"), DEFAULT_POLICY_TEXT);
    DOMAIN_TEXT = readTextFileSafe(path.join(agentDir, "domain.md"));
    SKILLS_TEXT = readTextFileSafe(path.join(agentDir, "skills.md"));
    HARD_BANS_TEXT = readTextFileSafe(path.join(agentDir, "hard-bans.md"));
    ESCALATION_MATRIX_TEXT = readTextFileSafe(path.join(agentDir, "escalation-matrix.md"));
    DOD_TEXT = readTextFileSafe(path.join(agentDir, "definition-of-done.md"));
    OUTPUT_FILTER_TEXT = readTextFileSafe(path.join(agentDir, "output-filter.md"));
    MEMORY_TEMPLATE = readJsonFileSafe(path.join(memoryDir, "ticket-template.json"), DEFAULT_MEMORY_TEMPLATE);
    CONVERSATION_SCHEMA = readJsonFileSafe(path.join(memoryDir, "conversation-schema.json"), { sessionFields: { currentTopic: null, conversationState: "welcome", collectedInfo: {}, turnCount: 0, escalationTriggered: false } });
    TOPIC_INDEX = readJsonFileSafe(path.join(topicsDir, "_index.json"), { topics: [] });
    TOPIC_INDEX_SUMMARY = TOPIC_INDEX.topics.map((t) => `[${t.id}] ${t.title}: ${t.keywords.join(", ")}`).join("\n");
    topicFileCache.clear();
    logger.info("agent", "Agent config yeniden yuklendi");
  }

  // ── Topic file cache ───────────────────────────────────────────────────
  const TOPIC_CACHE_TTL = 5 * 60 * 1000;
  const TOPIC_CACHE_MAX_SIZE = 200;

  function loadTopicFile(topicId) {
    const cached = topicFileCache.get(topicId);
    if (cached && (Date.now() - cached.ts) < TOPIC_CACHE_TTL) {
      return cached.content;
    }
    const topic = TOPIC_INDEX.topics.find((t) => t.id === topicId);
    if (!topic) return "";
    const content = readTextFileSafe(path.join(topicsDir, topic.file), "");
    topicFileCache.set(topicId, { content, ts: Date.now() });
    if (topicFileCache.size > TOPIC_CACHE_MAX_SIZE) {
      const firstKey = topicFileCache.keys().next().value;
      topicFileCache.delete(firstKey);
    }
    return content;
  }

  function getTopicMeta(topicId) {
    return TOPIC_INDEX.topics.find((t) => t.id === topicId) || null;
  }

  return {
    readTextFileSafe,
    readJsonFileSafe,
    loadAllAgentConfig,
    loadTopicFile,
    getTopicMeta,
    getSoulText: () => SOUL_TEXT,
    getBootstrapText: () => BOOTSTRAP_TEXT,
    getPersonaText: () => PERSONA_TEXT,
    getResponsePolicyText: () => RESPONSE_POLICY_TEXT,
    getDomainText: () => DOMAIN_TEXT,
    getSkillsText: () => SKILLS_TEXT,
    getHardBansText: () => HARD_BANS_TEXT,
    getEscalationMatrixText: () => ESCALATION_MATRIX_TEXT,
    getDodText: () => DOD_TEXT,
    getOutputFilterText: () => OUTPUT_FILTER_TEXT,
    getMemoryTemplate: () => MEMORY_TEMPLATE,
    getConversationSchema: () => CONVERSATION_SCHEMA,
    getTopicIndex: () => TOPIC_INDEX,
    getTopicIndexSummary: () => TOPIC_INDEX_SUMMARY,
  };
}

module.exports = { createAgentConfigService };

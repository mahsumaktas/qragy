"use strict";

/**
 * Config Store Service
 *
 * Manages chatFlow, site, sunshine configs + session persistence + prompt versioning.
 * Factory pattern — state encapsulated inside.
 */
function createConfigStore(deps) {
  const { fs, logger, paths } = deps;

  // ── Chat Flow Configuration ─────────────────────────────────────────────
  const DEFAULT_CHAT_FLOW_CONFIG = {
    messageAggregationWindowMs: 4000,
    botResponseDelayMs: 2000,
    typingIndicatorEnabled: true,
    inactivityTimeoutMs: 600000,
    nudgeEnabled: true,
    nudgeAt75Message: "Hala buradayım. Size nasıl yardımcı olabilirim?",
    nudgeAt90Message: "Son birkaç dakikadır mesaj almadım. Yardımcı olabilir miyim?",
    inactivityCloseMessage: "Uzun süredir mesaj almadığım için sohbeti sonlandırıyorum. İhtiyacınız olursa tekrar yazabilirsiniz.",
    maxClarificationRetries: 3,
    gibberishDetectionEnabled: true,
    gibberishMessage: "Mesajınızı anlayamadım. Lütfen sorununuzu daha detaylı açıklar mısınız?",
    closingFlowEnabled: true,
    anythingElseMessage: "Başka yardımcı olabileceğim bir konu var mı?",
    farewellMessage: "İyi günler dilerim! İhtiyacınız olursa tekrar yazabilirsiniz.",
    csatEnabled: true,
    csatMessage: "Deneyiminizi değerlendirir misiniz?",
    welcomeMessage: "Merhaba, Teknik Destek hattına hoş geldiniz. Size nasıl yardımcı olabilirim?"
  };

  let chatFlowConfig = { ...DEFAULT_CHAT_FLOW_CONFIG };

  function loadChatFlowConfig() {
    try {
      if (fs.existsSync(paths.chatFlowConfigFile)) {
        const saved = JSON.parse(fs.readFileSync(paths.chatFlowConfigFile, "utf8"));
        chatFlowConfig = { ...DEFAULT_CHAT_FLOW_CONFIG, ...saved };
      }
    } catch (err) {
      logger.warn("loadChatFlowConfig", "Error", err);
      chatFlowConfig = { ...DEFAULT_CHAT_FLOW_CONFIG };
    }
  }

  function saveChatFlowConfig(updates) {
    chatFlowConfig = { ...chatFlowConfig, ...updates };
    fs.writeFileSync(paths.chatFlowConfigFile, JSON.stringify(chatFlowConfig, null, 2), "utf8");
  }

  // ── Site Branding Configuration ─────────────────────────────────────────
  const DEFAULT_SITE_CONFIG = {
    pageTitle: "Teknik Destek",
    heroTitle: "Teknik Destek",
    heroDescription: "Teknik destek taleplerinizi AI katmaninda toplayalim.",
    heroButtonText: "Canli Destek",
    heroHint: "AI gerekli bilgileri topladiginda temsilciye otomatik aktarim yapilir.",
    headerTitle: "Teknik Destek",
    logoUrl: "",
    themeColor: "#2563EB",
    primaryColor: "",
    inputPlaceholder: "Mesajinizi yazin...",
    sendButtonText: "Gonder"
  };

  let siteConfig = { ...DEFAULT_SITE_CONFIG };

  function loadSiteConfig() {
    try {
      if (fs.existsSync(paths.siteConfigFile)) {
        const saved = JSON.parse(fs.readFileSync(paths.siteConfigFile, "utf8"));
        siteConfig = { ...DEFAULT_SITE_CONFIG, ...saved };
      }
    } catch (err) {
      logger.warn("loadSiteConfig", "Error", err);
      siteConfig = { ...DEFAULT_SITE_CONFIG };
    }
  }

  function saveSiteConfig(updates) {
    siteConfig = { ...siteConfig, ...updates };
    fs.writeFileSync(paths.siteConfigFile, JSON.stringify(siteConfig, null, 2), "utf8");
  }

  // ── Sunshine Conversations Configuration ────────────────────────────────
  const DEFAULT_SUNSHINE_CONFIG = {
    enabled: false,
    subdomain: "",
    appId: "",
    keyId: "",
    keySecret: "",
    webhookSecret: "",
    farewellMessage: "Sizi canli destek temsilcisine aktariyorum. Iyi gunler!"
  };

  let sunshineConfig = { ...DEFAULT_SUNSHINE_CONFIG };

  function loadSunshineConfig() {
    try {
      if (fs.existsSync(paths.sunshineConfigFile)) {
        const saved = JSON.parse(fs.readFileSync(paths.sunshineConfigFile, "utf8"));
        sunshineConfig = { ...DEFAULT_SUNSHINE_CONFIG, ...saved };
      }
    } catch (err) {
      logger.warn("loadSunshineConfig", "Error", err);
      sunshineConfig = { ...DEFAULT_SUNSHINE_CONFIG };
    }
  }

  function saveSunshineConfig(updates) {
    sunshineConfig = { ...sunshineConfig, ...updates };
    fs.writeFileSync(paths.sunshineConfigFile, JSON.stringify(sunshineConfig, null, 2), "utf8");
  }

  // ── Session Persistence ─────────────────────────────────────────────────
  function loadTelegramSessions() {
    try {
      if (fs.existsSync(paths.telegramSessionsFile)) {
        return JSON.parse(fs.readFileSync(paths.telegramSessionsFile, "utf8"));
      }
    } catch (err) { logger.warn("loadTelegramSessions", "Error", err); }
    return {};
  }

  function saveTelegramSessions(sessions) {
    fs.writeFileSync(paths.telegramSessionsFile, JSON.stringify(sessions, null, 2), "utf8");
  }

  function loadSunshineSessions() {
    try {
      if (fs.existsSync(paths.sunshineSessionsFile)) {
        return JSON.parse(fs.readFileSync(paths.sunshineSessionsFile, "utf8"));
      }
    } catch (err) { logger.warn("loadSunshineSessions", "Error", err); }
    return {};
  }

  function saveSunshineSessions(sessions) {
    fs.writeFileSync(paths.sunshineSessionsFile, JSON.stringify(sessions, null, 2), "utf8");
  }

  // ── Prompt Versioning ───────────────────────────────────────────────────
  function loadPromptVersions() {
    try {
      if (fs.existsSync(paths.promptVersionsFile)) {
        return JSON.parse(fs.readFileSync(paths.promptVersionsFile, "utf8"));
      }
    } catch (err) { logger.warn("loadPromptVersions", "Error", err); }
    return { versions: [] };
  }

  function savePromptVersion(filename, content) {
    const data = loadPromptVersions();
    data.versions.push({
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      filename,
      content,
      savedAt: new Date().toISOString()
    });
    if (data.versions.length > 50) data.versions = data.versions.slice(-50);
    fs.writeFileSync(paths.promptVersionsFile, JSON.stringify(data, null, 2), "utf8");
  }

  // ── Initialize ──────────────────────────────────────────────────────────
  loadChatFlowConfig();
  loadSiteConfig();
  loadSunshineConfig();

  return {
    // Chat Flow
    getChatFlowConfig: () => chatFlowConfig,
    loadChatFlowConfig,
    saveChatFlowConfig,
    DEFAULT_CHAT_FLOW_CONFIG,
    // Site
    getSiteConfig: () => siteConfig,
    loadSiteConfig,
    saveSiteConfig,
    DEFAULT_SITE_CONFIG,
    // Sunshine
    getSunshineConfig: () => sunshineConfig,
    loadSunshineConfig,
    saveSunshineConfig,
    DEFAULT_SUNSHINE_CONFIG,
    // Sessions
    loadTelegramSessions,
    saveTelegramSessions,
    loadSunshineSessions,
    saveSunshineSessions,
    // Prompt Versioning
    loadPromptVersions,
    savePromptVersion,
  };
}

module.exports = { createConfigStore };

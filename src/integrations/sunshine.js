"use strict";

/**
 * Sunshine Conversations Integration
 *
 * API client, webhook handler, inactivity check — extracted from chat.js
 */
function createSunshineIntegration(deps) {
  const {
    express,
    crypto,
    logger,
    getSunshineConfig,
    getZendeskScWebhookSecret,
    getZendeskScAppId,
    getZendeskScKeyId,
    getZendeskScKeySecret,
    getZendeskScSubdomain,
    getChatFlowConfig,
    DEFAULT_SUNSHINE_CONFIG,
    loadSunshineSessions,
    saveSunshineSessions,
    upsertConversation,
    recordAnalyticsEvent,
    processChatMessage,
    ESCALATION_MESSAGE_REGEX,
  } = deps;

  // ── API Client ──────────────────────────────────────────────────────────
  function getSunshineAuthHeader() {
    const sunshineConfig = getSunshineConfig();
    const keyId = sunshineConfig.keyId || getZendeskScKeyId();
    const keySecret = sunshineConfig.keySecret || getZendeskScKeySecret();
    return "Basic " + Buffer.from(keyId + ":" + keySecret).toString("base64");
  }

  function getSunshineBaseUrl() {
    const sunshineConfig = getSunshineConfig();
    const subdomain = sunshineConfig.subdomain || getZendeskScSubdomain();
    return "https://" + subdomain + ".zendesk.com/sc/v2";
  }

  async function sunshineSendMessage(appId, conversationId, text) {
    const baseUrl = getSunshineBaseUrl();
    const url = baseUrl + "/apps/" + appId + "/conversations/" + conversationId + "/messages";
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": getSunshineAuthHeader()
      },
      body: JSON.stringify({
        author: { type: "business" },
        content: { type: "text", text }
      }),
      signal: controller.signal
    }).finally(() => clearTimeout(timeoutId));
    if (!resp.ok) {
      const errText = await resp.text().catch(() => "");
      logger.warn("sunshine", `Mesaj gonderilemedi: ${resp.status} ${errText}`);
    }
    return resp.ok;
  }

  async function sunshinePassControl(appId, conversationId) {
    const baseUrl = getSunshineBaseUrl();
    const url = baseUrl + "/apps/" + appId + "/conversations/" + conversationId + "/passControl";
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": getSunshineAuthHeader()
      },
      body: JSON.stringify({
        switchboardIntegration: { next: true },
        metadata: { reason: "escalation" }
      }),
      signal: controller.signal
    }).finally(() => clearTimeout(timeoutId));
    if (!resp.ok) {
      const errText = await resp.text().catch(() => "");
      logger.warn("sunshine", `passControl hatasi: ${resp.status} ${errText}`);
    }
    return resp.ok;
  }

  // ── Webhook Handler ─────────────────────────────────────────────────────
  function mountWebhook(app) {
    app.post("/api/sunshine/webhook", express.json({ limit: "100kb" }), (req, res) => {
      const sunshineConfig = getSunshineConfig();
      const secret = sunshineConfig.webhookSecret || getZendeskScWebhookSecret();
      if (secret) {
        const provided = (req.headers["x-api-key"] || "").trim();
        if (!provided || provided.length !== secret.length ||
            !crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(secret))) {
          return res.status(401).json({ error: "Unauthorized" });
        }
      }

      res.status(200).json({ ok: true });

      const events = req.body?.events || [];
      for (const event of events) {
        if (event.type !== "conversation:message") continue;
        const payload = event.payload || {};
        const message = payload.message || {};
        const conversation = payload.conversation || {};

        if (message.author?.type !== "user") continue;
        if (message.content?.type !== "text") continue;

        const conversationId = conversation._id || conversation.id || "";
        const appId = sunshineConfig.appId || getZendeskScAppId() || req.body?.app?.id || "";
        if (!conversationId || !appId) continue;

        (async () => {
          try {
            const sessionKey = "zd-" + conversationId;
            const sessions = loadSunshineSessions();
            if (!sessions[sessionKey]) {
              sessions[sessionKey] = {
                messages: [],
                appId,
                userId: message.author?.userId || "",
                lastActivity: Date.now()
              };
            }

            const session = sessions[sessionKey];
            const userText = (message.content.text || "").slice(0, 1000);
            session.messages.push({ role: "user", content: userText });
            session.lastActivity = Date.now();
            session.nudge75Sent = false;
            session.nudge90Sent = false;
            session.closed = false;

            if (session.messages.length > 30) {
              session.messages = session.messages.slice(-30);
            }

            const result = await processChatMessage(session.messages, "sunshine");
            session.messages.push({ role: "assistant", content: result.reply });
            saveSunshineSessions(sessions);

            const memory = result.memory || {};
            upsertConversation(sessionKey, session.messages, memory, { source: "sunshine" });

            const isEscalation = ESCALATION_MESSAGE_REGEX.test(result.reply);
            if (isEscalation) {
              const farewell = sunshineConfig.farewellMessage || (DEFAULT_SUNSHINE_CONFIG && DEFAULT_SUNSHINE_CONFIG.farewellMessage) || "";
              await sunshineSendMessage(appId, conversationId, farewell);
              await sunshinePassControl(appId, conversationId);
            } else {
              await sunshineSendMessage(appId, conversationId, result.reply);
            }
          } catch (err) {
            logger.warn("Sunshine", "Webhook isleme hatasi", err);
          }
        })();
      }
    });
  }

  // ── Inactivity Check ────────────────────────────────────────────────────
  function checkSunshineInactivity() {
    const chatFlowConfig = getChatFlowConfig();
    const sessions = loadSunshineSessions();
    const timeout = chatFlowConfig.inactivityTimeoutMs || 600000;
    const now = Date.now();
    let changed = false;

    for (const [sessionKey, session] of Object.entries(sessions)) {
      if (!session.lastActivity || session.closed) continue;
      if (!session.appId) continue;
      const elapsed = now - session.lastActivity;
      const conversationId = sessionKey.startsWith("zd-") ? sessionKey.slice(3) : sessionKey;

      if (elapsed >= timeout * 0.75 && !session.nudge75Sent) {
        const msg75 = chatFlowConfig.nudgeAt75Message || "Hala buradayım. Size nasıl yardımcı olabilirim?";
        sunshineSendMessage(session.appId, conversationId, msg75).catch(() => {});
        session.nudge75Sent = true;
        changed = true;
      }
      if (elapsed >= timeout * 0.90 && !session.nudge90Sent) {
        const msg90 = chatFlowConfig.nudgeAt90Message || "Son birkaç dakikadır mesaj almadım. Yardımcı olabilir miyim?";
        sunshineSendMessage(session.appId, conversationId, msg90).catch(() => {});
        session.nudge90Sent = true;
        changed = true;
      }
      if (elapsed >= timeout) {
        const closeMsg = chatFlowConfig.inactivityCloseMessage || "Uzun süredir mesaj almadığım için sohbeti sonlandırıyorum.";
        sunshineSendMessage(session.appId, conversationId, closeMsg).catch(() => {});
        session.closed = true;
        session.messages = [];
        changed = true;
        upsertConversation(sessionKey, [], {}, { source: "sunshine", status: "closed" });
        recordAnalyticsEvent({ source: "chat-closed", reason: "inactivity" });
      }
    }

    if (changed) saveSunshineSessions(sessions);
  }

  return {
    mountWebhook,
    checkSunshineInactivity,
    sunshineSendMessage,
    sunshinePassControl,
  };
}

module.exports = { createSunshineIntegration };

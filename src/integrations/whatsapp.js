"use strict";

/**
 * WhatsApp Cloud API Integration
 *
 * Handles incoming messages via webhook and sends replies through the WhatsApp Cloud API.
 * Pattern follows telegram.js integration.
 */

function createWhatsAppIntegration(deps) {
  const {
    express, logger,
    getWhatsAppConfig,
    getChatFlowConfig,
    upsertConversation,
    recordAnalyticsEvent,
    processChatMessage,
  } = deps;

  function isEnabled() {
    const cfg = getWhatsAppConfig();
    return cfg.enabled && cfg.phoneNumberId && cfg.accessToken;
  }

  // Webhook verification (GET)
  function handleVerification(req, res) {
    const cfg = getWhatsAppConfig();
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];

    if (mode === "subscribe" && token === cfg.verifyToken) {
      logger.info("whatsapp", "Webhook verified");
      return res.status(200).send(challenge);
    }
    return res.status(403).send("Verification failed");
  }

  // Process incoming webhook (POST)
  async function handleWebhook(req, res) {
    // Respond immediately (WhatsApp requires 200 within 5s)
    res.sendStatus(200);

    if (!isEnabled()) return;

    try {
      const body = req.body;
      const entry = body?.entry?.[0];
      const changes = entry?.changes?.[0];
      const value = changes?.value;

      if (!value?.messages?.[0]) return;

      const message = value.messages[0];
      const from = message.from; // phone number
      const text = message.text?.body;

      if (!text || message.type !== "text") return;

      const sessionId = `wa_${from}`;
      const chatFlowConfig = getChatFlowConfig();

      // Build message array format matching chatProcessor expectations
      const chatHistory = [{ role: "user", parts: [{ text }] }];

      try {
        const result = await processChatMessage({
          sessionId,
          source: "whatsapp",
          messages: chatHistory,
          chatFlowConfig,
          userMessage: text,
        });

        if (result?.reply) {
          await sendMessage(from, result.reply);
        }

        upsertConversation(sessionId, {
          source: "whatsapp",
          lastUserMessage: text,
        });

        recordAnalyticsEvent("chat", { source: "whatsapp" });
      } catch (err) {
        logger.error("whatsapp", "Processing failed", err);
      }
    } catch (err) {
      logger.error("whatsapp", "Webhook handler error", err);
    }
  }

  async function sendMessage(to, text) {
    const cfg = getWhatsAppConfig();
    if (!cfg.phoneNumberId || !cfg.accessToken) return;

    const url = `https://graph.facebook.com/v18.0/${cfg.phoneNumberId}/messages`;

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${cfg.accessToken}`,
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to,
          type: "text",
          text: { body: text },
        }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        logger.error("whatsapp", "Send failed", { status: response.status, error: errData });
      }
    } catch (err) {
      logger.error("whatsapp", "Send error", err);
    }
  }

  function mountWebhook(app) {
    app.get("/api/webhooks/whatsapp", handleVerification);
    app.post("/api/webhooks/whatsapp", express.json(), handleWebhook);
  }

  return { mountWebhook, isEnabled, sendMessage };
}

module.exports = { createWhatsAppIntegration };

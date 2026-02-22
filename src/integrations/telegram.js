"use strict";

/**
 * Telegram Bot Integration
 *
 * Long polling, message handling, inactivity check — extracted from chat.js
 */
function createTelegramIntegration(deps) {
  const {
    logger,
    getTelegramEnabled,
    getTelegramBotToken,
    getTelegramPollingIntervalMs,
    getChatFlowConfig,
    loadTelegramSessions,
    saveTelegramSessions,
    upsertConversation,
    recordAnalyticsEvent,
    processChatMessage,
  } = deps;

  let telegramOffset = 0;

  // ── Send Message ────────────────────────────────────────────────────────
  async function sendTelegramMessage(chatId, text) {
    const TELEGRAM_BOT_TOKEN = getTelegramBotToken();
    if (!TELEGRAM_BOT_TOKEN || !text) return;
    await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text })
    }).catch(() => {});
  }

  // ── Handle Update ───────────────────────────────────────────────────────
  async function handleTelegramUpdate(update) {
    const TELEGRAM_BOT_TOKEN = getTelegramBotToken();
    const msg = update.message;
    if (!msg || !msg.text) return;

    const chatId = String(msg.chat.id);
    const sessions = loadTelegramSessions();
    if (!sessions[chatId]) sessions[chatId] = { messages: [] };

    sessions[chatId].lastActivity = Date.now();
    sessions[chatId].nudge75Sent = false;
    sessions[chatId].nudge90Sent = false;
    sessions[chatId].closed = false;

    sessions[chatId].messages.push({ role: "user", content: (msg.text || "").slice(0, 1000) });
    if (sessions[chatId].messages.length > 30) {
      sessions[chatId].messages = sessions[chatId].messages.slice(-30);
    }

    try {
      const result = await processChatMessage(sessions[chatId].messages, "telegram");
      sessions[chatId].messages.push({ role: "assistant", content: result.reply });
      saveTelegramSessions(sessions);

      const memory = result.memory || {};
      upsertConversation("tg-" + chatId, sessions[chatId].messages, memory, { source: "telegram" });

      await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text: result.reply })
      });
    } catch (err) {
      logger.warn("telegram", "Telegram mesaj isleme hatasi", err);
      saveTelegramSessions(sessions);
    }
  }

  // ── Polling ─────────────────────────────────────────────────────────────
  async function pollTelegram() {
    const TELEGRAM_ENABLED = getTelegramEnabled();
    const TELEGRAM_BOT_TOKEN = getTelegramBotToken();
    if (!TELEGRAM_ENABLED || !TELEGRAM_BOT_TOKEN) return;
    try {
      const resp = await fetch(
        `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getUpdates?offset=${telegramOffset}&timeout=10&allowed_updates=["message"]`
      );
      const data = await resp.json();
      if (data.ok && Array.isArray(data.result)) {
        for (const update of data.result) {
          telegramOffset = update.update_id + 1;
          await handleTelegramUpdate(update);
        }
      }
    } catch (err) {
      logger.warn("telegram", "Telegram polling hatasi", err);
    }
  }

  function startTelegramPolling() {
    const TELEGRAM_ENABLED = getTelegramEnabled();
    const TELEGRAM_BOT_TOKEN = getTelegramBotToken();
    if (!TELEGRAM_ENABLED || !TELEGRAM_BOT_TOKEN) return;
    logger.info("telegram", "Telegram polling baslatildi");
    const TELEGRAM_POLLING_INTERVAL_MS = getTelegramPollingIntervalMs();
    setInterval(pollTelegram, TELEGRAM_POLLING_INTERVAL_MS);
    pollTelegram();
  }

  // ── Inactivity Check ────────────────────────────────────────────────────
  function checkTelegramInactivity() {
    const TELEGRAM_ENABLED = getTelegramEnabled();
    const TELEGRAM_BOT_TOKEN = getTelegramBotToken();
    if (!TELEGRAM_ENABLED || !TELEGRAM_BOT_TOKEN) return;
    const chatFlowConfig = getChatFlowConfig();
    const sessions = loadTelegramSessions();
    const timeout = chatFlowConfig.inactivityTimeoutMs || 600000;
    const now = Date.now();
    let changed = false;

    for (const [chatId, session] of Object.entries(sessions)) {
      if (!session.lastActivity || session.closed) continue;
      const elapsed = now - session.lastActivity;

      if (elapsed >= timeout * 0.75 && !session.nudge75Sent) {
        const msg75 = chatFlowConfig.nudgeAt75Message || "Hala buradayım. Size nasıl yardımcı olabilirim?";
        sendTelegramMessage(chatId, msg75);
        session.nudge75Sent = true;
        changed = true;
      }
      if (elapsed >= timeout * 0.90 && !session.nudge90Sent) {
        const msg90 = chatFlowConfig.nudgeAt90Message || "Son birkaç dakikadır mesaj almadım. Yardımcı olabilir miyim?";
        sendTelegramMessage(chatId, msg90);
        session.nudge90Sent = true;
        changed = true;
      }
      if (elapsed >= timeout) {
        const closeMsg = chatFlowConfig.inactivityCloseMessage || "Uzun süredir mesaj almadığım için sohbeti sonlandırıyorum.";
        sendTelegramMessage(chatId, closeMsg);
        session.closed = true;
        session.messages = [];
        changed = true;
        upsertConversation("tg-" + chatId, [], {}, { source: "telegram", status: "closed" });
        recordAnalyticsEvent({ source: "chat-closed", reason: "inactivity" });
      }
    }

    if (changed) saveTelegramSessions(sessions);
  }

  return {
    startTelegramPolling,
    checkTelegramInactivity,
    sendTelegramMessage,
  };
}

module.exports = { createTelegramIntegration };

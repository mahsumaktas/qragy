// ── Webhook Management Service ──────────────────────────────────────────────
// Extracted from server.js — factory pattern with injected dependencies.

/**
 * @param {Object} deps
 * @param {import('fs')} deps.fs
 * @param {import('path')} deps.path
 * @param {import('crypto')} deps.crypto
 * @param {Object} deps.logger          — { warn(tag, msg, err) }
 * @param {string} deps.dataDir         — absolute path to data directory
 * @param {function} deps.nowIso        — () => ISO-8601 timestamp string
 */
function createWebhookService({ fs, path, crypto, logger, dataDir, nowIso }) {
  const WEBHOOKS_FILE = path.join(dataDir, "webhooks.json");
  const WEBHOOK_DELIVERY_LOG_FILE = path.join(dataDir, "webhook-delivery-log.json");

  function loadWebhooks() {
    try {
      if (fs.existsSync(WEBHOOKS_FILE)) {
        return JSON.parse(fs.readFileSync(WEBHOOKS_FILE, "utf8"));
      }
    } catch (err) { logger.warn("loadWebhooks", "Error", err); }
    return [];
  }

  function saveWebhooks(hooks) {
    fs.writeFileSync(WEBHOOKS_FILE, JSON.stringify(hooks, null, 2), "utf8");
  }

  // ── Webhook Delivery Log ────────────────────────────────────────────────
  function loadWebhookDeliveryLog() {
    try {
      if (fs.existsSync(WEBHOOK_DELIVERY_LOG_FILE)) return JSON.parse(fs.readFileSync(WEBHOOK_DELIVERY_LOG_FILE, "utf8"));
    } catch (err) { logger.warn("loadWebhookDeliveryLog", "Error", err); }
    return { deliveries: [] };
  }

  function saveWebhookDeliveryLog(data) {
    if (data.deliveries.length > 200) data.deliveries = data.deliveries.slice(-200);
    fs.writeFileSync(WEBHOOK_DELIVERY_LOG_FILE, JSON.stringify(data, null, 2), "utf8");
  }

  function recordWebhookDelivery(hookId, eventType, status, attempt, error) {
    const data = loadWebhookDeliveryLog();
    data.deliveries.push({
      hookId, eventType, status, attempt,
      error: error ? String(error).slice(0, 200) : "",
      timestamp: nowIso()
    });
    saveWebhookDeliveryLog(data);
  }

  async function fireWebhookWithRetry(hook, eventType, payload, maxRetries = 3) {
    const body = JSON.stringify({ event: eventType, data: payload, timestamp: new Date().toISOString() });
    const headers = { "Content-Type": "application/json" };
    if (hook.secret) {
      headers["X-Qragy-Signature"] = crypto.createHmac("sha256", hook.secret).update(body).digest("hex");
    }

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const controller = new AbortController();
        const tid = setTimeout(() => controller.abort(), 5000);
        const resp = await fetch(hook.url, { method: "POST", headers, body, signal: controller.signal });
        clearTimeout(tid);
        recordWebhookDelivery(hook.id, eventType, resp.ok ? "success" : "http_" + resp.status, attempt, resp.ok ? "" : "HTTP " + resp.status);
        if (resp.ok) return;
      } catch (err) {
        recordWebhookDelivery(hook.id, eventType, "error", attempt, err.message);
      }
      // Exponential backoff: 1s, 2s, 4s
      if (attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, attempt - 1)));
      }
    }
  }

  function fireWebhook(eventType, payload) {
    const hooks = loadWebhooks();
    let fired = 0;
    for (const hook of hooks) {
      if (!hook.active) continue;
      if (!hook.events.includes(eventType) && !hook.events.includes("*")) continue;
      if (fired >= 10) break; // Max 10 webhooks per event
      // Fire with retry (async, fire-and-forget)
      fireWebhookWithRetry(hook, eventType, payload).catch(() => {});
      fired++;
    }
  }

  return {
    loadWebhooks,
    saveWebhooks,
    loadWebhookDeliveryLog,
    saveWebhookDeliveryLog,
    recordWebhookDelivery,
    fireWebhook
  };
}

module.exports = { createWebhookService };

"use strict";

/**
 * Admin Webhook Routes — CRUD, test, deliveries
 */
function mount(app, deps) {
  const {
    requireAdminAccess,
    crypto,
    loadWebhooks,
    saveWebhooks,
    loadWebhookDeliveryLog,
    safeError,
  } = deps;

  // ── Webhooks: List ──────────────────────────────────────────────────────
  app.get("/api/admin/webhooks", requireAdminAccess, (_req, res) => {
    const hooks = loadWebhooks().map(h => ({
      ...h,
      secret: h.secret ? h.secret.slice(0, 4) + "****" + h.secret.slice(-4) : ""
    }));
    return res.json({ ok: true, webhooks: hooks });
  });

  // ── Webhooks: Create ────────────────────────────────────────────────────
  app.post("/api/admin/webhooks", requireAdminAccess, (req, res) => {
    const { url, events, secret } = req.body || {};
    if (!url) return res.status(400).json({ error: "url zorunludur." });
    const hooks = loadWebhooks();
    const hook = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      url,
      events: Array.isArray(events) ? events : ["*"],
      active: true,
      secret: secret || ""
    };
    hooks.push(hook);
    saveWebhooks(hooks);
    return res.json({ ok: true, webhook: hook });
  });

  // ── Webhooks: Update ────────────────────────────────────────────────────
  app.put("/api/admin/webhooks/:id", requireAdminAccess, (req, res) => {
    const hooks = loadWebhooks();
    const hook = hooks.find(h => h.id === req.params.id);
    if (!hook) return res.status(404).json({ error: "Webhook bulunamadi." });
    const { url, events, active, secret } = req.body || {};
    if (url !== undefined) hook.url = url;
    if (Array.isArray(events)) hook.events = events;
    if (typeof active === "boolean") hook.active = active;
    if (secret !== undefined) hook.secret = secret;
    saveWebhooks(hooks);
    return res.json({ ok: true, webhook: hook });
  });

  // ── Webhooks: Deliveries ────────────────────────────────────────────────
  app.get("/api/admin/webhooks/deliveries", requireAdminAccess, (_req, res) => {
    const data = loadWebhookDeliveryLog();
    return res.json({ ok: true, deliveries: (data.deliveries || []).slice(-50).reverse() });
  });

  // ── Webhooks: Delete ────────────────────────────────────────────────────
  app.delete("/api/admin/webhooks/:id", requireAdminAccess, (req, res) => {
    const hooks = loadWebhooks();
    const idx = hooks.findIndex(h => h.id === req.params.id);
    if (idx < 0) return res.status(404).json({ error: "Webhook bulunamadi." });
    hooks.splice(idx, 1);
    saveWebhooks(hooks);
    return res.json({ ok: true });
  });

  // ── Webhooks: Test ──────────────────────────────────────────────────────
  app.post("/api/admin/webhooks/:id/test", requireAdminAccess, async (req, res) => {
    const hooks = loadWebhooks();
    const hook = hooks.find(h => h.id === req.params.id);
    if (!hook) return res.status(404).json({ error: "Webhook bulunamadi." });
    try {
      const body = JSON.stringify({ event: "test", data: { message: "Qragy webhook test" }, timestamp: new Date().toISOString() });
      const headers = { "Content-Type": "application/json" };
      if (hook.secret) {
        headers["X-Qragy-Signature"] = crypto.createHmac("sha256", hook.secret).update(body).digest("hex");
      }
      const resp = await fetch(hook.url, { method: "POST", headers, body });
      return res.json({ ok: true, status: resp.status });
    } catch (err) {
      return res.json({ ok: false, error: safeError(err, "webhook-test") });
    }
  });
}

module.exports = { mount };

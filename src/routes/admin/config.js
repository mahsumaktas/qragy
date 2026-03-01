"use strict";

/**
 * Admin Config Routes — chat flow, site branding, logo upload, sunshine config
 */
function mount(app, deps) {
  const {
    requireAdminAccess,
    express,
    fs,
    path,
    getChatFlowConfig,
    saveChatFlowConfig,
    DEFAULT_CHAT_FLOW_CONFIG,
    getSiteConfig,
    saveSiteConfig,
    DEFAULT_SITE_CONFIG,
    getSunshineConfig,
    saveSunshineConfig,
    DEFAULT_SUNSHINE_CONFIG,
    getZendeskScVars,
    setZendeskScEnabled,
    safeError,
    AGENT_DIR,
  } = deps;

  const LOGO_ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/svg+xml", "image/webp", "image/gif"]);

  // ── Chat Flow Config ────────────────────────────────────────────────────
  app.get("/api/admin/chat-flow", requireAdminAccess, (_req, res) => {
    res.json({ ok: true, config: getChatFlowConfig(), defaults: DEFAULT_CHAT_FLOW_CONFIG });
  });

  app.put("/api/admin/chat-flow", requireAdminAccess, (req, res) => {
    try {
      const updates = req.body?.config;
      if (!updates || typeof updates !== "object") {
        return res.status(400).json({ error: "config objesi zorunludur." });
      }
      const allowed = Object.keys(DEFAULT_CHAT_FLOW_CONFIG);
      const clean = {};
      for (const key of allowed) {
        if (updates[key] !== undefined) {
          clean[key] = updates[key];
        }
      }
      saveChatFlowConfig(clean);
      res.json({ ok: true, config: getChatFlowConfig() });
    } catch (err) {
      res.status(500).json({ error: safeError(err, "api") });
    }
  });

  // ── Site Config ─────────────────────────────────────────────────────────
  app.get("/api/admin/site-config", requireAdminAccess, (_req, res) => {
    res.json({ ok: true, config: getSiteConfig(), defaults: DEFAULT_SITE_CONFIG });
  });

  app.put("/api/admin/site-config", requireAdminAccess, (req, res) => {
    try {
      const updates = req.body?.config;
      if (!updates || typeof updates !== "object") {
        return res.status(400).json({ error: "config objesi zorunludur." });
      }
      const allowed = Object.keys(DEFAULT_SITE_CONFIG);
      const clean = {};
      for (const key of allowed) {
        if (updates[key] !== undefined) {
          clean[key] = updates[key];
        }
      }
      saveSiteConfig(clean);
      res.json({ ok: true, config: getSiteConfig() });
    } catch (err) {
      res.status(500).json({ error: safeError(err, "api") });
    }
  });

  // ── Logo Upload ─────────────────────────────────────────────────────────
  app.post("/api/admin/site-logo", requireAdminAccess, express.raw({ type: ["image/jpeg", "image/png", "image/svg+xml", "image/webp", "image/gif"], limit: "2mb" }), (req, res) => {
    try {
      const contentType = req.headers["content-type"] || "";
      if (!LOGO_ALLOWED_TYPES.has(contentType)) {
        return res.status(400).json({ error: "Desteklenmeyen dosya tipi. JPEG, PNG, SVG, WebP veya GIF kullanin." });
      }
      const ext = contentType.split("/")[1] === "svg+xml" ? "svg" : contentType.split("/")[1];
      const logoPath = path.join(path.dirname(AGENT_DIR), "public", "custom-logo." + ext);
      for (const old of ["custom-logo.jpeg", "custom-logo.png", "custom-logo.svg", "custom-logo.webp", "custom-logo.gif"]) {
        const oldPath = path.join(path.dirname(AGENT_DIR), "public", old);
        if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
      }
      fs.writeFileSync(logoPath, req.body);
      const logoUrl = "custom-logo." + ext;
      saveSiteConfig({ logoUrl });
      res.json({ ok: true, logoUrl });
    } catch (err) {
      res.status(500).json({ error: safeError(err, "api") });
    }
  });

  // ── Sunshine Config ─────────────────────────────────────────────────────
  app.get("/api/admin/sunshine-config", requireAdminAccess, (req, res) => {
    const sunshineConfigVal = getSunshineConfig();
    const masked = { ...sunshineConfigVal };
    if (masked.keySecret) masked.keySecret = masked.keySecret.slice(0, 4) + "****" + masked.keySecret.slice(-4);
    if (masked.webhookSecret) masked.webhookSecret = masked.webhookSecret.slice(0, 4) + "****" + masked.webhookSecret.slice(-4);
    // Webhook URL — PUBLIC_URL env'den al (reverse proxy prefix dahil)
    const publicUrl = (process.env.PUBLIC_URL || "").replace(/\/+$/, "");
    masked.webhookUrl = publicUrl
      ? `${publicUrl}/api/sunshine/webhook`
      : `${req.protocol}://${req.headers.host || "localhost:3001"}/api/sunshine/webhook`;
    res.json({ ok: true, config: masked, defaults: DEFAULT_SUNSHINE_CONFIG });
  });

  app.put("/api/admin/sunshine-config", requireAdminAccess, (req, res) => {
    try {
      const updates = req.body?.config;
      if (!updates || typeof updates !== "object") {
        return res.status(400).json({ error: "config objesi zorunludur." });
      }
      const allowed = Object.keys(DEFAULT_SUNSHINE_CONFIG);
      const clean = {};
      for (const key of allowed) {
        if (updates[key] !== undefined) {
          if (typeof updates[key] === "string" && updates[key].includes("****")) continue;
          clean[key] = updates[key];
        }
      }
      saveSunshineConfig(clean);
      if (clean.enabled !== undefined) setZendeskScEnabled(Boolean(clean.enabled));
      res.json({ ok: true, config: getSunshineConfig() });
    } catch (err) {
      res.status(500).json({ error: safeError(err, "api") });
    }
  });

  // ── Sunshine Helpers ────────────────────────────────────────────────────
  const ZD_ANSWER_BOT = "zd:answerBot";
  const ZD_AGENT_WORKSPACE = "zd:agentWorkspace";
  const ZD_BUILTIN_TYPES = new Set([ZD_ANSWER_BOT, ZD_AGENT_WORKSPACE]);

  function resolveSunshineCredentials() {
    const cfg = getSunshineConfig();
    const env = getZendeskScVars();
    const appId = cfg.appId || env.ZENDESK_SC_APP_ID;
    const keyId = cfg.keyId || env.ZENDESK_SC_KEY_ID;
    const keySecret = cfg.keySecret || env.ZENDESK_SC_KEY_SECRET;
    const subdomain = cfg.subdomain || env.ZENDESK_SC_SUBDOMAIN;
    if (!appId || !keyId || !keySecret || !subdomain) return null;
    const baseUrl = "https://" + subdomain + ".zendesk.com/sc/v2";
    const headers = {
      "Authorization": "Basic " + Buffer.from(keyId + ":" + keySecret).toString("base64"),
      "Content-Type": "application/json"
    };
    return { appId, baseUrl, headers };
  }

  async function zdFetch(url, opts, label) {
    const resp = await fetch(url, opts);
    if (!resp.ok) {
      const errText = await resp.text().catch(() => "");
      return { ok: false, error: label + ": HTTP " + resp.status + " " + errText.slice(0, 200) };
    }
    const data = await resp.json().catch(() => ({}));
    return { ok: true, data };
  }

  // ── Switchboard Auto-Setup ──────────────────────────────────────────────
  app.post("/api/admin/sunshine-config/setup-switchboard", requireAdminAccess, async (_req, res) => {
    try {
      const creds = resolveSunshineCredentials();
      if (!creds) return res.json({ ok: false, error: "Eksik ayarlar: once baglanti bilgilerini girin ve test edin." });
      const { appId, baseUrl, headers: hdrs } = creds;

      // 1. Switchboard listele
      const swResult = await zdFetch(baseUrl + "/apps/" + appId + "/switchboards", { headers: hdrs }, "Switchboard listelenemedi");
      if (!swResult.ok) return res.json(swResult);
      const switchboards = swResult.data.switchboards || [];
      if (!switchboards.length) return res.json({ ok: false, error: "Switchboard bulunamadi. Zendesk'te Switchboard'u aktif edin." });
      const switchboardId = switchboards[0].id || switchboards[0]._id;

      // 2. Switchboard entegrasyonlarini listele
      const siResult = await zdFetch(baseUrl + "/apps/" + appId + "/switchboards/" + switchboardId + "/switchboardIntegrations", { headers: hdrs }, "Switchboard entegrasyonlari listelenemedi");
      if (!siResult.ok) return res.json(siResult);
      const swIntegrations = siResult.data.switchboardIntegrations || [];

      // 3. App entegrasyonlarini listele
      const intResult = await zdFetch(baseUrl + "/apps/" + appId + "/integrations", { headers: hdrs }, "Entegrasyonlar listelenemedi");
      if (!intResult.ok) return res.json(intResult);
      const integrations = intResult.data.integrations || [];

      // answerBot ve agentWorkspace bul
      const agentWorkspace = swIntegrations.find(i => i.name === "zd-agentWorkspace" || i.integrationType === ZD_AGENT_WORKSPACE);
      if (!agentWorkspace) return res.json({ ok: false, error: "agentWorkspace bulunamadi. Zendesk Switchboard'da Agent Workspace aktif olmali." });
      const agentWorkspaceSwId = agentWorkspace.id || agentWorkspace._id;

      const answerBot = swIntegrations.find(i => i.name === "zd-answerBot" || i.integrationType === ZD_ANSWER_BOT);

      // Custom bot entegrasyonunu bul (Zendesk built-in olmayan)
      const customInt = integrations.find(i => !ZD_BUILTIN_TYPES.has(i.type) && i.status !== "inactive");
      if (!customInt) return res.json({ ok: false, error: "Ozel bot entegrasyonu bulunamadi. Zendesk'te bir Custom/API entegrasyonu olusturun." });
      const customIntId = customInt.id || customInt._id;

      // Bot zaten switchboard'da mi?
      const swBase = baseUrl + "/apps/" + appId + "/switchboards/" + switchboardId + "/switchboardIntegrations";
      const existingBot = swIntegrations.find(i => i.integrationId === customIntId);
      let botSwId;

      if (existingBot) {
        botSwId = existingBot.id || existingBot._id;
        const r = await zdFetch(swBase + "/" + botSwId, {
          method: "PATCH", headers: hdrs,
          body: JSON.stringify({ nextSwitchboardIntegrationId: agentWorkspaceSwId })
        }, "Bot entegrasyonu guncellenemedi");
        if (!r.ok) return res.json(r);
      } else {
        const r = await zdFetch(swBase, {
          method: "POST", headers: hdrs,
          body: JSON.stringify({
            name: customInt.displayName || "qragy-bot",
            integrationId: customIntId,
            nextSwitchboardIntegrationId: agentWorkspaceSwId,
            deliverStandbyEvents: false
          })
        }, "Bot switchboard'a eklenemedi");
        if (!r.ok) return res.json(r);
        botSwId = (r.data.switchboardIntegration || {}).id || (r.data.switchboardIntegration || {})._id;
      }

      // answerBot → bot yonlendirmesi
      if (answerBot) {
        const answerBotSwId = answerBot.id || answerBot._id;
        const r = await zdFetch(swBase + "/" + answerBotSwId, {
          method: "PATCH", headers: hdrs,
          body: JSON.stringify({ nextSwitchboardIntegrationId: botSwId })
        }, "answerBot yonlendirmesi guncellenemedi");
        if (!r.ok) return res.json(r);
      }

      const chain = answerBot ? "answerBot -> Qragy Bot -> agentWorkspace" : "Qragy Bot -> agentWorkspace";
      res.json({ ok: true, message: "Switchboard yapilandirildi! Zincir: " + chain });
    } catch (err) {
      res.json({ ok: false, error: safeError(err, "switchboard-setup") });
    }
  });

  app.post("/api/admin/sunshine-config/test", requireAdminAccess, async (_req, res) => {
    try {
      const creds = resolveSunshineCredentials();
      if (!creds) return res.json({ ok: false, error: "Eksik ayarlar: appId, keyId, keySecret ve subdomain zorunludur." });

      const resp = await fetch(creds.baseUrl + "/apps/" + creds.appId, {
        method: "GET",
        headers: creds.headers
      });

      if (resp.ok) {
        res.json({ ok: true, message: "Baglanti basarili! Sunshine Conversations API erisimi dogrulandi." });
      } else {
        const errText = await resp.text().catch(() => "");
        res.json({ ok: false, error: "API hatasi: " + resp.status + " " + errText.slice(0, 200) });
      }
    } catch (err) {
      res.json({ ok: false, error: safeError(err, "connection-test") });
    }
  });
}

module.exports = { mount };

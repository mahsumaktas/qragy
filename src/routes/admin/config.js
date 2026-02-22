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
  app.get("/api/admin/sunshine-config", requireAdminAccess, (_req, res) => {
    const sunshineConfigVal = getSunshineConfig();
    const masked = { ...sunshineConfigVal };
    if (masked.keySecret) masked.keySecret = masked.keySecret.slice(0, 4) + "****" + masked.keySecret.slice(-4);
    if (masked.webhookSecret) masked.webhookSecret = masked.webhookSecret.slice(0, 4) + "****" + masked.webhookSecret.slice(-4);
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

  app.post("/api/admin/sunshine-config/test", requireAdminAccess, async (_req, res) => {
    try {
      const sunshineConfigVal = getSunshineConfig();
      const scVars = getZendeskScVars();
      const appId = sunshineConfigVal.appId || scVars.ZENDESK_SC_APP_ID;
      const keyId = sunshineConfigVal.keyId || scVars.ZENDESK_SC_KEY_ID;
      const keySecret = sunshineConfigVal.keySecret || scVars.ZENDESK_SC_KEY_SECRET;
      const subdomain = sunshineConfigVal.subdomain || scVars.ZENDESK_SC_SUBDOMAIN;

      if (!appId || !keyId || !keySecret || !subdomain) {
        return res.json({ ok: false, error: "Eksik ayarlar: appId, keyId, keySecret ve subdomain zorunludur." });
      }

      const url = "https://" + subdomain + ".zendesk.com/sc/v2/apps/" + appId;
      const resp = await fetch(url, {
        method: "GET",
        headers: { "Authorization": "Basic " + Buffer.from(keyId + ":" + keySecret).toString("base64") }
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

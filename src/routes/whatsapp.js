"use strict";

function mount(app, deps) {
  const { requireAdminAccess, getWhatsAppConfig, saveWhatsAppConfig } = deps;

  app.get("/api/admin/whatsapp", requireAdminAccess, (req, res) => {
    const config = getWhatsAppConfig();
    // Mask access token for security
    const masked = { ...config };
    if (masked.accessToken) {
      masked.accessToken = masked.accessToken.slice(0, 8) + "..." + masked.accessToken.slice(-4);
    }
    // Webhook URL — PUBLIC_URL env'den al (reverse proxy prefix dahil)
    const publicUrl = (process.env.PUBLIC_URL || "").replace(/\/+$/, "");
    masked.webhookUrl = publicUrl
      ? `${publicUrl}/api/webhooks/whatsapp`
      : `${req.protocol}://${req.headers.host || "localhost:3001"}/api/webhooks/whatsapp`;
    res.json({ ok: true, config: masked });
  });

  app.put("/api/admin/whatsapp", requireAdminAccess, (req, res) => {
    const body = req.body || {};
    const currentConfig = getWhatsAppConfig();
    const rawAccessToken = (body.accessToken || "").trim();
    const accessToken =
      rawAccessToken.includes("...") && currentConfig.accessToken
        ? currentConfig.accessToken
        : rawAccessToken;

    saveWhatsAppConfig({
      enabled: Boolean(body.enabled),
      phoneNumberId: (body.phoneNumberId || "").trim(),
      accessToken,
      verifyToken: (body.verifyToken || "").trim(),
    });
    res.json({ ok: true });
  });
}

module.exports = { mount };

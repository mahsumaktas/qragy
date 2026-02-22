"use strict";

function mount(app, deps) {
  const { requireAdminAccess, getWhatsAppConfig, saveWhatsAppConfig } = deps;

  app.get("/api/admin/whatsapp", requireAdminAccess, (_req, res) => {
    const config = getWhatsAppConfig();
    // Mask access token for security
    const masked = { ...config };
    if (masked.accessToken) {
      masked.accessToken = masked.accessToken.slice(0, 8) + "..." + masked.accessToken.slice(-4);
    }
    res.json({ ok: true, config: masked });
  });

  app.put("/api/admin/whatsapp", requireAdminAccess, (req, res) => {
    const body = req.body || {};
    saveWhatsAppConfig({
      enabled: Boolean(body.enabled),
      phoneNumberId: (body.phoneNumberId || "").trim(),
      accessToken: (body.accessToken || "").trim(),
      verifyToken: (body.verifyToken || "").trim(),
    });
    res.json({ ok: true });
  });
}

module.exports = { mount };

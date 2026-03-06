"use strict";

const { createAdminContentCopilot } = require("../../services/adminContentCopilot");
const { adminError } = require("../../utils/adminLocale");

function mount(app, deps) {
  const {
    requireAdminAccess,
    safeError,
    recordAuditEvent,
  } = deps;

  const copilot = createAdminContentCopilot(deps);

  app.post("/api/admin/copilot/review", requireAdminAccess, (req, res) => {
    try {
      const { surface, locale, selection } = req.body || {};
      if (!surface || !["knowledge", "topics", "bot-settings"].includes(surface)) {
        return adminError(res, req, 400, "copilot.surfaceRequired");
      }

      const review = copilot.reviewSurface({
        surface,
        selection: selection || null,
        locale: locale || "tr",
        limit: 24,
      });

      if (!review) {
        return adminError(res, req, 400, "copilot.unsupportedSurface");
      }

      recordAuditEvent?.("copilot_review", { surface, selection: selection || null }, req.ip);
      return res.json({ ok: true, review });
    } catch (err) {
      return res.status(500).json({ error: safeError(err, "api") });
    }
  });

  app.post("/api/admin/copilot/draft", requireAdminAccess, async (req, res) => {
    try {
      const { surface, locale, target, goal } = req.body || {};
      if (!surface || !["knowledge", "topics", "bot-settings"].includes(surface)) {
        return adminError(res, req, 400, "copilot.surfaceRequired");
      }
      if (!target || typeof target !== "object") {
        return adminError(res, req, 400, "copilot.targetRequired");
      }

      const draft = await copilot.buildDraft({
        surface,
        locale: locale || "tr",
        target,
        goal: typeof goal === "string" ? goal : "",
      });

      if (!draft) {
        return res.json({
          ok: true,
          draft: null,
          error: locale === "en"
            ? "AI draft could not be generated. Review data is still available."
            : "AI taslak üretilemedi. İnceleme verisi yine kullanılabilir.",
        });
      }

      recordAuditEvent?.("copilot_draft", { surface, target, goal: goal || "" }, req.ip);
      return res.json({ ok: true, draft });
    } catch (err) {
      return res.status(500).json({ error: safeError(err, "api") });
    }
  });
}

module.exports = { mount };

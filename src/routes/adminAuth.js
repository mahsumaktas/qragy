"use strict";

function normalizeRedirectPath(value, fallback = "/corpcx/admin/") {
  const raw = String(value || "").trim();
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) {
    return fallback;
  }
  return raw;
}

function withQueryFlag(pathname, key, value) {
  try {
    const url = new URL(pathname, "http://qragy.local");
    url.searchParams.set(key, value);
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    const separator = pathname.includes("?") ? "&" : "?";
    return `${pathname}${separator}${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
  }
}

function mount(app, deps) {
  const {
    requireAdminAccess,
    trustedAdminAuth,
    logger,
  } = deps;

  const getAuthContext = typeof requireAdminAccess.getAuthContext === "function"
    ? requireAdminAccess.getAuthContext
    : () => null;

  app.get("/api/admin/session", (req, res) => {
    const auth = getAuthContext(req);
    if (auth) {
      return res.json({
        ok: true,
        authenticated: true,
        authType: auth.type,
        user: auth.email ? {
          email: auth.email,
          name: auth.name || "",
          role: auth.role || "admin",
          permissions: Array.isArray(auth.permissions) ? auth.permissions : [],
          workspace: auth.workspace || "",
        } : null,
      });
    }

    return res.json({
      ok: true,
      authenticated: false,
      ssoAvailable: trustedAdminAuth.isSsoConfigured(),
      candidateEmail: trustedAdminAuth.getCandidateSsoEmail(req) || null,
    });
  });

  app.post("/api/admin/logout", (req, res) => {
    trustedAdminAuth.clearSession(res, req);
    return res.json({ ok: true });
  });

  app.get("/api/admin/sso/login", async (req, res) => {
    const redirectPath = normalizeRedirectPath(req.query?.redirect, "/corpcx/admin/");

    try {
      const session = trustedAdminAuth.getSessionAuthContext(req) || await trustedAdminAuth.authenticateWithSso(req);
      trustedAdminAuth.setSession(res, req, session);
      logger.info("admin-sso", "Admin SSO session created", {
        email: session.email,
        workspace: session.workspace,
      });
      return res.redirect(302, redirectPath);
    } catch (error) {
      trustedAdminAuth.clearSession(res, req);
      logger.warn("admin-sso", "Admin SSO login failed", {
        code: error?.code || "unknown",
        message: error?.message || "unknown error",
        email: trustedAdminAuth.getCandidateSsoEmail(req) || "",
      });
      return res.redirect(302, withQueryFlag(redirectPath, "auth_error", error?.code || "login_failed"));
    }
  });
}

module.exports = { mount };

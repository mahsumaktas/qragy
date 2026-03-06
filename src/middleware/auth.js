// src/middleware/auth.js
const crypto = require("crypto");
const { adminError } = require("../utils/adminLocale");

function resolveOptions(input) {
  if (typeof input === "function") {
    return {
      getAdminToken: input,
      getTrustedSessionAuth: () => null,
      isTrustedSessionConfigured: () => false,
    };
  }

  return {
    getAdminToken: input?.getAdminToken || (() => ""),
    getTrustedSessionAuth: input?.getTrustedSessionAuth || (() => null),
    isTrustedSessionConfigured: input?.isTrustedSessionConfigured || (() => false),
  };
}

function isValidToken(candidate, adminToken) {
  if (!candidate || !adminToken || candidate.length !== adminToken.length) {
    return false;
  }

  const candidateBuf = Buffer.from(candidate);
  const tokenBuf = Buffer.from(adminToken);
  return crypto.timingSafeEqual(candidateBuf, tokenBuf);
}

function createAuthMiddleware(input) {
  const {
    getAdminToken,
    getTrustedSessionAuth,
    isTrustedSessionConfigured,
  } = resolveOptions(input);

  function getAuthContext(req) {
    const adminToken = String(getAdminToken() || "").trim();
    const headerToken = String(req.headers["x-admin-token"] || "").trim();
    const queryToken = String(req.query?.token || "").trim();
    const candidate = headerToken || queryToken;

    if (candidate && adminToken && isValidToken(candidate, adminToken)) {
      return {
        type: "token",
        source: "admin-token",
      };
    }

    return getTrustedSessionAuth(req);
  }

  function requireAdminAccess(req, res, next) {
    const adminToken = String(getAdminToken() || "").trim();
    const trustedSessionConfigured = Boolean(isTrustedSessionConfigured());
    const authContext = getAuthContext(req);

    if (!adminToken && !trustedSessionConfigured) {
      return adminError(res, req, 503, "auth.notConfigured");
    }

    if (!authContext) {
      return adminError(res, req, 401, "auth.tokenRequired");
    }

    req.adminAuth = authContext;
    next();
  }

  requireAdminAccess.getAuthContext = getAuthContext;
  return requireAdminAccess;
}

module.exports = { createAuthMiddleware };

// src/middleware/auth.js
const crypto = require("crypto");
const { adminError } = require("../utils/adminLocale");

function createAuthMiddleware(getAdminToken) {
  return function requireAdminAccess(req, res, next) {
    const adminToken = getAdminToken();

    if (!adminToken) {
      return adminError(res, req, 503, "auth.notConfigured");
    }

    const headerToken = String(req.headers["x-admin-token"] || "").trim();
    const queryToken = String(req.query.token || "").trim();
    const candidate = headerToken || queryToken;

    if (!candidate || candidate.length !== adminToken.length) {
      return adminError(res, req, 401, "auth.tokenRequired");
    }

    const candidateBuf = Buffer.from(candidate);
    const tokenBuf = Buffer.from(adminToken);

    if (!crypto.timingSafeEqual(candidateBuf, tokenBuf)) {
      return adminError(res, req, 401, "auth.tokenRequired");
    }

    next();
  };
}

module.exports = { createAuthMiddleware };

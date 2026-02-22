// src/middleware/auth.js
const crypto = require("crypto");

function createAuthMiddleware(getAdminToken) {
  return function requireAdminAccess(req, res, next) {
    const adminToken = getAdminToken();

    if (!adminToken) {
      return res
        .status(503)
        .json({ error: "Admin panel yapilandirilmamis. ADMIN_TOKEN ayarlayin." });
    }

    const headerToken = String(req.headers["x-admin-token"] || "").trim();
    const queryToken = String(req.query.token || "").trim();
    const candidate = headerToken || queryToken;

    if (!candidate || candidate.length !== adminToken.length) {
      return res
        .status(401)
        .json({ error: "Admin erisimi icin token gerekli." });
    }

    const candidateBuf = Buffer.from(candidate);
    const tokenBuf = Buffer.from(adminToken);

    if (!crypto.timingSafeEqual(candidateBuf, tokenBuf)) {
      return res
        .status(401)
        .json({ error: "Admin erisimi icin token gerekli." });
    }

    next();
  };
}

module.exports = { createAuthMiddleware };

"use strict";

const crypto = require("crypto");

const DEFAULT_COOKIE_NAME = "qragy_admin_session";
const DEFAULT_SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const DEFAULT_JWKS_TTL_MS = 5 * 60 * 1000;
const DEFAULT_FETCH_TIMEOUT_MS = 8000;

function base64UrlEncode(value) {
  return Buffer.from(value)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64UrlDecode(value) {
  const normalized = String(value || "")
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const padding = normalized.length % 4;
  const padded = padding ? normalized + "=".repeat(4 - padding) : normalized;
  return Buffer.from(padded, "base64");
}

function parseJsonBuffer(buffer) {
  return JSON.parse(buffer.toString("utf8"));
}

function parseCookies(headerValue) {
  const raw = String(headerValue || "");
  if (!raw) return {};
  return raw.split(";").reduce((acc, pair) => {
    const idx = pair.indexOf("=");
    if (idx === -1) return acc;
    const key = pair.slice(0, idx).trim();
    const value = pair.slice(idx + 1).trim();
    if (key) acc[key] = decodeURIComponent(value);
    return acc;
  }, {});
}

function serializeCookie(name, value, options = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`];
  if (options.maxAge !== undefined) parts.push(`Max-Age=${Math.max(0, Math.floor(options.maxAge))}`);
  if (options.path) parts.push(`Path=${options.path}`);
  if (options.httpOnly !== false) parts.push("HttpOnly");
  if (options.sameSite) parts.push(`SameSite=${options.sameSite}`);
  if (options.secure) parts.push("Secure");
  if (options.expires) parts.push(`Expires=${options.expires.toUTCString()}`);
  return parts.join("; ");
}

function appendSetCookie(res, cookieValue) {
  const existing = res.getHeader("Set-Cookie");
  if (!existing) {
    res.setHeader("Set-Cookie", cookieValue);
    return;
  }
  const next = Array.isArray(existing) ? [...existing, cookieValue] : [existing, cookieValue];
  res.setHeader("Set-Cookie", next);
}

function createAuthError(code, message, status = 401, meta = {}) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  error.meta = meta;
  return error;
}

function createHmacSignature(secret, payload) {
  return base64UrlEncode(crypto.createHmac("sha256", secret).update(payload).digest());
}

async function fetchJsonWithTimeout(fetchImpl, url, options = {}, timeoutMs = DEFAULT_FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, { ...options, signal: controller.signal });
    const payload = await response.json().catch(() => ({}));
    return { response, payload };
  } finally {
    clearTimeout(timer);
  }
}

function createAdminTrustedAuth(options = {}) {
  const fetchImpl = options.fetchImpl || fetch;
  const getCookieName = options.getCookieName || (() => DEFAULT_COOKIE_NAME);
  const getSessionSecret = options.getSessionSecret || (() => "");
  const getSessionTtlMs = options.getSessionTtlMs || (() => DEFAULT_SESSION_TTL_MS);
  const getCloudflareTeamDomain = options.getCloudflareTeamDomain || (() => "");
  const getCloudflareAudience = options.getCloudflareAudience || (() => "");
  const getWorkspaceAccessUrl = options.getWorkspaceAccessUrl || (() => "");
  const getWorkspaceAccessSecret = options.getWorkspaceAccessSecret || (() => "");
  const getWorkspaceKey = options.getWorkspaceKey || (() => "corpcx");
  const getJwksTtlMs = options.getJwksTtlMs || (() => DEFAULT_JWKS_TTL_MS);

  const jwksCache = new Map();

  function getNormalizedCookieName() {
    return String(getCookieName() || DEFAULT_COOKIE_NAME).trim() || DEFAULT_COOKIE_NAME;
  }

  function isSessionConfigured() {
    return Boolean(String(getSessionSecret() || "").trim());
  }

  function isSsoConfigured() {
    return Boolean(
      isSessionConfigured()
      && String(getCloudflareTeamDomain() || "").trim()
      && String(getCloudflareAudience() || "").trim()
      && String(getWorkspaceAccessUrl() || "").trim()
      && String(getWorkspaceAccessSecret() || "").trim()
      && String(getWorkspaceKey() || "").trim()
    );
  }

  async function getJwks(teamDomain) {
    const cacheKey = String(teamDomain || "").trim();
    const cached = jwksCache.get(cacheKey);
    const now = Date.now();
    if (cached && cached.expiresAt > now) {
      return cached.payload;
    }

    const url = `https://${cacheKey}/cdn-cgi/access/certs`;
    const { response, payload } = await fetchJsonWithTimeout(fetchImpl, url, {}, DEFAULT_FETCH_TIMEOUT_MS);
    if (!response.ok || !Array.isArray(payload?.keys) || payload.keys.length === 0) {
      throw createAuthError("cf_jwks_unavailable", "Cloudflare signing keys could not be loaded.", 503);
    }
    jwksCache.set(cacheKey, { payload, expiresAt: now + Number(getJwksTtlMs() || DEFAULT_JWKS_TTL_MS) });
    return payload;
  }

  async function verifyCloudflareJwt(token) {
    const teamDomain = String(getCloudflareTeamDomain() || "").trim();
    const audience = String(getCloudflareAudience() || "").trim();
    if (!teamDomain || !audience) {
      throw createAuthError("sso_not_configured", "Cloudflare SSO is not configured.", 503);
    }

    const [encodedHeader, encodedPayload, encodedSignature] = String(token || "").split(".");
    if (!encodedHeader || !encodedPayload || !encodedSignature) {
      throw createAuthError("invalid_cf_token", "Invalid Cloudflare Access token.");
    }

    let header;
    let payload;
    try {
      header = parseJsonBuffer(base64UrlDecode(encodedHeader));
      payload = parseJsonBuffer(base64UrlDecode(encodedPayload));
    } catch {
      throw createAuthError("invalid_cf_token", "Invalid Cloudflare Access token.");
    }

    if (header.alg !== "RS256" || !header.kid) {
      throw createAuthError("invalid_cf_token", "Unsupported Cloudflare Access token.");
    }

    const jwks = await getJwks(teamDomain);
    const jwk = (jwks.keys || []).find((item) => item.kid === header.kid);
    if (!jwk) {
      throw createAuthError("invalid_cf_token", "Cloudflare signing key was not found.");
    }

    let publicKey;
    try {
      publicKey = crypto.createPublicKey({ key: jwk, format: "jwk" });
    } catch {
      throw createAuthError("invalid_cf_token", "Cloudflare signing key is invalid.");
    }

    const verifier = crypto.createVerify("RSA-SHA256");
    verifier.update(`${encodedHeader}.${encodedPayload}`);
    verifier.end();
    const signature = base64UrlDecode(encodedSignature);
    if (!verifier.verify(publicKey, signature)) {
      throw createAuthError("invalid_cf_token", "Cloudflare Access token signature is invalid.");
    }

    const issuer = `https://${teamDomain}`;
    const nowSeconds = Math.floor(Date.now() / 1000);
    if (payload.iss !== issuer) {
      throw createAuthError("invalid_cf_token", "Cloudflare Access token issuer is invalid.");
    }
    const audiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud].filter(Boolean);
    if (!audiences.includes(audience)) {
      throw createAuthError("invalid_cf_token", "Cloudflare Access token audience is invalid.");
    }
    if (typeof payload.exp !== "number" || payload.exp <= nowSeconds) {
      throw createAuthError("invalid_cf_token", "Cloudflare Access token has expired.");
    }
    if (typeof payload.iat !== "number" || payload.iat > nowSeconds + 60) {
      throw createAuthError("invalid_cf_token", "Cloudflare Access token issue time is invalid.");
    }

    return payload;
  }

  function buildSessionToken(session) {
    const secret = String(getSessionSecret() || "").trim();
    if (!secret) return "";
    const now = Date.now();
    const ttlMs = Math.max(60 * 1000, Number(getSessionTtlMs() || DEFAULT_SESSION_TTL_MS));
    const payload = {
      email: String(session.email || "").trim().toLowerCase(),
      name: String(session.name || "").trim(),
      role: String(session.role || "admin").trim() || "admin",
      permissions: Array.isArray(session.permissions) ? session.permissions : [],
      workspace: String(session.workspace || getWorkspaceKey() || "corpcx").trim() || "corpcx",
      source: String(session.source || "ocp-sso").trim() || "ocp-sso",
      iat: now,
      exp: now + ttlMs,
    };
    const encodedPayload = base64UrlEncode(JSON.stringify(payload));
    const signature = createHmacSignature(secret, encodedPayload);
    return `${encodedPayload}.${signature}`;
  }

  function verifySessionToken(token) {
    const secret = String(getSessionSecret() || "").trim();
    if (!secret) return null;
    const [encodedPayload, signature] = String(token || "").split(".");
    if (!encodedPayload || !signature) return null;
    const expected = createHmacSignature(secret, encodedPayload);
    const signatureBuf = Buffer.from(signature);
    const expectedBuf = Buffer.from(expected);
    if (signatureBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(signatureBuf, expectedBuf)) {
      return null;
    }

    try {
      const payload = parseJsonBuffer(base64UrlDecode(encodedPayload));
      if (!payload?.email || typeof payload.exp !== "number" || payload.exp <= Date.now()) {
        return null;
      }
      return payload;
    } catch {
      return null;
    }
  }

  function getSession(req) {
    const cookies = parseCookies(req?.headers?.cookie || "");
    const token = cookies[getNormalizedCookieName()];
    return token ? verifySessionToken(token) : null;
  }

  function isSecureRequest(req) {
    const forwardedProto = String(req?.headers?.["x-forwarded-proto"] || "").trim().toLowerCase();
    return forwardedProto === "https" || (process.env.NODE_ENV || "").toLowerCase() === "production";
  }

  function setSession(res, req, session) {
    const token = buildSessionToken(session);
    if (!token) return;
    const ttlSeconds = Math.max(60, Math.floor(Math.max(60 * 1000, Number(getSessionTtlMs() || DEFAULT_SESSION_TTL_MS)) / 1000));
    appendSetCookie(res, serializeCookie(getNormalizedCookieName(), token, {
      maxAge: ttlSeconds,
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
      secure: isSecureRequest(req),
    }));
  }

  function clearSession(res, req) {
    appendSetCookie(res, serializeCookie(getNormalizedCookieName(), "", {
      maxAge: 0,
      expires: new Date(0),
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
      secure: isSecureRequest(req),
    }));
  }

  function getCandidateSsoEmail(req) {
    return String(req?.headers?.["cf-access-authenticated-user-email"] || "").trim().toLowerCase();
  }

  function getSessionAuthContext(req) {
    const session = getSession(req);
    if (!session) return null;
    return {
      type: "trusted-session",
      email: session.email,
      name: session.name,
      role: session.role,
      permissions: session.permissions,
      workspace: session.workspace,
      source: session.source,
    };
  }

  async function authenticateWithSso(req) {
    if (!isSsoConfigured()) {
      throw createAuthError("sso_not_configured", "Admin SSO is not configured.", 503);
    }

    const cfJwt = String(req?.headers?.["cf-access-jwt-assertion"] || "").trim();
    const cfEmail = getCandidateSsoEmail(req);
    if (!cfJwt || !cfEmail) {
      throw createAuthError("missing_cf_headers", "Cloudflare Access authentication is required.");
    }

    const claims = await verifyCloudflareJwt(cfJwt);
    const tokenEmail = String(claims?.email || "").trim().toLowerCase();
    if (tokenEmail && tokenEmail !== cfEmail) {
      throw createAuthError("cf_email_mismatch", "Cloudflare email mismatch.");
    }

    const workspace = String(getWorkspaceKey() || "corpcx").trim() || "corpcx";
    const accessUrl = new URL(String(getWorkspaceAccessUrl() || "").trim());
    accessUrl.searchParams.set("workspace", workspace);
    accessUrl.searchParams.set("email", cfEmail);

    const { response, payload } = await fetchJsonWithTimeout(fetchImpl, accessUrl.toString(), {
      headers: {
        "X-Internal-Api-Secret": String(getWorkspaceAccessSecret() || "").trim(),
        "Bypass-Tunnel-Reminder": "true",
      },
    }, DEFAULT_FETCH_TIMEOUT_MS);

    if (!response.ok) {
      throw createAuthError("workspace_authz_failed", "Workspace authorization check failed.", 503, {
        status: response.status,
        payload,
      });
    }

    if (!payload?.allowed || !payload?.user) {
      throw createAuthError("workspace_access_denied", "Workspace access denied.", 403, {
        reason: payload?.reason || "permission_denied",
        email: cfEmail,
      });
    }

    return {
      email: String(payload.user.email || cfEmail).trim().toLowerCase(),
      name: String(payload.user.name || "").trim(),
      role: String(payload.user.role || "admin").trim() || "admin",
      permissions: Array.isArray(payload.user.permissions) ? payload.user.permissions : [],
      workspace,
      source: "ocp-sso",
    };
  }

  return {
    createAuthError,
    isSessionConfigured,
    isSsoConfigured,
    getCandidateSsoEmail,
    getSession,
    getSessionAuthContext,
    setSession,
    clearSession,
    authenticateWithSso,
  };
}

module.exports = {
  createAdminTrustedAuth,
  parseCookies,
  serializeCookie,
  base64UrlEncode,
  base64UrlDecode,
};

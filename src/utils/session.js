const crypto = require("crypto");

function createSession(store, ip, source = "web") {
  const id = crypto.randomUUID();
  const session = { id, ip, source, createdAt: Date.now(), lastActiveAt: Date.now(), status: "active" };
  store.set(id, session);
  return session;
}

function validateSession(store, sessionId) {
  if (!sessionId || typeof sessionId !== "string") return { valid: false, reason: "missing" };
  if (/^auto-/.test(sessionId)) return { valid: false, reason: "forged_auto_id" };
  const session = store.get(sessionId);
  if (!session) return { valid: false, reason: "not_found" };
  session.lastActiveAt = Date.now();
  return { valid: true, session };
}

function cleanExpiredSessions(store, maxAgeMs = 24 * 60 * 60 * 1000) {
  const now = Date.now();
  for (const [id, session] of store) {
    if (now - session.lastActiveAt > maxAgeMs) store.delete(id);
  }
}

module.exports = { createSession, validateSession, cleanExpiredSessions };

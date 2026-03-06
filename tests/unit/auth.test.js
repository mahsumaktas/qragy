import { describe, it, expect } from "vitest";
const { createAuthMiddleware } = require("../../src/middleware/auth.js");

describe("Auth Middleware", () => {
  function makeMocks(token, headerValue, queryValue, overrides = {}) {
    const req = {
      headers: { "x-admin-token": headerValue || "" },
      query: { token: queryValue || "" },
      ...overrides.req,
    };
    const res = {
      _status: null,
      _json: null,
      status(code) { this._status = code; return this; },
      json(data) { this._json = data; return this; },
    };
    const next = () => { res._next = true; };
    return { req, res, next };
  }

  it("should return 503 if no admin token configured", () => {
    const { req, res, next } = makeMocks("", "", "");
    createAuthMiddleware(() => "")(req, res, next);
    expect(res._status).toBe(503);
  });

  it("should return 401 for missing token", () => {
    const { req, res, next } = makeMocks("secret123", "", "");
    createAuthMiddleware(() => "secret123")(req, res, next);
    expect(res._status).toBe(401);
  });

  it("should return 401 for wrong token (different length)", () => {
    const { req, res, next } = makeMocks("secret123", "wrongtoken", "");
    createAuthMiddleware(() => "secret123")(req, res, next);
    expect(res._status).toBe(401);
  });

  it("should return 401 for wrong token (same length, timingSafeEqual)", () => {
    const { req, res, next } = makeMocks("secret123", "secret999", "");
    createAuthMiddleware(() => "secret123")(req, res, next);
    expect(res._status).toBe(401);
  });

  it("should call next() for valid header token", () => {
    const { req, res, next } = makeMocks("secret123", "secret123", "");
    createAuthMiddleware(() => "secret123")(req, res, next);
    expect(res._next).toBe(true);
  });

  it("should accept token from query param", () => {
    const { req, res, next } = makeMocks("secret123", "", "secret123");
    createAuthMiddleware(() => "secret123")(req, res, next);
    expect(res._next).toBe(true);
  });

  it("should allow trusted session auth when configured", () => {
    const { req, res, next } = makeMocks("", "", "");
    const middleware = createAuthMiddleware({
      getAdminToken: () => "",
      getTrustedSessionAuth: () => ({ type: "trusted-session", email: "admin@example.com" }),
      isTrustedSessionConfigured: () => true,
    });
    middleware(req, res, next);
    expect(res._next).toBe(true);
    expect(req.adminAuth?.email).toBe("admin@example.com");
  });

  it("should return 401 when trusted sessions are configured but no session exists", () => {
    const { req, res, next } = makeMocks("", "", "");
    const middleware = createAuthMiddleware({
      getAdminToken: () => "",
      getTrustedSessionAuth: () => null,
      isTrustedSessionConfigured: () => true,
    });
    middleware(req, res, next);
    expect(res._status).toBe(401);
    expect(res._next).not.toBe(true);
  });
});

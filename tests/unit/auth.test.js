import { describe, it, expect } from "vitest";
const { createAuthMiddleware } = require("../../src/middleware/auth.js");

describe("Auth Middleware", () => {
  function makeMocks(token, headerValue, queryValue) {
    const getAdminToken = () => token;
    const req = {
      headers: { "x-admin-token": headerValue || "" },
      query: { token: queryValue || "" },
    };
    const res = {
      _status: null,
      _json: null,
      status(code) { this._status = code; return this; },
      json(data) { this._json = data; return this; },
    };
    const next = () => { res._next = true; };
    return { getAdminToken, req, res, next };
  }

  it("should return 503 if no admin token configured", () => {
    const { getAdminToken, req, res, next } = makeMocks("", "", "");
    createAuthMiddleware(getAdminToken)(req, res, next);
    expect(res._status).toBe(503);
  });

  it("should return 401 for missing token", () => {
    const { getAdminToken, req, res, next } = makeMocks("secret123", "", "");
    createAuthMiddleware(getAdminToken)(req, res, next);
    expect(res._status).toBe(401);
  });

  it("should return 401 for wrong token (different length)", () => {
    const { getAdminToken, req, res, next } = makeMocks("secret123", "wrongtoken", "");
    createAuthMiddleware(getAdminToken)(req, res, next);
    expect(res._status).toBe(401);
  });

  it("should return 401 for wrong token (same length, timingSafeEqual)", () => {
    const { getAdminToken, req, res, next } = makeMocks("secret123", "secret999", "");
    createAuthMiddleware(getAdminToken)(req, res, next);
    expect(res._status).toBe(401);
  });

  it("should call next() for valid header token", () => {
    const { getAdminToken, req, res, next } = makeMocks("secret123", "secret123", "");
    createAuthMiddleware(getAdminToken)(req, res, next);
    expect(res._next).toBe(true);
  });

  it("should accept token from query param", () => {
    const { getAdminToken, req, res, next } = makeMocks("secret123", "", "secret123");
    createAuthMiddleware(getAdminToken)(req, res, next);
    expect(res._next).toBe(true);
  });
});

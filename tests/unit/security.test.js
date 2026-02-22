import { describe, it, expect } from "vitest";
const { securityHeaders } = require("../../src/middleware/security.js");

describe("Security Middleware", () => {
  it("should set all security headers", () => {
    const headers = {};
    const req = { secure: false, headers: {} };
    const res = { setHeader(k, v) { headers[k] = v; } };
    let nextCalled = false;
    securityHeaders(req, res, () => { nextCalled = true; });

    expect(headers["X-Content-Type-Options"]).toBe("nosniff");
    expect(headers["X-Frame-Options"]).toBe("DENY");
    expect(headers["X-XSS-Protection"]).toBe("1; mode=block");
    expect(headers["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
    expect(headers["Permissions-Policy"]).toBe("geolocation=(), microphone=(), camera=()");
    expect(headers["Content-Security-Policy"]).toContain("default-src 'self'");
    expect(headers["X-Permitted-Cross-Domain-Policies"]).toBe("none");
    expect(nextCalled).toBe(true);
  });

  it("should set HSTS when req.secure is true", () => {
    const headers = {};
    const req = { secure: true, headers: {} };
    const res = { setHeader(k, v) { headers[k] = v; } };
    securityHeaders(req, res, () => {});
    expect(headers["Strict-Transport-Security"]).toBe("max-age=31536000; includeSubDomains");
  });

  it("should set HSTS when x-forwarded-proto is https", () => {
    const headers = {};
    const req = { secure: false, headers: { "x-forwarded-proto": "https" } };
    const res = { setHeader(k, v) { headers[k] = v; } };
    securityHeaders(req, res, () => {});
    expect(headers["Strict-Transport-Security"]).toBe("max-age=31536000; includeSubDomains");
  });

  it("should NOT set HSTS on plain HTTP", () => {
    const headers = {};
    const req = { secure: false, headers: {} };
    const res = { setHeader(k, v) { headers[k] = v; } };
    securityHeaders(req, res, () => {});
    expect(headers["Strict-Transport-Security"]).toBeUndefined();
  });
});

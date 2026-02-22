import { describe, it, expect } from "vitest";
const { securityHeaders } = require("../../src/middleware/security.js");

describe("Security Middleware", () => {
  it("should set all security headers", () => {
    const headers = {};
    const req = {};
    const res = { setHeader(k, v) { headers[k] = v; } };
    let nextCalled = false;
    securityHeaders(req, res, () => { nextCalled = true; });

    expect(headers["X-Content-Type-Options"]).toBe("nosniff");
    expect(headers["X-Frame-Options"]).toBe("DENY");
    expect(headers["X-XSS-Protection"]).toBe("1; mode=block");
    expect(headers["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
    expect(headers["Permissions-Policy"]).toBe("geolocation=(), microphone=(), camera=()");
    expect(nextCalled).toBe(true);
  });
});

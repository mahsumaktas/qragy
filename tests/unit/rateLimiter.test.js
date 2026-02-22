import { describe, it, expect, beforeEach } from "vitest";
const { createRateLimiter } = require("../../src/middleware/rateLimiter.js");

describe("Rate Limiter", () => {
  let limiter;

  beforeEach(() => {
    limiter = createRateLimiter({ maxRequests: 3, windowMs: 1000 });
  });

  it("should allow requests under limit", () => {
    expect(limiter.check("192.168.1.1")).toBe(true);
    expect(limiter.check("192.168.1.1")).toBe(true);
    expect(limiter.check("192.168.1.1")).toBe(true);
  });

  it("should block requests over limit", () => {
    limiter.check("10.0.0.1");
    limiter.check("10.0.0.1");
    limiter.check("10.0.0.1");
    expect(limiter.check("10.0.0.1")).toBe(false);
  });

  it("should track IPs independently", () => {
    limiter.check("1.1.1.1");
    limiter.check("1.1.1.1");
    limiter.check("1.1.1.1");
    expect(limiter.check("2.2.2.2")).toBe(true);
  });

  it("should report remaining requests", () => {
    limiter.check("5.5.5.5");
    limiter.check("5.5.5.5");
    expect(limiter.getRemaining("5.5.5.5")).toBe(1);
  });

  it("should return maxRequests for unknown IP", () => {
    expect(limiter.getRemaining("unknown")).toBe(3);
  });
});

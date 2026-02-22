const { createSession, validateSession } = require("../../src/utils/session.js");

describe("Session", () => {
  it("should create a new session with UUID", () => {
    const sessions = new Map();
    const session = createSession(sessions, "192.168.1.1", "web");
    expect(session.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(session.ip).toBe("192.168.1.1");
    expect(sessions.has(session.id)).toBe(true);
  });
  it("should validate existing session", () => {
    const sessions = new Map();
    const session = createSession(sessions, "10.0.0.1", "web");
    const result = validateSession(sessions, session.id);
    expect(result.valid).toBe(true);
  });
  it("should reject unknown session ID", () => {
    const sessions = new Map();
    expect(validateSession(sessions, "fake-id").valid).toBe(false);
  });
  it("should reject forged auto IDs", () => {
    const sessions = new Map();
    expect(validateSession(sessions, "auto-192.168.1.1-abc").valid).toBe(false);
  });
});

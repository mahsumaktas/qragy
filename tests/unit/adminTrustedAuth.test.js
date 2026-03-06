import { describe, expect, it } from "vitest";
const crypto = require("crypto");
const { createAdminTrustedAuth, parseCookies } = require("../../src/services/adminTrustedAuth.js");

function createMockResponse() {
  const headers = new Map();
  return {
    getHeader(name) {
      return headers.get(name);
    },
    setHeader(name, value) {
      headers.set(name, value);
    },
  };
}

function buildJwt(payload, privateKey, kid = "kid-1") {
  const header = { alg: "RS256", typ: "JWT", kid };
  const encode = (value) =>
    Buffer.from(JSON.stringify(value))
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/g, "");
  const encodedHeader = encode(header);
  const encodedPayload = encode(payload);
  const signer = crypto.createSign("RSA-SHA256");
  signer.update(`${encodedHeader}.${encodedPayload}`);
  signer.end();
  const rawSignature = signer.sign(privateKey);
  const encodedSignature = rawSignature.toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
  return `${encodedHeader}.${encodedPayload}.${encodedSignature}`;
}

describe("adminTrustedAuth", () => {
  it("creates and verifies a signed admin session cookie", () => {
    const trustedAuth = createAdminTrustedAuth({
      getSessionSecret: () => "x".repeat(40),
      getSessionTtlMs: () => 60 * 60 * 1000,
    });
    const res = createMockResponse();
    trustedAuth.setSession(res, { headers: { "x-forwarded-proto": "https" } }, {
      email: "admin@example.com",
      name: "Admin",
      role: "admin",
      permissions: ["corpcx_admin"],
      workspace: "corpcx",
    });

    const cookieHeader = res.getHeader("Set-Cookie");
    expect(cookieHeader).toBeTruthy();

    const req = {
      headers: {
        cookie: Array.isArray(cookieHeader) ? cookieHeader[0] : cookieHeader,
      },
    };
    const session = trustedAuth.getSession(req);
    expect(session.email).toBe("admin@example.com");
    expect(session.workspace).toBe("corpcx");
    expect(session.permissions).toEqual(["corpcx_admin"]);
  });

  it("authenticates trusted admin SSO via Cloudflare JWT and OCP authz", async () => {
    const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
    const jwk = publicKey.export({ format: "jwk" });
    const now = Math.floor(Date.now() / 1000);
    const jwt = buildJwt({
      iss: "https://example.cloudflareaccess.com",
      aud: ["aud-123"],
      email: "admin@example.com",
      iat: now,
      exp: now + 300,
    }, privateKey);

    const fetchCalls = [];
    const trustedAuth = createAdminTrustedAuth({
      getSessionSecret: () => "x".repeat(40),
      getCloudflareTeamDomain: () => "example.cloudflareaccess.com",
      getCloudflareAudience: () => "aud-123",
      getWorkspaceAccessUrl: () => "http://127.0.0.1:8000/api/auth/internal/workspace-access",
      getWorkspaceAccessSecret: () => "shared-secret",
      getWorkspaceKey: () => "corpcx",
      fetchImpl: async (url) => {
        fetchCalls.push(url);
        if (String(url).includes("/cdn-cgi/access/certs")) {
          return {
            ok: true,
            json: async () => ({ keys: [{ ...jwk, kid: "kid-1", alg: "RS256", use: "sig" }] }),
          };
        }
        return {
          ok: true,
          json: async () => ({
            ok: true,
            allowed: true,
            user: {
              email: "admin@example.com",
              name: "CorpCX Admin",
              role: "user",
              permissions: ["corpcx_admin"],
            },
          }),
        };
      },
    });

    const session = await trustedAuth.authenticateWithSso({
      headers: {
        "cf-access-jwt-assertion": jwt,
        "cf-access-authenticated-user-email": "admin@example.com",
      },
    });

    expect(session.email).toBe("admin@example.com");
    expect(session.workspace).toBe("corpcx");
    expect(session.permissions).toEqual(["corpcx_admin"]);
    expect(fetchCalls.some((url) => String(url).includes("workspace=corpcx"))).toBe(true);
  });

  it("parses cookies from a raw header string", () => {
    const parsed = parseCookies("foo=bar; qragy_admin_session=test-token");
    expect(parsed.foo).toBe("bar");
    expect(parsed.qragy_admin_session).toBe("test-token");
  });
});

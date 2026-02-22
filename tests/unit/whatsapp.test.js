"use strict";

const { createWhatsAppIntegration } = require("../../src/integrations/whatsapp");

function makeDeps(overrides = {}) {
  return {
    express: { json: () => (_req, _res, next) => next() },
    crypto: {},
    logger: { info() {}, warn() {}, error() {} },
    getWhatsAppConfig: () => ({
      enabled: true,
      phoneNumberId: "123456789",
      accessToken: "test-access-token-abc123",
      verifyToken: "my-verify-token",
    }),
    getChatFlowConfig: () => ({}),
    upsertConversation: () => {},
    recordAnalyticsEvent: () => {},
    processChatMessage: async () => ({ reply: "Bot reply" }),
    ...overrides,
  };
}

function makeRes() {
  const res = {
    _status: null,
    _body: null,
    _sent: false,
    status(code) { res._status = code; return res; },
    send(body) { res._body = body; res._sent = true; return res; },
    sendStatus(code) { res._status = code; res._sent = true; return res; },
    json(body) { res._body = body; res._sent = true; return res; },
  };
  return res;
}

// ── Test 1: Webhook verification with correct token returns challenge ──
test("webhook verification with correct token returns challenge", () => {
  const integration = createWhatsAppIntegration(makeDeps());

  // mountWebhook registers routes; we'll test handleVerification directly
  // by invoking the GET handler logic
  const app = {
    _getHandler: null,
    _postHandler: null,
    get(path, ...handlers) { app._getHandler = handlers[handlers.length - 1]; },
    post(path, ...handlers) { app._postHandler = handlers[handlers.length - 1]; },
  };
  integration.mountWebhook(app);

  const req = {
    query: {
      "hub.mode": "subscribe",
      "hub.verify_token": "my-verify-token",
      "hub.challenge": "challenge_string_123",
    },
  };
  const res = makeRes();

  app._getHandler(req, res);

  expect(res._status).toBe(200);
  expect(res._body).toBe("challenge_string_123");
});

// ── Test 2: Webhook verification with wrong token returns 403 ──────────
test("webhook verification with wrong token returns 403", () => {
  const integration = createWhatsAppIntegration(makeDeps());

  const app = {
    _getHandler: null,
    get(path, ...handlers) { app._getHandler = handlers[handlers.length - 1]; },
    post() {},
  };
  integration.mountWebhook(app);

  const req = {
    query: {
      "hub.mode": "subscribe",
      "hub.verify_token": "wrong-token",
      "hub.challenge": "challenge_string_123",
    },
  };
  const res = makeRes();

  app._getHandler(req, res);

  expect(res._status).toBe(403);
  expect(res._body).toBe("Verification failed");
});

// ── Test 3: Webhook processes text message ──────────────────────────────
test("webhook processes text message", async () => {
  let processedMessage = null;
  let upsertCalled = false;
  let analyticsCalled = false;

  const deps = makeDeps({
    processChatMessage: async (args) => {
      processedMessage = args;
      return { reply: "Test reply" };
    },
    upsertConversation: () => { upsertCalled = true; },
    recordAnalyticsEvent: () => { analyticsCalled = true; },
  });

  const integration = createWhatsAppIntegration(deps);

  const app = {
    _postHandler: null,
    get() {},
    post(path, ...handlers) { app._postHandler = handlers[handlers.length - 1]; },
  };
  integration.mountWebhook(app);

  // Mock fetch globally for sendMessage
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true, json: async () => ({}) });

  const req = {
    body: {
      entry: [{
        changes: [{
          value: {
            messages: [{
              from: "905551234567",
              type: "text",
              text: { body: "Merhaba" },
            }],
          },
        }],
      }],
    },
  };
  const res = makeRes();

  await app._postHandler(req, res);

  // Wait for async processing
  await new Promise((r) => setTimeout(r, 100));

  expect(res._status).toBe(200);
  expect(processedMessage).toBeTruthy();
  expect(processedMessage.userMessage).toBe("Merhaba");
  expect(processedMessage.source).toBe("whatsapp");
  expect(processedMessage.sessionId).toBe("wa_905551234567");
  expect(upsertCalled).toBe(true);
  expect(analyticsCalled).toBe(true);

  globalThis.fetch = originalFetch;
});

// ── Test 4: Webhook ignores non-text messages ──────────────────────────
test("webhook ignores non-text messages", async () => {
  let processCalled = false;

  const deps = makeDeps({
    processChatMessage: async () => { processCalled = true; return { reply: "nope" }; },
  });

  const integration = createWhatsAppIntegration(deps);

  const app = {
    _postHandler: null,
    get() {},
    post(path, ...handlers) { app._postHandler = handlers[handlers.length - 1]; },
  };
  integration.mountWebhook(app);

  const req = {
    body: {
      entry: [{
        changes: [{
          value: {
            messages: [{
              from: "905551234567",
              type: "image",
              image: { id: "img123" },
            }],
          },
        }],
      }],
    },
  };
  const res = makeRes();

  await app._postHandler(req, res);
  await new Promise((r) => setTimeout(r, 50));

  expect(res._status).toBe(200);
  expect(processCalled).toBe(false);
});

// ── Test 5: sendMessage calls WhatsApp API correctly ───────────────────
test("sendMessage calls WhatsApp API correctly", async () => {
  let fetchUrl = null;
  let fetchOptions = null;

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    fetchUrl = url;
    fetchOptions = options;
    return { ok: true, json: async () => ({}) };
  };

  const integration = createWhatsAppIntegration(makeDeps());
  await integration.sendMessage("905551234567", "Merhaba!");

  expect(fetchUrl).toBe("https://graph.facebook.com/v18.0/123456789/messages");
  expect(fetchOptions.method).toBe("POST");
  expect(fetchOptions.headers["Authorization"]).toBe("Bearer test-access-token-abc123");

  const body = JSON.parse(fetchOptions.body);
  expect(body.messaging_product).toBe("whatsapp");
  expect(body.to).toBe("905551234567");
  expect(body.type).toBe("text");
  expect(body.text.body).toBe("Merhaba!");

  globalThis.fetch = originalFetch;
});

// ── Test 6: isEnabled returns false when not configured ────────────────
test("isEnabled returns false when not configured", () => {
  const integration = createWhatsAppIntegration(makeDeps({
    getWhatsAppConfig: () => ({
      enabled: false,
      phoneNumberId: "",
      accessToken: "",
      verifyToken: "",
    }),
  }));

  expect(integration.isEnabled()).toBe(false);
});

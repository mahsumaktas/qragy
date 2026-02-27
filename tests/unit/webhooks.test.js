import { describe, it, expect, vi, beforeEach } from "vitest";

const { createWebhookService } = require("../../src/services/webhooks.js");

describe("Webhook Service", () => {
  let svc;
  let mockFs;
  let written;

  beforeEach(() => {
    written = {};
    mockFs = {
      existsSync: vi.fn(() => false),
      readFileSync: vi.fn((path) => {
        if (written[path]) return written[path];
        throw new Error("ENOENT");
      }),
      writeFileSync: vi.fn((path, data) => {
        written[path] = data;
      }),
    };

    svc = createWebhookService({
      fs: mockFs,
      path: { join: (...parts) => parts.join("/") },
      crypto: {
        createHmac: () => ({ update: () => ({ digest: () => "sig" }) }),
      },
      logger: { warn: vi.fn() },
      dataDir: "/data",
      nowIso: () => "2026-02-28T00:00:00.000Z",
      getJobQueue: null,
    });
  });

  // ── loadWebhooks ──────────────────────────────────────────────────

  it("loadWebhooks returns empty array when file missing", () => {
    mockFs.existsSync.mockReturnValue(false);
    const result = svc.loadWebhooks();
    expect(result).toEqual([]);
  });

  it("loadWebhooks returns empty array on JSON parse error", () => {
    mockFs.existsSync.mockReturnValue(true);
    mockFs.readFileSync.mockReturnValue("NOT JSON");
    const result = svc.loadWebhooks();
    expect(result).toEqual([]);
  });

  // ── saveWebhooks + loadWebhooks round-trip ────────────────────────

  it("saveWebhooks + loadWebhooks round-trip", () => {
    const hooks = [
      { id: "h1", url: "https://example.com/hook", active: true, events: ["*"], secret: "" },
      { id: "h2", url: "https://example.com/hook2", active: false, events: ["chat.new"], secret: "s" },
    ];

    svc.saveWebhooks(hooks);

    // writeFileSync cagrilmis olmali
    expect(mockFs.writeFileSync).toHaveBeenCalledOnce();
    const writtenPath = mockFs.writeFileSync.mock.calls[0][0];
    expect(writtenPath).toBe("/data/webhooks.json");

    // Simdi existsSync true donecek ve readFileSync yazilan veriyi donecek
    mockFs.existsSync.mockReturnValue(true);
    const loaded = svc.loadWebhooks();
    expect(loaded).toEqual(hooks);
  });

  // ── fireWebhook ───────────────────────────────────────────────────

  it("fireWebhook calls fetch for active hooks matching event", async () => {
    const hooks = [
      { id: "h1", url: "https://a.com", active: true, events: ["chat.new"], secret: "" },
    ];
    svc.saveWebhooks(hooks);
    mockFs.existsSync.mockReturnValue(true);

    // Global fetch mock
    const fetchMock = vi.fn(() => Promise.resolve({ ok: true }));
    globalThis.fetch = fetchMock;

    svc.fireWebhook("chat.new", { msg: "hello" });

    // fireWebhookWithRetry async, kisa bir bekleme yeterli
    await new Promise((r) => setTimeout(r, 50));
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0][0]).toBe("https://a.com");

    delete globalThis.fetch;
  });

  it("fireWebhook skips disabled hooks", async () => {
    const hooks = [
      { id: "h1", url: "https://a.com", active: false, events: ["*"], secret: "" },
    ];
    svc.saveWebhooks(hooks);
    mockFs.existsSync.mockReturnValue(true);

    const fetchMock = vi.fn(() => Promise.resolve({ ok: true }));
    globalThis.fetch = fetchMock;

    svc.fireWebhook("chat.new", { msg: "hello" });

    await new Promise((r) => setTimeout(r, 50));
    expect(fetchMock).not.toHaveBeenCalled();

    delete globalThis.fetch;
  });

  it("fireWebhook skips hooks that dont match event", async () => {
    const hooks = [
      { id: "h1", url: "https://a.com", active: true, events: ["ticket.created"], secret: "" },
    ];
    svc.saveWebhooks(hooks);
    mockFs.existsSync.mockReturnValue(true);

    const fetchMock = vi.fn(() => Promise.resolve({ ok: true }));
    globalThis.fetch = fetchMock;

    svc.fireWebhook("chat.new", { msg: "hello" });

    await new Promise((r) => setTimeout(r, 50));
    expect(fetchMock).not.toHaveBeenCalled();

    delete globalThis.fetch;
  });

  it("fireWebhook fires for wildcard event hooks", async () => {
    const hooks = [
      { id: "h1", url: "https://a.com", active: true, events: ["*"], secret: "" },
    ];
    svc.saveWebhooks(hooks);
    mockFs.existsSync.mockReturnValue(true);

    const fetchMock = vi.fn(() => Promise.resolve({ ok: true }));
    globalThis.fetch = fetchMock;

    svc.fireWebhook("anything.here", {});

    await new Promise((r) => setTimeout(r, 50));
    expect(fetchMock).toHaveBeenCalledOnce();

    delete globalThis.fetch;
  });

  it("fireWebhook uses jobQueue when available", () => {
    const hooks = [
      { id: "h1", url: "https://a.com", active: true, events: ["*"], secret: "" },
    ];
    svc.saveWebhooks(hooks);
    mockFs.existsSync.mockReturnValue(true);

    const mockAdd = vi.fn();
    const mockJq = { add: mockAdd };

    // getJobQueue fonksiyon olarak gecilmeli, yeniden olustur
    const svc2 = createWebhookService({
      fs: mockFs,
      path: { join: (...parts) => parts.join("/") },
      crypto: { createHmac: () => ({ update: () => ({ digest: () => "sig" }) }) },
      logger: { warn: vi.fn() },
      dataDir: "/data",
      nowIso: () => "2026-02-28T00:00:00.000Z",
      getJobQueue: () => mockJq,
    });

    svc2.fireWebhook("chat.new", { x: 1 });

    expect(mockAdd).toHaveBeenCalledOnce();
    expect(mockAdd.mock.calls[0][0]).toBe("webhook");
    expect(mockAdd.mock.calls[0][1]).toMatchObject({
      hookUrl: "https://a.com",
      hookId: "h1",
      eventType: "chat.new",
    });
  });

  // ── Delivery Log ──────────────────────────────────────────────────

  it("recordWebhookDelivery appends to delivery log", () => {
    svc.recordWebhookDelivery("h1", "chat.new", "success", 1, "");

    mockFs.existsSync.mockReturnValue(true);
    const log = svc.loadWebhookDeliveryLog();
    expect(log.deliveries).toHaveLength(1);
    expect(log.deliveries[0]).toMatchObject({
      hookId: "h1",
      eventType: "chat.new",
      status: "success",
      attempt: 1,
    });
  });

  it("delivery log is capped at 200 entries", () => {
    // 201 kayit yaz
    for (let i = 0; i < 201; i++) {
      svc.recordWebhookDelivery("h1", "evt", "success", 1, "");
      mockFs.existsSync.mockReturnValue(true);
    }

    const log = svc.loadWebhookDeliveryLog();
    expect(log.deliveries.length).toBeLessThanOrEqual(200);
  });
});

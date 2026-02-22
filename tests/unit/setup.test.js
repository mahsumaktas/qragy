const path = require("path");
const fs = require("fs");
const { createConfigStore } = require("../../src/services/configStore.js");

// ── Helpers ──
function makeTmpDir() {
  return path.join(__dirname, "_tmp_setup_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6));
}

function makeStore(tmpDir, existingFiles) {
  if (!existingFiles) existingFiles = {};
  fs.mkdirSync(tmpDir, { recursive: true });

  const paths = {
    chatFlowConfigFile: path.join(tmpDir, "chat-flow-config.json"),
    siteConfigFile: path.join(tmpDir, "site-config.json"),
    sunshineConfigFile: path.join(tmpDir, "sunshine-config.json"),
    telegramSessionsFile: path.join(tmpDir, "telegram-sessions.json"),
    sunshineSessionsFile: path.join(tmpDir, "sunshine-sessions.json"),
    promptVersionsFile: path.join(tmpDir, "prompt-versions.json"),
    setupCompleteFile: path.join(tmpDir, "setup-complete.json"),
  };

  for (const key of Object.keys(existingFiles)) {
    if (paths[key]) {
      const content = existingFiles[key];
      fs.writeFileSync(paths[key], typeof content === "string" ? content : JSON.stringify(content), "utf8");
    }
  }

  const store = createConfigStore({
    fs: fs,
    logger: { info() {}, warn() {}, error() {} },
    paths: paths,
  });

  return { store, paths };
}

function cleanup(dir) {
  try { fs.rmSync(dir, { recursive: true }); } catch (_) { /* ignore */ }
}

// ── ConfigStore Setup Tests ──
describe("ConfigStore - Setup Complete", () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = makeTmpDir();
  });

  afterEach(() => {
    if (tmpDir) cleanup(tmpDir);
  });

  it("isSetupComplete returns false when file doesn't exist", () => {
    const ref = makeStore(tmpDir);
    expect(ref.store.isSetupComplete()).toBe(false);
  });

  it("isSetupComplete returns true when file has complete:true", () => {
    const ref = makeStore(tmpDir, {
      setupCompleteFile: { complete: true, completedAt: "2026-01-01T00:00:00.000Z" },
    });
    expect(ref.store.isSetupComplete()).toBe(true);
  });

  it("isSetupComplete returns false when file is corrupt", () => {
    const ref = makeStore(tmpDir, {
      setupCompleteFile: "not valid json{{{",
    });
    expect(ref.store.isSetupComplete()).toBe(false);
  });

  it("markSetupComplete writes file correctly", () => {
    const ref = makeStore(tmpDir);
    ref.store.markSetupComplete({ companyName: "TestCo" });
    expect(ref.store.isSetupComplete()).toBe(true);

    const raw = JSON.parse(fs.readFileSync(ref.paths.setupCompleteFile, "utf8"));
    expect(raw.complete).toBe(true);
    expect(raw.companyName).toBe("TestCo");
    expect(raw.completedAt).toBeTruthy();
  });
});

// ── Setup Route Tests ──
describe("Setup Route", () => {
  let tmpDir;
  let store;

  function createMockApp() {
    const routeMap = {};
    return {
      get(routePath, handler) {
        routeMap["GET " + routePath] = handler;
      },
      post(routePath, _middleware, handler) {
        if (typeof _middleware === "function" && handler === undefined) {
          handler = _middleware;
        }
        routeMap["POST " + routePath] = handler;
      },
      _routes: routeMap,
      _call(method, urlPath, body) {
        const key = method + " " + urlPath;
        const routeHandler = routeMap[key];
        if (!routeHandler) throw new Error("No route for " + key);

        let statusCode = 200;
        let responseBody = null;
        let redirectUrl = null;

        const req = { body: body || {} };
        const res = {
          status(code) { statusCode = code; return res; },
          json(data) { responseBody = data; },
          redirect(url) { redirectUrl = url; },
        };

        routeHandler(req, res);
        return { statusCode, body: responseBody, redirectUrl };
      },
    };
  }

  beforeEach(() => {
    tmpDir = makeTmpDir();
    const ref = makeStore(tmpDir);
    store = ref.store;
  });

  afterEach(() => {
    if (tmpDir) cleanup(tmpDir);
  });

  function mountSetupRoute(mockApp) {
    const setupModule = require("../../src/routes/setup.js");
    setupModule.mount(mockApp, {
      isSetupComplete: store.isSetupComplete,
      markSetupComplete: store.markSetupComplete,
      saveSiteConfig: store.saveSiteConfig,
      saveChatFlowConfig: store.saveChatFlowConfig,
    });
  }

  it("GET /api/setup/status returns setupComplete false initially", () => {
    const mockApp = createMockApp();
    mountSetupRoute(mockApp);

    const result = mockApp._call("GET", "/api/setup/status");
    expect(result.body.setupComplete).toBe(false);
  });

  it("POST /api/setup/complete validates required fields", () => {
    const mockApp = createMockApp();
    mountSetupRoute(mockApp);

    // Empty body
    let result = mockApp._call("POST", "/api/setup/complete", {});
    expect(result.statusCode).toBe(400);
    expect(result.body.error).toBeTruthy();

    // Empty companyName
    result = mockApp._call("POST", "/api/setup/complete", { companyName: "   " });
    expect(result.statusCode).toBe(400);
  });

  it("POST /api/setup/complete saves config and marks complete", () => {
    const mockApp = createMockApp();
    mountSetupRoute(mockApp);

    const result = mockApp._call("POST", "/api/setup/complete", {
      companyName: "Acme Corp",
      sector: "e-ticaret",
      themeColor: "#FF0000",
      faqs: [{ q: "Kargo ne zaman gelir?", a: "2-3 is gunu." }],
    });

    expect(result.statusCode).toBe(200);
    expect(result.body.ok).toBe(true);

    // Verify setup is marked complete
    expect(store.isSetupComplete()).toBe(true);

    // Verify site config updated
    const siteConfig = store.getSiteConfig();
    expect(siteConfig.heroTitle).toBe("Acme Corp Destek");
    expect(siteConfig.headerTitle).toBe("Acme Corp Destek");
    expect(siteConfig.themeColor).toBe("#FF0000");

    // Verify chatFlow config updated
    const chatConfig = store.getChatFlowConfig();
    expect(chatConfig.welcomeMessage).toContain("Acme Corp");
  });

  it("setup complete writes persona.md and adds sampleQA to CSV", () => {
    const mockApp = createMockApp();
    const agentDir = path.join(tmpDir, "agent");
    fs.mkdirSync(agentDir, { recursive: true });

    // Create a template
    const templatesDir = path.join(agentDir, "templates");
    fs.mkdirSync(templatesDir, { recursive: true });
    fs.writeFileSync(path.join(templatesDir, "e-ticaret.json"), JSON.stringify({
      sector: "e-ticaret",
      persona: "Samimi e-ticaret asistani",
      sampleQA: [
        { q: "Kargo nerede?", a: "Siparis numaranizi paylasin." },
        { q: "Iade yapabilir miyim?", a: "14 gun icinde iade mumkun." },
      ],
    }), "utf8");

    // Mock CSV data
    let csvData = [];
    const loadCSVData = () => csvData;
    const saveCSVData = (data) => { csvData = data; };
    const reingestKnowledgeBase = vi.fn().mockResolvedValue();

    const setupModule = require("../../src/routes/setup.js");
    setupModule.mount(mockApp, {
      isSetupComplete: store.isSetupComplete,
      markSetupComplete: store.markSetupComplete,
      saveSiteConfig: store.saveSiteConfig,
      saveChatFlowConfig: store.saveChatFlowConfig,
      loadTemplate: (sector) => {
        const tp = path.join(templatesDir, `${sector}.json`);
        try { return JSON.parse(fs.readFileSync(tp, "utf8")); } catch { return null; }
      },
      fs, agentDir,
      loadCSVData, saveCSVData, reingestKnowledgeBase,
      logger: { info() {}, warn() {}, error() {} },
    });

    const result = mockApp._call("POST", "/api/setup/complete", {
      companyName: "TestShop",
      sector: "e-ticaret",
    });

    expect(result.statusCode).toBe(200);
    expect(result.body.ok).toBe(true);

    // persona.md should be written
    const personaPath = path.join(agentDir, "persona.md");
    expect(fs.existsSync(personaPath)).toBe(true);
    const personaContent = fs.readFileSync(personaPath, "utf8");
    expect(personaContent).toContain("TestShop");
    expect(personaContent).toContain("Samimi e-ticaret asistani");

    // CSV should contain sampleQA
    expect(csvData).toHaveLength(2);
    expect(csvData[0].question).toBe("Kargo nerede?");
    expect(csvData[1].question).toBe("Iade yapabilir miyim?");
  });

  it("POST /api/setup/complete is idempotent", () => {
    const mockApp = createMockApp();
    mountSetupRoute(mockApp);

    const payload = { companyName: "Acme", sector: "diger" };

    const result1 = mockApp._call("POST", "/api/setup/complete", payload);
    expect(result1.body.ok).toBe(true);

    const result2 = mockApp._call("POST", "/api/setup/complete", payload);
    expect(result2.body.ok).toBe(true);

    // Still complete
    expect(store.isSetupComplete()).toBe(true);
  });
});

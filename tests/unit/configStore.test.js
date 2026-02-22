const path = require("path");
const fs = require("fs");
const { createConfigStore } = require("../../src/services/configStore.js");

function makeStore(existingFiles = {}) {
  const tmpDir = path.join(__dirname, "_tmp_configstore_" + Date.now());
  fs.mkdirSync(tmpDir, { recursive: true });

  const paths = {
    chatFlowConfigFile: path.join(tmpDir, "chat-flow-config.json"),
    siteConfigFile: path.join(tmpDir, "site-config.json"),
    sunshineConfigFile: path.join(tmpDir, "sunshine-config.json"),
    telegramSessionsFile: path.join(tmpDir, "telegram-sessions.json"),
    sunshineSessionsFile: path.join(tmpDir, "sunshine-sessions.json"),
    promptVersionsFile: path.join(tmpDir, "prompt-versions.json"),
  };

  for (const [key, content] of Object.entries(existingFiles)) {
    if (paths[key]) {
      fs.writeFileSync(paths[key], typeof content === "string" ? content : JSON.stringify(content), "utf8");
    }
  }

  const store = createConfigStore({
    fs,
    logger: { info() {}, warn() {}, error() {} },
    paths,
  });

  return { store, tmpDir, paths };
}

function cleanup(dir) {
  try { fs.rmSync(dir, { recursive: true }); } catch (_) { /* ignore */ }
}

describe("ConfigStore", () => {
  let tmpDir;

  afterEach(() => {
    if (tmpDir) cleanup(tmpDir);
  });

  it("getChatFlowConfig returns defaults when no file", () => {
    const { store, tmpDir: d } = makeStore();
    tmpDir = d;
    const cfg = store.getChatFlowConfig();
    expect(cfg.gibberishDetectionEnabled).toBe(true);
    expect(cfg.maxClarificationRetries).toBe(3);
  });

  it("saveChatFlowConfig merges with defaults", () => {
    const { store, tmpDir: d } = makeStore();
    tmpDir = d;
    store.saveChatFlowConfig({ maxClarificationRetries: 5 });
    const cfg = store.getChatFlowConfig();
    expect(cfg.maxClarificationRetries).toBe(5);
    expect(cfg.gibberishDetectionEnabled).toBe(true);
  });

  it("loadChatFlowConfig reads from file", () => {
    const { store, tmpDir: d } = makeStore({
      chatFlowConfigFile: { csatEnabled: false },
    });
    tmpDir = d;
    const cfg = store.getChatFlowConfig();
    expect(cfg.csatEnabled).toBe(false);
    expect(cfg.closingFlowEnabled).toBe(true);
  });

  it("getChatFlowConfig returns updated values after save", () => {
    const { store, tmpDir: d } = makeStore();
    tmpDir = d;
    store.saveChatFlowConfig({ closingFlowEnabled: false });
    expect(store.getChatFlowConfig().closingFlowEnabled).toBe(false);
    store.saveChatFlowConfig({ closingFlowEnabled: true });
    expect(store.getChatFlowConfig().closingFlowEnabled).toBe(true);
  });

  it("loadChatFlowConfig falls back on JSON parse error", () => {
    const { store, tmpDir: d } = makeStore({
      chatFlowConfigFile: "not valid json{{{",
    });
    tmpDir = d;
    const cfg = store.getChatFlowConfig();
    expect(cfg.gibberishDetectionEnabled).toBe(true);
  });

  it("getSiteConfig returns defaults when no file", () => {
    const { store, tmpDir: d } = makeStore();
    tmpDir = d;
    const cfg = store.getSiteConfig();
    expect(cfg.pageTitle).toBe("Teknik Destek");
    expect(cfg.themeColor).toBe("#2563EB");
  });

  it("saveSiteConfig merges and persists", () => {
    const { store, tmpDir: d } = makeStore();
    tmpDir = d;
    store.saveSiteConfig({ pageTitle: "My Support" });
    expect(store.getSiteConfig().pageTitle).toBe("My Support");
    expect(store.getSiteConfig().themeColor).toBe("#2563EB");
  });

  it("loadTelegramSessions returns empty object when no file", () => {
    const { store, tmpDir: d } = makeStore();
    tmpDir = d;
    expect(store.loadTelegramSessions()).toEqual({});
  });

  it("saveTelegramSessions persists and loads back", () => {
    const { store, tmpDir: d } = makeStore();
    tmpDir = d;
    store.saveTelegramSessions({ "123": { messages: [] } });
    const sessions = store.loadTelegramSessions();
    expect(sessions["123"]).toBeDefined();
  });

  it("savePromptVersion stores version with id and timestamp", () => {
    const { store, tmpDir: d } = makeStore();
    tmpDir = d;
    store.savePromptVersion("soul.md", "test content");
    const versions = store.loadPromptVersions();
    expect(versions.versions).toHaveLength(1);
    expect(versions.versions[0].filename).toBe("soul.md");
    expect(versions.versions[0].content).toBe("test content");
    expect(versions.versions[0].savedAt).toBeTruthy();
  });
});

const path = require("path");
const fs = require("fs");
const { createConfigStore } = require("../../src/services/configStore.js");

function makeStore(existingFiles = {}) {
  const tmpDir = path.join(__dirname, "_tmp_widgettheme_" + Date.now());
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

describe("Widget Theme System", () => {
  let tmpDir;

  afterEach(() => {
    if (tmpDir) cleanup(tmpDir);
  });

  it("siteConfig includes theme fields by default", () => {
    const { store, tmpDir: d } = makeStore();
    tmpDir = d;
    const cfg = store.getSiteConfig();
    expect(cfg).toHaveProperty("headerBg", "");
    expect(cfg).toHaveProperty("chatBubbleColor", "");
    // Mevcut alanlar da hala mevcut olmali
    expect(cfg).toHaveProperty("themeColor", "#2563EB");
    expect(cfg).toHaveProperty("primaryColor", "");
  });

  it("saveSiteConfig persists theme fields", () => {
    const { store, tmpDir: d, paths: p } = makeStore();
    tmpDir = d;

    store.saveSiteConfig({ headerBg: "#1e40af", chatBubbleColor: "#f0f9ff" });
    const cfg = store.getSiteConfig();
    expect(cfg.headerBg).toBe("#1e40af");
    expect(cfg.chatBubbleColor).toBe("#f0f9ff");

    // Dosyadan tekrar yukleyince de ayni olmali
    const raw = JSON.parse(fs.readFileSync(p.siteConfigFile, "utf8"));
    expect(raw.headerBg).toBe("#1e40af");
    expect(raw.chatBubbleColor).toBe("#f0f9ff");
  });

  it("widget config endpoint includes theme fields", () => {
    const { store, tmpDir: d } = makeStore();
    tmpDir = d;

    store.saveSiteConfig({ headerBg: "#0f172a", chatBubbleColor: "#e2e8f0" });

    // getSiteConfig widget route'un kullandigi fonksiyon
    const siteConfig = store.getSiteConfig();
    expect(siteConfig.headerBg).toBe("#0f172a");
    expect(siteConfig.chatBubbleColor).toBe("#e2e8f0");
    // Diger alanlar bozulmamis olmali
    expect(siteConfig.pageTitle).toBe("Teknik Destek");
    expect(siteConfig.headerTitle).toBe("Teknik Destek");
  });
});

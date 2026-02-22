const path = require("path");
const fs = require("fs");
const { createAgentConfigService } = require("../../src/services/agentConfig.js");

function makeService(overrides = {}) {
  const tmpDir = path.join(__dirname, "_tmp_agent_" + Date.now());
  fs.mkdirSync(tmpDir, { recursive: true });
  const topicsDir = path.join(tmpDir, "topics");
  fs.mkdirSync(topicsDir, { recursive: true });
  const memoryDir = path.join(tmpDir, "memory");
  fs.mkdirSync(memoryDir, { recursive: true });

  const service = createAgentConfigService({
    fs,
    path,
    logger: { info() {}, warn() {}, error() {} },
    agentDir: tmpDir,
    topicsDir,
    memoryDir,
    getBotName: () => overrides.botName || "TestBot",
    getCompanyName: () => overrides.companyName || "",
    topicFileCache: new Map(),
    ...overrides,
  });

  return { service, tmpDir, topicsDir, memoryDir };
}

function cleanup(dir) {
  try { fs.rmSync(dir, { recursive: true }); } catch (_) { /* ignore */ }
}

describe("AgentConfig Service", () => {
  let tmpDir;

  afterEach(() => {
    if (tmpDir) cleanup(tmpDir);
  });

  it("returns default persona when no persona file", () => {
    const { service, tmpDir: d } = makeService();
    tmpDir = d;
    const persona = service.getPersonaText();
    expect(persona).toContain("Teknik Destek Persona");
  });

  it("replaces {{COMPANY_NAME}} with companyName in text files", () => {
    const { service, tmpDir: d } = makeService({ companyName: "Acme" });
    tmpDir = d;
    fs.writeFileSync(path.join(d, "soul.md"), "Welcome to {{COMPANY_NAME}} support");
    service.loadAllAgentConfig();
    expect(service.getSoulText()).toBe("Welcome to Acme support");
  });

  it("replaces {{COMPANY_NAME}} with botName when companyName empty", () => {
    const { service, tmpDir: d } = makeService({ botName: "MyBot", companyName: "" });
    tmpDir = d;
    fs.writeFileSync(path.join(d, "domain.md"), "{{COMPANY_NAME}} domain");
    service.loadAllAgentConfig();
    expect(service.getDomainText()).toBe("MyBot domain");
  });

  it("readTextFileSafe returns fallback for missing file", () => {
    const { service, tmpDir: d } = makeService();
    tmpDir = d;
    const result = service.readTextFileSafe("/nonexistent/file.txt", "default");
    expect(result).toBe("default");
  });

  it("readJsonFileSafe returns fallback on invalid JSON", () => {
    const { service, tmpDir: d } = makeService();
    tmpDir = d;
    const tmpFile = path.join(d, "bad.json");
    fs.writeFileSync(tmpFile, "not json {{{");
    const result = service.readJsonFileSafe(tmpFile, { fallback: true });
    expect(result).toEqual({ fallback: true });
  });

  it("readJsonFileSafe parses valid JSON", () => {
    const { service, tmpDir: d } = makeService();
    tmpDir = d;
    const tmpFile = path.join(d, "good.json");
    fs.writeFileSync(tmpFile, JSON.stringify({ key: "value" }));
    expect(service.readJsonFileSafe(tmpFile)).toEqual({ key: "value" });
  });

  it("getMemoryTemplate returns default when no file", () => {
    const { service, tmpDir: d } = makeService();
    tmpDir = d;
    const template = service.getMemoryTemplate();
    expect(template.requiredFields).toContain("branchCode");
  });

  it("getTopicIndex returns empty topics when no index file", () => {
    const { service, tmpDir: d } = makeService();
    tmpDir = d;
    expect(service.getTopicIndex().topics).toEqual([]);
  });

  it("loadTopicFile returns content from cache after first load", () => {
    const { service, tmpDir: d, topicsDir } = makeService();
    tmpDir = d;
    // Write topic index
    const index = { topics: [{ id: "t1", title: "Test", keywords: ["test"], file: "t1.md" }] };
    fs.writeFileSync(path.join(topicsDir, "_index.json"), JSON.stringify(index));
    fs.writeFileSync(path.join(topicsDir, "t1.md"), "Topic 1 content");
    service.loadAllAgentConfig();
    const content = service.loadTopicFile("t1");
    expect(content).toBe("Topic 1 content");
    // Second call should use cache
    const content2 = service.loadTopicFile("t1");
    expect(content2).toBe("Topic 1 content");
  });

  it("getTopicMeta returns topic by id", () => {
    const { service, tmpDir: d, topicsDir } = makeService();
    tmpDir = d;
    const index = { topics: [{ id: "yazici", title: "Yazici", keywords: ["yazici"], file: "yazici.md" }] };
    fs.writeFileSync(path.join(topicsDir, "_index.json"), JSON.stringify(index));
    service.loadAllAgentConfig();
    const meta = service.getTopicMeta("yazici");
    expect(meta.id).toBe("yazici");
    expect(service.getTopicMeta("nonexistent")).toBeNull();
  });
});

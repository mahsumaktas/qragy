const path = require("path");
const fs = require("fs");
const { createAgentConfigService } = require("../../src/services/agentConfig.js");
const { createPromptBuilder } = require("../../src/services/promptBuilder.js");

// ── Helpers ──
function makeService(overrides = {}) {
  const tmpDir = path.join(__dirname, "_tmp_bootstrap_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6));
  fs.mkdirSync(tmpDir, { recursive: true });
  const topicsDir = path.join(tmpDir, "topics");
  fs.mkdirSync(topicsDir, { recursive: true });
  const memoryDir = path.join(tmpDir, "memory");
  fs.mkdirSync(memoryDir, { recursive: true });
  const templatesDir = path.join(tmpDir, "templates");
  fs.mkdirSync(templatesDir, { recursive: true });

  // Copy real template files for testing
  const realTemplatesDir = path.join(__dirname, "../../agent/templates");
  if (fs.existsSync(realTemplatesDir)) {
    for (const f of fs.readdirSync(realTemplatesDir)) {
      if (f.endsWith(".json")) {
        fs.copyFileSync(path.join(realTemplatesDir, f), path.join(templatesDir, f));
      }
    }
  }

  // Write minimal topic index
  fs.writeFileSync(path.join(topicsDir, "_index.json"), JSON.stringify({ topics: [] }));

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

  return { service, tmpDir, topicsDir, memoryDir, templatesDir };
}

function cleanup(dir) {
  try { fs.rmSync(dir, { recursive: true }); } catch (_) { /* ignore */ }
}

// ── Tests ──
describe("Zero-Shot Bootstrap", () => {
  let tmpDir;

  afterEach(() => {
    if (tmpDir) cleanup(tmpDir);
  });

  it("loadTemplate returns template for valid sector", () => {
    const { service, tmpDir: d } = makeService();
    tmpDir = d;
    const tmpl = service.loadTemplate("teknik-destek");
    expect(tmpl).not.toBeNull();
    expect(tmpl.sector).toBe("teknik-destek");
    expect(tmpl.title).toBe("Teknik Destek");
  });

  it("loadTemplate returns null for unknown sector", () => {
    const { service, tmpDir: d } = makeService();
    tmpDir = d;
    const tmpl = service.loadTemplate("bilinmeyen-sektor");
    expect(tmpl).toBeNull();
  });

  it("getAvailableTemplates lists all templates", () => {
    const { service, tmpDir: d } = makeService();
    tmpDir = d;
    const templates = service.getAvailableTemplates();
    expect(templates).toContain("teknik-destek");
    expect(templates).toContain("e-ticaret");
    expect(templates).toContain("restoran");
    expect(templates.length).toBe(3);
  });

  it("template has required structure", () => {
    const { service, tmpDir: d } = makeService();
    tmpDir = d;
    const sectors = ["teknik-destek", "e-ticaret", "restoran"];
    for (const sector of sectors) {
      const tmpl = service.loadTemplate(sector);
      expect(tmpl).not.toBeNull();
      expect(typeof tmpl.sector).toBe("string");
      expect(typeof tmpl.persona).toBe("string");
      expect(Array.isArray(tmpl.sampleQA)).toBe(true);
      expect(tmpl.sampleQA.length).toBeGreaterThan(0);
      for (const qa of tmpl.sampleQA) {
        expect(typeof qa.q).toBe("string");
        expect(typeof qa.a).toBe("string");
      }
    }
  });

  it("promptBuilder includes graceful fallback when KB empty", () => {
    const { service, tmpDir: d } = makeService();
    tmpDir = d;

    const promptBuilder = createPromptBuilder({
      getAgentTexts: () => ({
        SOUL_TEXT: "soul",
        PERSONA_TEXT: "persona",
        BOOTSTRAP_TEXT: "",
        DOMAIN_TEXT: "",
        SKILLS_TEXT: "",
        HARD_BANS_TEXT: "",
        ESCALATION_MATRIX_TEXT: "",
        RESPONSE_POLICY_TEXT: "",
        DOD_TEXT: "",
        OUTPUT_FILTER_TEXT: "",
      }),
      getTopicIndexSummary: () => "",
      loadTopicFile: () => "",
      getTopicMeta: () => null,
      getMemoryTemplate: () => ({ requiredFields: [], optionalFields: [] }),
    });

    // Empty knowledgeResults
    const prompt = promptBuilder.buildSystemPrompt({}, {}, [], {});
    expect(prompt).toContain("Bilgi tabaninda bu konuyla ilgili kayit BULUNAMADI");
    expect(prompt).toContain("detayli bilgim bulunmamaktadir");

    // null knowledgeResults
    const prompt2 = promptBuilder.buildSystemPrompt({}, {}, null, {});
    expect(prompt2).toContain("Bilgi tabaninda bu konuyla ilgili kayit BULUNAMADI");

    // With sectorTemplate option
    const tmpl = service.loadTemplate("e-ticaret");
    const prompt3 = promptBuilder.buildSystemPrompt({}, {}, [], { sectorTemplate: tmpl });
    expect(prompt3).toContain("Sektor Bilgisi: E-Ticaret");
    expect(prompt3).toContain("Online alisveris");
    expect(prompt3).toContain("Siparis numarasi ile sorgulama yap");

    // With NON-empty knowledgeResults, fallback should NOT appear
    const prompt4 = promptBuilder.buildSystemPrompt({}, {}, [{ question: "test", answer: "answer" }], {});
    expect(prompt4).not.toContain("Bilgi tabaninda ilgili kayit bulunamadi");
  });
});

describe("Config", () => {
  beforeEach(() => { vi.resetModules(); vi.unstubAllEnvs(); });

  it("should return default port 3000", () => {
    const { loadConfig } = require("../../src/config/index.js");
    expect(loadConfig({}).port).toBe(3000);
  });
  it("should parse PORT from env", () => {
    const { loadConfig } = require("../../src/config/index.js");
    expect(loadConfig({ PORT: "8080" }).port).toBe(8080);
  });
  it("should parse boolean RATE_LIMIT_ENABLED", () => {
    const { loadConfig } = require("../../src/config/index.js");
    expect(loadConfig({ RATE_LIMIT_ENABLED: "false" }).rateLimitEnabled).toBe(false);
  });
  it("should parse ZENDESK_DEFAULT_TAGS as array", () => {
    const { loadConfig } = require("../../src/config/index.js");
    expect(loadConfig({ ZENDESK_DEFAULT_TAGS: "tag1, tag2" }).zendeskDefaultTags).toEqual(["tag1", "tag2"]);
  });
  it("should enable zendesk when snippet key exists", () => {
    const { loadConfig } = require("../../src/config/index.js");
    expect(loadConfig({ ZENDESK_SNIPPET_KEY: "abc" }).zendeskEnabled).toBe(true);
  });
  it("should parse SUPPORT_OPEN_DAYS as number array", () => {
    const { loadConfig } = require("../../src/config/index.js");
    expect(loadConfig({ SUPPORT_OPEN_DAYS: "1,2,3,4,5" }).supportOpenDays).toEqual([1,2,3,4,5]);
  });
  it("should warn when GOOGLE_API_KEY is missing", () => {
    const { loadConfig, validateConfig } = require("../../src/config/index.js");
    const cfg = loadConfig({});
    const warnings = validateConfig(cfg);
    expect(warnings.some((w) => w.includes("GOOGLE_API_KEY"))).toBe(true);
  });
  it("should not warn when required keys are present", () => {
    const { loadConfig, validateConfig } = require("../../src/config/index.js");
    const cfg = loadConfig({ GOOGLE_API_KEY: "test-key", ADMIN_TOKEN: "tok" });
    const warnings = validateConfig(cfg);
    expect(warnings.length).toBe(0);
  });
  it("should parse SLA config", () => {
    const { loadConfig } = require("../../src/config/index.js");
    const cfg = loadConfig({ SLA_FIRST_RESPONSE_MIN: "10", SLA_RESOLUTION_MIN: "120" });
    expect(cfg.slaFirstResponseMin).toBe(10);
    expect(cfg.slaResolutionMin).toBe(120);
  });
  it("deterministicCollectionMode true by default", () => {
    const { loadConfig } = require("../../src/config/index.js");
    expect(loadConfig({}).deterministicCollectionMode).toBe(true);
  });
  it("deterministicCollectionMode false on '0'", () => {
    const { loadConfig } = require("../../src/config/index.js");
    expect(loadConfig({ DETERMINISTIC_COLLECTION_MODE: "0" }).deterministicCollectionMode).toBe(false);
  });
  it("deterministicCollectionMode false on 'no'", () => {
    const { loadConfig } = require("../../src/config/index.js");
    expect(loadConfig({ DETERMINISTIC_COLLECTION_MODE: "no" }).deterministicCollectionMode).toBe(false);
  });
  it("deterministicCollectionMode false on 'false'", () => {
    const { loadConfig } = require("../../src/config/index.js");
    expect(loadConfig({ DETERMINISTIC_COLLECTION_MODE: "false" }).deterministicCollectionMode).toBe(false);
  });
});

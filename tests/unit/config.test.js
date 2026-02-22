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
});

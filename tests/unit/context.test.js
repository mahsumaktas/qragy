describe("AppContext", () => {
  it("should create isolated context instances", () => {
    const { createAppContext } = require("../../src/context.js");
    const ctx1 = createAppContext();
    const ctx2 = createAppContext();

    ctx1.analyticsBuffer.push("event1");
    expect(ctx2.analyticsBuffer.length).toBe(0);
  });

  it("should initialize with expected structure", () => {
    const { createAppContext } = require("../../src/context.js");
    const ctx = createAppContext();

    expect(ctx.llmHealthStatus).toHaveProperty("ok", false);
    expect(ctx.llmErrorLog).toEqual([]);
    expect(ctx.analyticsBuffer).toEqual([]);
    expect(ctx.analyticsData).toEqual({ daily: {} });
    expect(ctx.clarificationCounters).toBeInstanceOf(Map);
    expect(ctx.topicFileCache).toBeInstanceOf(Map);
  });

  it("should have correct LLM_ERROR_WINDOW_MS", () => {
    const { createAppContext } = require("../../src/context.js");
    const ctx = createAppContext();
    expect(ctx.LLM_ERROR_WINDOW_MS).toBe(600000);
  });
});

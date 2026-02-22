describe("Logger", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it("should log info messages", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { createLogger } = require("../../src/utils/logger.js");
    const log = createLogger({ level: "info" });
    log.info("test", "hello world");
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0]).toContain("[INFO]");
    expect(spy.mock.calls[0][0]).toContain("[test]");
    expect(spy.mock.calls[0][0]).toContain("hello world");
  });

  it("should log warn messages", () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { createLogger } = require("../../src/utils/logger.js");
    const log = createLogger({ level: "warn" });
    log.warn("ctx", "warning message");
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0]).toContain("[WARN]");
  });

  it("should log error with extra detail", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { createLogger } = require("../../src/utils/logger.js");
    const log = createLogger({ level: "error" });
    log.error("db", "connection failed", new Error("ECONNREFUSED"));
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0]).toContain("ECONNREFUSED");
  });

  it("should respect log level - suppress debug when level is info", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { createLogger } = require("../../src/utils/logger.js");
    const log = createLogger({ level: "info" });
    log.debug("ctx", "debug message");
    expect(spy).not.toHaveBeenCalled();
  });

  it("should suppress info when level is warn", () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { createLogger } = require("../../src/utils/logger.js");
    const log = createLogger({ level: "warn" });
    log.info("ctx", "info message");
    log.warn("ctx", "warn message");
    expect(logSpy).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it("should include ISO timestamp", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { createLogger } = require("../../src/utils/logger.js");
    const log = createLogger({ level: "info" });
    log.info("test", "msg");
    expect(spy.mock.calls[0][0]).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

const { safeError, GENERIC_ERROR } = require("../../src/utils/errorHelper.js");

describe("Error Helper", () => {
  it("should return generic message for unknown errors", () => {
    const result = safeError(new Error("SQLITE_CONSTRAINT: UNIQUE"), "test");
    expect(result).toBe(GENERIC_ERROR);
  });

  it("should pass through safe prefixes", () => {
    expect(safeError(new Error("Invalid parameter"), "test")).toBe("Invalid parameter");
    expect(safeError(new Error("Missing field: email"), "test")).toBe("Missing field: email");
    expect(safeError(new Error("Not found"), "test")).toBe("Not found");
  });

  it("should handle JSON/SyntaxError specially", () => {
    const syntaxErr = new SyntaxError("Unexpected token < in JSON");
    expect(safeError(syntaxErr, "test")).toBe("Invalid data format.");
  });

  it("should handle JSON keyword in message", () => {
    expect(safeError(new Error("Invalid JSON payload"), "test")).toBe("Invalid data format.");
  });

  it("should handle null/undefined errors", () => {
    expect(safeError(null, "test")).toBe(GENERIC_ERROR);
    expect(safeError(undefined, "test")).toBe(GENERIC_ERROR);
  });

  it("should log full error to console", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    safeError(new Error("secret db path /var/data"), "admin-endpoint");
    expect(spy).toHaveBeenCalledWith("[admin-endpoint] Error:", "secret db path /var/data");
    spy.mockRestore();
  });
});

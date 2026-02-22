const { safeError, GENERIC_ERROR } = require("../../src/utils/errorHelper.js");

describe("Error Helper", () => {
  it("should return generic message for unknown errors", () => {
    const result = safeError(new Error("SQLITE_CONSTRAINT: UNIQUE"), "test");
    expect(result).toBe(GENERIC_ERROR);
  });

  it("should pass through safe prefixes", () => {
    expect(safeError(new Error("Gecersiz parametre"), "test")).toBe("Gecersiz parametre");
    expect(safeError(new Error("Eksik alan: email"), "test")).toBe("Eksik alan: email");
    expect(safeError(new Error("Bulunamadi"), "test")).toBe("Bulunamadi");
  });

  it("should handle JSON/SyntaxError specially", () => {
    const syntaxErr = new SyntaxError("Unexpected token < in JSON");
    expect(safeError(syntaxErr, "test")).toBe("Gecersiz veri formati.");
  });

  it("should handle JSON keyword in message", () => {
    expect(safeError(new Error("Invalid JSON payload"), "test")).toBe("Gecersiz veri formati.");
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

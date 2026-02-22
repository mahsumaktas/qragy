// Smoke test — test framework'un dogru calistigini dogrular
describe("Test Framework", () => {
  it("should run a basic assertion", () => {
    expect(1 + 1).toBe(2);
  });

  it("should handle truthy/falsy checks", () => {
    expect(true).toBeTruthy();
    expect(null).toBeFalsy();
    expect(undefined).toBeFalsy();
  });

  it("should compare objects", () => {
    const config = { env: "test", port: 3000 };
    expect(config).toEqual({ env: "test", port: 3000 });
  });
});

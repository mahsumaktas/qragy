const { createCorsMiddleware } = require("../../src/middleware/cors.js");

function makeReqRes(origin, method = "GET") {
  const headers = {};
  return {
    req: { headers: { origin }, method },
    res: {
      header(k, v) { headers[k] = v; },
      sendStatus(code) { headers._status = code; },
      _headers: headers,
    },
  };
}

describe("CORS Middleware", () => {
  const middleware = createCorsMiddleware({ port: 3000, getAllowedOrigin: () => "" });

  it("sets CORS header for localhost origin", () => {
    const { req, res } = makeReqRes("http://localhost:3000");
    let called = false;
    middleware(req, res, () => { called = true; });
    expect(res._headers["Access-Control-Allow-Origin"]).toBe("http://localhost:3000");
    expect(called).toBe(true);
  });

  it("blocks unknown origin", () => {
    const { req, res } = makeReqRes("http://evil.com");
    middleware(req, res, () => {});
    expect(res._headers["Access-Control-Allow-Origin"]).toBeUndefined();
  });

  it("allows ALLOWED_ORIGIN env value", () => {
    const mw = createCorsMiddleware({ port: 3000, getAllowedOrigin: () => "https://myapp.com" });
    const { req, res } = makeReqRes("https://myapp.com");
    mw(req, res, () => {});
    expect(res._headers["Access-Control-Allow-Origin"]).toBe("https://myapp.com");
  });

  it("returns 204 for OPTIONS preflight", () => {
    const { req, res } = makeReqRes("http://localhost:3000", "OPTIONS");
    middleware(req, res, () => {});
    expect(res._headers._status).toBe(204);
  });
});

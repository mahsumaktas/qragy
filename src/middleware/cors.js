function createCorsMiddleware({ port, getAllowedOrigin }) {
  return function corsMiddleware(req, res, next) {
    const origin = req.headers.origin || "";
    const allowed = ["http://localhost:" + port, "http://127.0.0.1:" + port];
    const envOrigin = getAllowedOrigin();
    if (envOrigin) envOrigin.split(",").forEach((o) => allowed.push(o.trim()));
    if (allowed.includes(origin)) res.header("Access-Control-Allow-Origin", origin);
    res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type, X-Admin-Token, X-API-Key");
    if (req.method === "OPTIONS") return res.sendStatus(204);
    return next();
  };
}

module.exports = { createCorsMiddleware };

// src/middleware/security.js

function securityHeaders(req, res, next) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("X-XSS-Protection", "1; mode=block");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "geolocation=(), microphone=(), camera=()");

  // Admin v2 icin Google Fonts, Cloudflare Access/Insights gerekli
  if (req.path.startsWith("/admin-v2")) {
    res.setHeader("Content-Security-Policy", "default-src 'self'; script-src 'self' 'unsafe-inline' https://static.cloudflareinsights.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data: blob: https://*.cloudflareaccess.com; connect-src 'self' https://cloudflareinsights.com; font-src 'self' https://fonts.gstatic.com; frame-src 'self';");
  } else {
    res.setHeader("Content-Security-Policy", "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; font-src 'self'; frame-src 'self';");
  }

  res.setHeader("X-Permitted-Cross-Domain-Policies", "none");

  const isSecure = req.secure || (req.headers && req.headers["x-forwarded-proto"] === "https");
  if (isSecure) {
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }

  next();
}

module.exports = { securityHeaders };

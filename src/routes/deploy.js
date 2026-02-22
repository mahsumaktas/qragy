"use strict";

/**
 * Deploy Webhook Route
 *
 * GitHub webhook receiver for auto-deploy on main branch push.
 * Validates HMAC signature, runs deploy.sh.
 * mount(app, deps) pattern.
 */
function mount(app, deps) {
  const { express, crypto, fs, path, logger, getDeployWebhookSecret, appDir } = deps;

  const secret = getDeployWebhookSecret();
  if (!secret) return;

  app.post("/deploy", express.raw({ type: "application/json", limit: "500kb" }), (req, res) => {
    const sig = req.headers["x-hub-signature-256"] || "";
    const expected = "sha256=" + crypto.createHmac("sha256", getDeployWebhookSecret()).update(req.body).digest("hex");
    if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
      return res.status(403).json({ error: "Invalid signature" });
    }

    let payload;
    try { payload = JSON.parse(req.body.toString()); } catch (_err) {
      return res.status(400).json({ error: "Invalid JSON" });
    }
    if (payload.ref !== "refs/heads/main") return res.json({ status: "ignored", reason: "not main branch" });

    logger.info("deploy", "Main branch push detected, deploying...");
    res.json({ status: "deploying" });

    // execSync with hardcoded script path - no user input in command
    const { execSync } = require("child_process");
    const deployScript = path.join(appDir, "deploy.sh");
    if (fs.existsSync(deployScript)) {
      try {
        execSync(`bash "${deployScript}"`, { cwd: appDir, stdio: "inherit", timeout: 120000 });
      } catch (err) {
        logger.error("deploy", "Deploy failed", err);
      }
    } else {
      logger.error("deploy", "deploy.sh not found");
    }
  });
  logger.info("deploy", "Webhook endpoint aktif: POST /deploy");
}

module.exports = { mount };

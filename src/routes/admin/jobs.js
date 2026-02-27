"use strict";

/**
 * Admin Job Queue Routes
 *
 * Dead job management: stats, list, retry, purge.
 * All endpoints behind requireAdminAccess middleware.
 */

function mount(app, deps) {
  const { requireAdminAccess, jobQueue } = deps;

  if (!jobQueue) return;

  // GET /api/admin/jobs/stats
  app.get("/api/admin/jobs/stats", requireAdminAccess, (_req, res) => {
    const stats = jobQueue.getStats();
    res.json({ ok: true, stats });
  });

  // GET /api/admin/jobs/dead?limit=50
  app.get("/api/admin/jobs/dead", requireAdminAccess, (req, res) => {
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
    const jobs = jobQueue.listDead(limit);
    res.json({ ok: true, jobs });
  });

  // POST /api/admin/jobs/:id/retry
  app.post("/api/admin/jobs/:id/retry", requireAdminAccess, (req, res) => {
    const jobId = Number(req.params.id);
    if (!jobId || !Number.isFinite(jobId)) {
      return res.status(400).json({ error: "Gecersiz job id." });
    }
    const ok = jobQueue.retryDead(jobId);
    if (!ok) {
      return res.status(404).json({ error: "Dead job bulunamadi." });
    }
    res.json({ ok: true });
  });

  // DELETE /api/admin/jobs/dead
  app.delete("/api/admin/jobs/dead", requireAdminAccess, (_req, res) => {
    const purged = jobQueue.purgeDead();
    res.json({ ok: true, purged });
  });
}

module.exports = { mount };

"use strict";

/**
 * Eval Routes — Senaryo CRUD + Test Runner + Gecmis
 *
 * scenarios.json tek kaynak dosyasi: hem CLI vitest hem admin panel kullanir.
 * Test runner sunucu tarafindan calistirilir (chat API'ye fetch + judge.js).
 * SSE ile canli ilerleme destegi.
 */

const { judgeTurn } = require("../../../tests/eval/judge.js");

function mount(app, deps) {
  const { requireAdminAccess, fs, path, logger, recordAuditEvent, PORT } = deps;

  const SCENARIOS_PATH = path.resolve(__dirname, "../../../tests/eval/scenarios.json");
  const HISTORY_PATH = path.resolve(__dirname, "../../../tests/eval/history.json");

  // ── Helpers ──────────────────────────────────────────────────────────
  function loadScenarios() {
    return JSON.parse(fs.readFileSync(SCENARIOS_PATH, "utf8"));
  }

  function saveScenarios(data) {
    fs.writeFileSync(SCENARIOS_PATH, JSON.stringify(data, null, 2) + "\n");
  }

  function loadHistory() {
    if (!fs.existsSync(HISTORY_PATH)) return [];
    try {
      return JSON.parse(fs.readFileSync(HISTORY_PATH, "utf8"));
    } catch {
      return [];
    }
  }

  function saveHistory(history) {
    fs.writeFileSync(HISTORY_PATH, JSON.stringify(history, null, 2) + "\n");
  }

  const BASE_URL = `http://localhost:${PORT || 3001}`;

  async function sendTurn(messages, sessionId) {
    const res = await fetch(`${BASE_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages, sessionId }),
    });
    if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
    return res.json();
  }

  /**
   * Tek senaryo calistir, sonuclari don.
   */
  async function runScenario(scenario) {
    const sessionId = `eval-admin-${scenario.id}-${Date.now().toString(36)}`;
    const messages = [];
    let previousReply = null;
    const turnResults = [];
    let allPass = true;

    for (let i = 0; i < scenario.turns.length; i++) {
      const turn = scenario.turns[i];
      messages.push({ role: "user", content: turn.user });

      try {
        const response = await sendTurn(messages, sessionId);
        if (response.reply) {
          messages.push({ role: "assistant", content: response.reply });
        }

        const verdict = judgeTurn(response, turn.expect, previousReply);
        previousReply = response.reply;

        const turnPass = verdict.failCount === 0;
        if (!turnPass) allPass = false;

        turnResults.push({
          turnIndex: i,
          user: turn.user,
          botReply: (response.reply || "").slice(0, 500),
          pass: turnPass,
          checks: verdict.results,
        });
      } catch (err) {
        allPass = false;
        turnResults.push({
          turnIndex: i,
          user: turn.user,
          botReply: null,
          pass: false,
          checks: [{ check: "API call", pass: false, message: err.message }],
        });
        break; // Sonraki turn'lari calistirmaya gerek yok
      }
    }

    return { scenarioId: scenario.id, pass: allPass, turnResults };
  }

  // ── CRUD: Scenarios ──────────────────────────────────────────────────

  // GET /api/admin/eval/scenarios — Tum senaryolar
  app.get("/api/admin/eval/scenarios", requireAdminAccess, (req, res) => {
    try {
      const data = loadScenarios();
      res.json({ scenarios: data.scenarios || [] });
    } catch (err) {
      logger.error("eval", "Senaryolar yuklenemedi", err);
      res.status(500).json({ error: "Senaryolar yuklenemedi" });
    }
  });

  // GET /api/admin/eval/scenarios/:id — Tek senaryo
  app.get("/api/admin/eval/scenarios/:id", requireAdminAccess, (req, res) => {
    try {
      const data = loadScenarios();
      const scenario = (data.scenarios || []).find(s => s.id === req.params.id);
      if (!scenario) return res.status(404).json({ error: "Senaryo bulunamadi" });
      res.json(scenario);
    } catch (err) {
      res.status(500).json({ error: "Senaryo okunamadi" });
    }
  });

  // POST /api/admin/eval/scenarios — Yeni senaryo ekle
  app.post("/api/admin/eval/scenarios", requireAdminAccess, (req, res) => {
    try {
      const data = loadScenarios();
      const scenario = req.body;

      // Validasyon
      if (!scenario.id || typeof scenario.id !== "string") {
        return res.status(400).json({ error: "id zorunlu (string)" });
      }
      if ((data.scenarios || []).some(s => s.id === scenario.id)) {
        return res.status(400).json({ error: "Bu id zaten mevcut: " + scenario.id });
      }
      if (!Array.isArray(scenario.turns) || scenario.turns.length === 0) {
        return res.status(400).json({ error: "En az bir turn gerekli" });
      }
      for (const t of scenario.turns) {
        if (!t.user || typeof t.user !== "string") {
          return res.status(400).json({ error: "Her turn'da user mesaji olmali" });
        }
      }

      const newScenario = {
        id: scenario.id,
        title: scenario.title || scenario.id,
        tags: Array.isArray(scenario.tags) ? scenario.tags : [],
        turns: scenario.turns,
      };

      data.scenarios = data.scenarios || [];
      data.scenarios.push(newScenario);
      saveScenarios(data);

      recordAuditEvent("eval_scenario_create", { scenarioId: newScenario.id });
      logger.info("eval", `Senaryo eklendi: ${newScenario.id}`);
      res.status(201).json(newScenario);
    } catch (err) {
      logger.error("eval", "Senaryo eklenemedi", err);
      res.status(500).json({ error: "Senaryo eklenemedi" });
    }
  });

  // PUT /api/admin/eval/scenarios/:id — Senaryo guncelle
  app.put("/api/admin/eval/scenarios/:id", requireAdminAccess, (req, res) => {
    try {
      const data = loadScenarios();
      const idx = (data.scenarios || []).findIndex(s => s.id === req.params.id);
      if (idx === -1) return res.status(404).json({ error: "Senaryo bulunamadi" });

      const update = req.body;

      // ID degistirme kontrolu
      if (update.id && update.id !== req.params.id) {
        if (data.scenarios.some(s => s.id === update.id)) {
          return res.status(400).json({ error: "Bu id zaten mevcut: " + update.id });
        }
      }

      if (update.turns) {
        if (!Array.isArray(update.turns) || update.turns.length === 0) {
          return res.status(400).json({ error: "En az bir turn gerekli" });
        }
        for (const t of update.turns) {
          if (!t.user || typeof t.user !== "string") {
            return res.status(400).json({ error: "Her turn'da user mesaji olmali" });
          }
        }
      }

      const existing = data.scenarios[idx];
      data.scenarios[idx] = {
        id: update.id || existing.id,
        title: update.title !== undefined ? update.title : existing.title,
        tags: Array.isArray(update.tags) ? update.tags : existing.tags,
        turns: update.turns || existing.turns,
      };

      saveScenarios(data);
      recordAuditEvent("eval_scenario_update", { scenarioId: data.scenarios[idx].id });
      res.json(data.scenarios[idx]);
    } catch (err) {
      logger.error("eval", "Senaryo guncellenemedi", err);
      res.status(500).json({ error: "Senaryo guncellenemedi" });
    }
  });

  // DELETE /api/admin/eval/scenarios/:id — Senaryo sil
  app.delete("/api/admin/eval/scenarios/:id", requireAdminAccess, (req, res) => {
    try {
      const data = loadScenarios();
      const idx = (data.scenarios || []).findIndex(s => s.id === req.params.id);
      if (idx === -1) return res.status(404).json({ error: "Senaryo bulunamadi" });

      const removed = data.scenarios.splice(idx, 1)[0];
      saveScenarios(data);

      recordAuditEvent("eval_scenario_delete", { scenarioId: removed.id });
      logger.info("eval", `Senaryo silindi: ${removed.id}`);
      res.json({ ok: true, id: removed.id });
    } catch (err) {
      logger.error("eval", "Senaryo silinemedi", err);
      res.status(500).json({ error: "Senaryo silinemedi" });
    }
  });

  // ── Test Runner ──────────────────────────────────────────────────────

  // POST /api/admin/eval/run/:id — Tek senaryo calistir
  app.post("/api/admin/eval/run/:id", requireAdminAccess, async (req, res) => {
    try {
      const data = loadScenarios();
      const scenario = (data.scenarios || []).find(s => s.id === req.params.id);
      if (!scenario) return res.status(404).json({ error: "Senaryo bulunamadi" });

      logger.info("eval", `Tek senaryo calistiriliyor: ${scenario.id}`);
      const result = await runScenario(scenario);
      res.json(result);
    } catch (err) {
      logger.error("eval", "Test calistirma hatasi", err);
      res.status(500).json({ error: "Test calistirma hatasi: " + err.message });
    }
  });

  // GET /api/admin/eval/run-all — SSE ile tum senaryolari calistir
  app.get("/api/admin/eval/run-all", requireAdminAccess, async (req, res) => {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });

    const sendSSE = (data) => {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    try {
      const data = loadScenarios();
      const scenarios = data.scenarios || [];
      const total = scenarios.length;
      let passed = 0;
      let failed = 0;
      const allResults = [];
      const startTime = Date.now();

      logger.info("eval", `Toplu eval basliyor: ${total} senaryo`);

      for (const scenario of scenarios) {
        try {
          const result = await runScenario(scenario);
          allResults.push(result);

          if (result.pass) passed++;
          else failed++;

          sendSSE({
            type: "progress",
            scenarioId: scenario.id,
            pass: result.pass,
            turnResults: result.turnResults,
          });
        } catch (err) {
          failed++;
          allResults.push({
            scenarioId: scenario.id,
            pass: false,
            turnResults: [{ error: err.message }],
          });
          sendSSE({
            type: "progress",
            scenarioId: scenario.id,
            pass: false,
            turnResults: [{ error: err.message }],
          });
        }
      }

      const durationMs = Date.now() - startTime;

      // Gecmise kaydet
      const historyEntry = {
        timestamp: new Date().toISOString(),
        total,
        passed,
        failed,
        durationMs,
        results: allResults,
      };

      const history = loadHistory();
      history.unshift(historyEntry);
      // Son 50 kayit tut
      if (history.length > 50) history.length = 50;
      saveHistory(history);

      sendSSE({
        type: "done",
        summary: { total, passed, failed, durationMs },
      });

      logger.info("eval", `Toplu eval tamamlandi: ${passed}/${total} gecti (${durationMs}ms)`);
      recordAuditEvent("eval_run_all", { total, passed, failed, durationMs });
    } catch (err) {
      logger.error("eval", "Toplu eval hatasi", err);
      sendSSE({ type: "error", message: err.message });
    }

    res.end();
  });

  // ── History ──────────────────────────────────────────────────────────

  // GET /api/admin/eval/history — Son N calistirma
  app.get("/api/admin/eval/history", requireAdminAccess, (req, res) => {
    try {
      const limit = Math.min(parseInt(req.query.limit) || 20, 50);
      const history = loadHistory().slice(0, limit);
      res.json(history);
    } catch (err) {
      res.status(500).json({ error: "Gecmis yuklenemedi" });
    }
  });

  // DELETE /api/admin/eval/history — Gecmisi temizle
  app.delete("/api/admin/eval/history", requireAdminAccess, (req, res) => {
    try {
      saveHistory([]);
      recordAuditEvent("eval_history_clear", {});
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: "Gecmis temizlenemedi" });
    }
  });
}

module.exports = { mount };

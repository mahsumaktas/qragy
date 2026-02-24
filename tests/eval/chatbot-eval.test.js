"use strict";

/**
 * Chatbot Eval Suite
 *
 * Canli sunucuya karsi multi-turn konusma senaryolarini test eder.
 * Her senaryo birden fazla turn icerebilir.
 * Her turn'da rule-based assertions calistirilir.
 *
 * Kullanim:
 *   npx vitest run tests/eval/chatbot-eval.test.js
 *   EVAL_BASE_URL=http://localhost:3001 npx vitest run tests/eval/chatbot-eval.test.js
 */

const { judgeTurn } = require("./judge.js");
const scenarioData = require("./scenarios.json");

const BASE_URL = process.env.EVAL_BASE_URL || scenarioData.baseUrl;
const API_PATH = "/api/chat";

// Her senaryo icin benzersiz session ID
let sessionCounter = 0;
function makeSessionId(scenarioId) {
  sessionCounter += 1;
  return `eval-${scenarioId}-${Date.now().toString(36)}-${sessionCounter}`;
}

/**
 * API'ye tek bir turn gonderi ve response al.
 * messages: tum konusma gecmisi (onceki turnlar dahil)
 */
async function sendTurn(messages, sessionId) {
  const res = await fetch(`${BASE_URL}${API_PATH}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages, sessionId }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API ${res.status}: ${text}`);
  }

  return res.json();
}

// ── Eval Suite ─────────────────────────────────────────────────────────────

describe("Chatbot Eval Suite", () => {
  // Baslangicta sunucu erisimini kontrol et
  it("sunucu erisilebilir olmali", async () => {
    const res = await fetch(`${BASE_URL}/api/health`);
    expect(res.ok).toBe(true);
  }, 10_000);

  // Her senaryo icin test
  for (const scenario of scenarioData.scenarios) {
    describe(`[${scenario.id}] ${scenario.title}`, () => {
      const messages = [];
      const sessionId = makeSessionId(scenario.id);
      let previousReply = null;
      const turnResponses = [];

      for (let turnIdx = 0; turnIdx < scenario.turns.length; turnIdx++) {
        const turn = scenario.turns[turnIdx];
        const turnLabel = `Turn ${turnIdx + 1}: "${turn.user.slice(0, 50)}${turn.user.length > 50 ? "..." : ""}"`;

        it(turnLabel, async () => {
          // Kullanici mesajini ekle
          messages.push({ role: "user", content: turn.user });

          // API'ye gonder
          const response = await sendTurn(messages, sessionId);

          // Asistan yanitini gecmise ekle (sonraki turnlar icin)
          if (response.reply) {
            messages.push({ role: "assistant", content: response.reply });
          }

          // Assertions calistir
          const verdict = judgeTurn(response, turn.expect, previousReply);
          turnResponses.push({ turn: turnIdx + 1, response, verdict });

          // Onceki reply'i kaydet (anti-repetition icin)
          previousReply = response.reply;

          // Sonuclari logla
          const icon = verdict.failCount === 0 ? "PASS" : "FAIL";
          const details = verdict.results
            .map(r => `  ${r.pass ? "+" : "x"} ${r.check}: ${r.message}`)
            .join("\n");

          // Debug: her turnu goster
          console.log(`\n${icon} [${scenario.id}] Turn ${turnIdx + 1}`);
          console.log(`  User: ${turn.user.slice(0, 80)}`);
          console.log(`  Bot:  ${(response.reply || "").slice(0, 120)}`);
          console.log(details);

          // Fail olan assertion varsa testi fail et
          expect(verdict.failCount, `${verdict.failCount} assertion basarisiz:\n${details}`).toBe(0);
        }, 30_000); // LLM response suresi icin 30sn timeout
      }
    });
  }
});

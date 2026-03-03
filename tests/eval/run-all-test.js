/**
 * Run all eval scenarios via SSE endpoint (3-run consensus)
 * Usage: node tests/eval/run-all-test.js
 */
const BASE_URL = "http://100.95.186.37:3001";
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || "";

async function main() {
  const url = `${BASE_URL}/api/admin/eval/run-all?runs=3&token=${ADMIN_TOKEN}`;
  console.log(`Starting eval: 85 scenarios, 3 runs each...`);
  console.log(`URL: ${url}\n`);

  const res = await fetch(url, {
    headers: { "x-admin-token": ADMIN_TOKEN }
  });

  if (!res.ok) {
    console.error(`HTTP ${res.status}: ${await res.text()}`);
    process.exit(1);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let _passed = 0, _failed = 0, total = 0;
  const failures = [];

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const data = JSON.parse(line.slice(6));

      if (data.type === "progress") {
        total++;
        const status = data.pass ? "PASS" : "FAIL";
        const consensus = data.consensus
          ? ` (${data.consensus.passCount}/${data.consensus.runs} run, ${data.consensus.verdict})`
          : "";
        const icon = data.pass ? "+" : "X";
        console.log(`[${icon}] ${total}/85 ${data.scenarioId}: ${status}${consensus}`);

        if (data.pass) _passed++;
        else {
          _failed++;
          failures.push({
            id: data.scenarioId,
            consensus: data.consensus,
            turns: (data.turnResults || []).filter(t => !t.pass).map(t => ({
              turn: t.turnIndex,
              user: (t.user || "").slice(0, 50),
              checks: (t.checks || []).filter(c => !c.pass).map(c => c.check + ": " + (c.message || ""))
            }))
          });
        }
      }

      if (data.type === "done") {
        const s = data.summary;
        console.log("\n" + "=".repeat(60));
        console.log(`RESULT: ${s.passed}/${s.total} passed (${s.passRate}%)`);
        console.log(`Status: ${s.green ? "GREEN" : "RED"} (threshold: ${s.threshold}%)`);
        console.log(`Flaky: ${s.flaky} | Consensus runs: ${s.consensusRuns}`);
        console.log(`Duration: ${(s.durationMs / 1000).toFixed(1)}s`);
        console.log("=".repeat(60));

        if (failures.length > 0) {
          console.log("\nFAILED SCENARIOS:");
          for (const f of failures) {
            const c = f.consensus ? ` (${f.consensus.passCount}/${f.consensus.runs} runs passed)` : "";
            console.log(`\n  ${f.id}${c}:`);
            for (const t of f.turns) {
              console.log(`    Turn ${t.turn}: "${t.user}"`);
              for (const check of t.checks) {
                console.log(`      - ${check}`);
              }
            }
          }
        }
      }

      if (data.type === "error") {
        console.error("ERROR:", data.message);
      }
    }
  }
}

main().catch(err => {
  console.error("Fatal:", err.message);
  process.exit(1);
});

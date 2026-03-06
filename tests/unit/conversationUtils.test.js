const fs = require("fs");
const os = require("os");
const path = require("path");
const { createConversationUtils } = require("../../src/services/conversationUtils.js");
const { normalizeForMatching } = require("../../src/utils/sanitizer.js");

function makeUtils(initial = { gaps: [] }) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "qragy-conv-utils-"));
  const contentGapsFile = path.join(tmpDir, "content-gaps.json");
  fs.writeFileSync(contentGapsFile, JSON.stringify(initial, null, 2), "utf8");

  const utils = createConversationUtils({
    callLLM: async () => ({ reply: "" }),
    callLLMWithFallback: async () => ({ reply: "" }),
    getProviderConfig: () => ({ provider: "test", apiKey: "x" }),
    normalizeForMatching,
    logger: { warn() {}, info() {}, error() {} },
    fs,
    contentGapsFile,
    nowIso: () => "2026-03-06T00:00:00.000Z",
  });

  return { utils, tmpDir, contentGapsFile };
}

function cleanup(tmpDir) {
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch (_) {
    // ignore cleanup errors in tests
  }
}

describe("conversationUtils content gaps", () => {
  let tmpDir = null;

  afterEach(() => {
    if (tmpDir) cleanup(tmpDir);
    tmpDir = null;
  });

  it("filters acknowledgement and gibberish entries while grouping actionable queries", () => {
    const fixture = makeUtils({
      gaps: [
        { query: "asdfjkl qwerty zxcvbn", count: 74, lastSeen: "2026-02-28T10:13:49.365Z" },
        { query: "tamam, deneyecegim tesekkurler", count: 26, lastSeen: "2026-03-01T14:32:47.388Z" },
        { query: "olmuyor, denedim ama ayni hatayi veriyor", count: 12, lastSeen: "2026-03-03T11:00:00.000Z" },
        { query: "Bilet yazdıramıyorum", count: 4, lastSeen: "2026-03-05T10:00:00.000Z" },
        { query: "bilet yazdiramiyorum", count: 3, lastSeen: "2026-03-06T10:00:00.000Z" },
      ],
    });
    tmpDir = fixture.tmpDir;

    const report = fixture.utils.getContentGapReport({ limit: 20 });

    expect(report.summary.actionableCount).toBe(1);
    expect(report.summary.filteredCount).toBe(3);
    expect(report.summary.filteredReasonCounts.test_or_gibberish).toBe(1);
    expect(report.summary.filteredReasonCounts.acknowledgement).toBe(1);
    expect(report.summary.filteredReasonCounts.generic_followup).toBe(1);
    expect(report.gaps[0].count).toBe(7);
    expect(report.gaps[0].suggestionKey).toBe("expand_existing_coverage");
  });

  it("recordContentGap ignores noisy inputs and pruneContentGaps removes them from storage", () => {
    const fixture = makeUtils({
      gaps: [
        { query: "yazici sorunu yasiyorum", count: 5, lastSeen: "2026-03-01T10:00:00.000Z" },
        { query: "tamam tesekkurler", count: 3, lastSeen: "2026-03-02T10:00:00.000Z" },
      ],
    });
    tmpDir = fixture.tmpDir;

    expect(fixture.utils.recordContentGap("tamamdir tesekkur ederim")).toBe(false);
    expect(fixture.utils.recordContentGap("Bazi sayfalara erisemiyorum, yetkim yok diyor")).toBe(true);

    const pruned = fixture.utils.pruneContentGaps();
    const saved = JSON.parse(fs.readFileSync(fixture.contentGapsFile, "utf8"));

    expect(pruned.removedCount).toBe(1);
    expect(pruned.keptCount).toBe(2);
    expect(saved.gaps).toHaveLength(2);
    expect(saved.gaps.some((item) => item.query.includes("tesekkur"))).toBe(false);
  });
});

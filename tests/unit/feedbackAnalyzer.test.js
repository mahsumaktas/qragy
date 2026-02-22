const { createFeedbackAnalyzer } = require("../../src/services/feedbackAnalyzer.js");

function makeAnalyzer() {
  return createFeedbackAnalyzer({
    logger: { info() {}, warn() {}, error() {} },
  });
}

function makeEntry(overrides = {}) {
  return {
    sessionId: overrides.sessionId || "sess-1",
    messageIndex: overrides.messageIndex || 0,
    type: overrides.type || "down",
    timestamp: overrides.timestamp || new Date().toISOString(),
    userMessage: overrides.userMessage || "sube kodu nedir",
    botResponse: overrides.botResponse || "Maalesef bu konuda bilgim yok.",
  };
}

describe("feedbackAnalyzer", () => {
  it("analyze groups negative feedback by pattern", () => {
    const analyzer = makeAnalyzer();
    const entries = [
      makeEntry({ userMessage: "kargo nerede kaldi", type: "down" }),
      makeEntry({ userMessage: "kargo nerede kaldi benim paketim", type: "down" }),
      makeEntry({ userMessage: "iade nasil yapilir", type: "down" }),
    ];
    const result = analyzer.analyze(entries, { days: 7 });

    expect(result.summary.negative).toBe(3);
    expect(result.summary.topIssues.length).toBeGreaterThanOrEqual(1);
    // Both "kargo nerede kaldi" entries share same first 3 significant words
    const kargoGroup = result.summary.topIssues.find(g => g.key.includes("kargo"));
    expect(kargoGroup).toBeDefined();
    expect(kargoGroup.count).toBe(2);
  });

  it("analyze handles empty data", () => {
    const analyzer = makeAnalyzer();

    const resultEmpty = analyzer.analyze([], { days: 7 });
    expect(resultEmpty.negative).toEqual([]);
    expect(resultEmpty.summary.total).toBe(0);
    expect(resultEmpty.summary.negative).toBe(0);
    expect(resultEmpty.summary.positive).toBe(0);
    expect(resultEmpty.summary.topIssues).toEqual([]);

    const resultNull = analyzer.analyze(null);
    expect(resultNull.summary.total).toBe(0);
  });

  it("analyze filters by days", () => {
    const analyzer = makeAnalyzer();
    const now = new Date();
    const oldDate = new Date(now.getTime() - 30 * 86400000).toISOString(); // 30 days ago
    const recentDate = new Date(now.getTime() - 2 * 86400000).toISOString(); // 2 days ago

    const entries = [
      makeEntry({ timestamp: oldDate, type: "down", userMessage: "eski sorun" }),
      makeEntry({ timestamp: recentDate, type: "down", userMessage: "yeni sorun" }),
    ];

    // days=7 should only include the recent entry
    const result = analyzer.analyze(entries, { days: 7 });
    expect(result.summary.total).toBe(1);
    expect(result.summary.negative).toBe(1);
    expect(result.negative).toHaveLength(1);
    expect(result.negative[0].userMessage).toBe("yeni sorun");
  });

  it("analyze separates positive and negative", () => {
    const analyzer = makeAnalyzer();
    const entries = [
      makeEntry({ type: "up", userMessage: "harika cevap" }),
      makeEntry({ type: "up", userMessage: "tesekkurler" }),
      makeEntry({ type: "positive", userMessage: "cok iyi" }),
      makeEntry({ type: "down", userMessage: "kotu cevap" }),
      makeEntry({ type: "negative", userMessage: "yanlis bilgi" }),
    ];

    const result = analyzer.analyze(entries, { days: 7 });
    expect(result.summary.total).toBe(5);
    expect(result.summary.positive).toBe(3);
    expect(result.summary.negative).toBe(2);
    expect(result.negative).toHaveLength(2);
  });

  it("analyze limits examples per group to 3", () => {
    const analyzer = makeAnalyzer();
    const entries = [];
    for (let i = 0; i < 5; i++) {
      entries.push(makeEntry({
        type: "down",
        userMessage: "ayni konu hakkinda soru " + i,
        botResponse: "yanit " + i,
        sessionId: "sess-" + i,
      }));
    }

    const result = analyzer.analyze(entries, { days: 7 });
    expect(result.summary.negative).toBe(5);
    // All entries have same first 3 significant words: "ayni konu hakkinda"
    expect(result.summary.topIssues).toHaveLength(1);
    expect(result.summary.topIssues[0].count).toBe(5);
    expect(result.summary.topIssues[0].examples).toHaveLength(3);
  });
});

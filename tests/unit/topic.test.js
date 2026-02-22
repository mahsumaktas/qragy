const { detectTopicByKeyword, getTopicFile, getTopicMeta } = require("../../src/services/topic.js");

describe("Topic", () => {
  const sampleIndex = {
    topics: [
      { id: "yazici-sorunu", keywords: ["yazici", "yazicim calismiyor", "baski cikmiyor"], file: "yazici-sorunu.md" },
      { id: "giris-yapamiyorum", keywords: ["giris yapamiyorum", "login olamiyorum"], file: "giris-yapamiyorum.md" },
      { id: "rapor-alma", keywords: ["rapor", "rapor alma"], file: "rapor-alma.md" },
    ],
  };

  describe("detectTopicByKeyword", () => {
    it("should match keyword", () => {
      const r = detectTopicByKeyword("yazicim calismiyor yardim edin", sampleIndex);
      expect(r.topicId).toBe("yazici-sorunu");
      expect(r.confidence).toBe(0.9);
    });
    it("should prefer longest match", () => {
      expect(detectTopicByKeyword("giris yapamiyorum", sampleIndex).topicId).toBe("giris-yapamiyorum");
    });
    it("should return null for no match", () => {
      expect(detectTopicByKeyword("hava durumu nasil", sampleIndex).topicId).toBeNull();
    });
  });
  describe("getTopicFile", () => {
    it("should return empty for missing file", () => {
      const cache = new Map();
      expect(typeof getTopicFile("yazici-sorunu", sampleIndex, "/nonexistent", cache)).toBe("string");
    });
  });
  describe("getTopicMeta", () => {
    it("should return topic metadata", () => {
      const meta = getTopicMeta("yazici-sorunu", sampleIndex);
      expect(meta.id).toBe("yazici-sorunu");
    });
    it("should return null for unknown topic", () => {
      expect(getTopicMeta("unknown", sampleIndex)).toBeNull();
    });
  });
});

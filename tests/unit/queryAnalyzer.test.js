const { createQueryAnalyzer } = require("../../src/services/rag/queryAnalyzer.js");

function makeAnalyzer(overrides = {}) {
  return createQueryAnalyzer({
    callLLM: overrides.callLLM || vi.fn().mockResolvedValue({ reply: "{}" }),
    getProviderConfig: overrides.getProviderConfig || (() => ({
      model: "test-model",
      apiKey: "test-key",
      provider: "test",
      baseUrl: "",
    })),
    logger: { info() {}, warn() {}, error() {} },
  });
}

describe("queryAnalyzer", () => {
  it("analyze returns structured analysis", async () => {
    const mockReply = JSON.stringify({
      complexity: "medium",
      intent: "product_support",
      subQueries: [],
      requiresMemory: true,
      requiresGraph: false,
      standaloneQuery: "Kargo durumum nedir?",
    });
    const callLLM = vi.fn().mockResolvedValue({ reply: mockReply });
    const analyzer = makeAnalyzer({ callLLM });

    const result = await analyzer.analyze("Kargo durumum nedir?");

    expect(result).toHaveProperty("complexity", "medium");
    expect(result).toHaveProperty("intent", "product_support");
    expect(result).toHaveProperty("subQueries");
    expect(Array.isArray(result.subQueries)).toBe(true);
    expect(result).toHaveProperty("requiresMemory", true);
    expect(result).toHaveProperty("requiresGraph", false);
    expect(result).toHaveProperty("standaloneQuery", "Kargo durumum nedir?");
    expect(result).toHaveProperty("route", "STANDARD");
  });

  it("routes simple greetings to FAST", async () => {
    const mockReply = JSON.stringify({
      complexity: "simple",
      intent: "greeting",
      subQueries: [],
      requiresMemory: false,
      requiresGraph: false,
      standaloneQuery: "Merhaba",
    });
    const callLLM = vi.fn().mockResolvedValue({ reply: mockReply });
    const analyzer = makeAnalyzer({ callLLM });

    const result = await analyzer.analyze("Merhaba");

    expect(result.complexity).toBe("simple");
    expect(result.intent).toBe("greeting");
    expect(result.route).toBe("FAST");
  });

  it("routes complex queries to DEEP", async () => {
    const mockReply = JSON.stringify({
      complexity: "complex",
      intent: "product_support",
      subQueries: [
        "iPhone 15 ile Samsung S24 arasindaki farklar nelerdir?",
        "Hangi telefon daha uygun fiyatli?",
        "Iade kosullari nelerdir?",
      ],
      requiresMemory: false,
      requiresGraph: true,
      standaloneQuery: "iPhone 15 ile Samsung S24 karsilastirmasi, fiyat ve iade kosullari",
    });
    const callLLM = vi.fn().mockResolvedValue({ reply: "```json\n" + mockReply + "\n```" });
    const analyzer = makeAnalyzer({ callLLM });

    const result = await analyzer.analyze("iPhone 15 ile Samsung S24'u karsilastir, fiyat ve iade kosullarini da soyle");

    expect(result.complexity).toBe("complex");
    expect(result.route).toBe("DEEP");
    expect(result.subQueries).toHaveLength(3);
    expect(result.requiresGraph).toBe(true);
  });

  it("falls back to STANDARD on LLM failure", async () => {
    const callLLM = vi.fn().mockRejectedValue(new Error("API timeout"));
    const analyzer = makeAnalyzer({ callLLM });

    const result = await analyzer.analyze("Bir sorum var");

    expect(result.complexity).toBe("medium");
    expect(result.intent).toBe("product_support");
    expect(result.route).toBe("STANDARD");
    expect(result.standaloneQuery).toBe("Bir sorum var");
  });

  it("extracts standalone query from chat history context", async () => {
    const mockReply = JSON.stringify({
      complexity: "medium",
      intent: "product_support",
      subQueries: [],
      requiresMemory: true,
      requiresGraph: false,
      standaloneQuery: "iPhone 15'i sepete ekle",
    });
    const callLLM = vi.fn().mockResolvedValue({ reply: mockReply });
    const analyzer = makeAnalyzer({ callLLM });

    const chatHistory = [
      { role: "user", content: "iPhone 15 fiyati ne kadar?" },
      { role: "assistant", content: "iPhone 15 fiyati 45.000 TL'dir." },
    ];

    const result = await analyzer.analyze("Bunu sepete ekle", chatHistory);

    expect(result.standaloneQuery).toBe("iPhone 15'i sepete ekle");

    // callLLM'e gecirilen messages chat history icermeli
    const callArgs = callLLM.mock.calls[0];
    const messages = callArgs[0];
    // 2 history messages + 1 current = 3 messages
    expect(messages).toHaveLength(3);
    expect(messages[0].role).toBe("user");
    expect(messages[0].parts[0].text).toBe("iPhone 15 fiyati ne kadar?");
    expect(messages[1].role).toBe("model");
    expect(messages[1].parts[0].text).toBe("iPhone 15 fiyati 45.000 TL'dir.");
    expect(messages[2].role).toBe("user");
    expect(messages[2].parts[0].text).toBe("Bunu sepete ekle");
  });
});

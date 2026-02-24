const { createQuestionExtractor } = require("../../src/services/questionExtractor.js");
const { createConfigStore } = require("../../src/services/configStore.js");
const path = require("path");
const fs = require("fs");

function makeExtractor(callLLMFn) {
  return createQuestionExtractor({
    callLLM: callLLMFn || vi.fn().mockResolvedValue({ reply: "extracted question", finishReason: "STOP" }),
    getProviderConfig: () => ({
      model: "test-model",
      apiKey: "test-key",
      provider: "test",
      baseUrl: "",
    }),
    logger: { info() {}, warn() {}, error() {} },
  });
}

describe("questionExtractor", () => {
  it("returns original message when no chat history", async () => {
    const extractor = makeExtractor();
    const result = await extractor.extractQuestion([], "Sube kodu nedir?");
    expect(result).toBe("Sube kodu nedir?");
  });

  it("returns original message when chat history is empty", async () => {
    const extractor = makeExtractor();
    const result = await extractor.extractQuestion([], "Nasil basvuru yaparim?");
    expect(result).toBe("Nasil basvuru yaparim?");
  });

  it("calls LLM with correct prompt format", async () => {
    const mockCallLLM = vi.fn().mockResolvedValue({ reply: "Ankara subesi icin basvuru nasil yapilir?", finishReason: "STOP" });
    const extractor = makeExtractor(mockCallLLM);

    const history = [
      { role: "user", content: "Ankara subesi hakkinda bilgi verir misiniz?" },
      { role: "assistant", content: "Ankara subemiz Kizilay'da bulunmaktadir." },
    ];

    await extractor.extractQuestion(history, "Oraya nasil basvuru yaparim?");

    expect(mockCallLLM).toHaveBeenCalledTimes(1);
    const messagesArg = mockCallLLM.mock.calls[0][0];
    expect(Array.isArray(messagesArg)).toBe(true);
    const promptArg = messagesArg[0].parts[0].text;
    expect(promptArg).toContain("Sohbet Gecmisi:");
    expect(promptArg).toContain("Kullanici: Ankara subesi hakkinda bilgi verir misiniz?");
    expect(promptArg).toContain("Bot: Ankara subemiz Kizilay'da bulunmaktadir.");
    expect(promptArg).toContain("Son Mesaj: Oraya nasil basvuru yaparim?");
    expect(promptArg).toContain("Bagimsiz Soru:");
  });

  it("returns extracted question on success", async () => {
    const mockCallLLM = vi.fn().mockResolvedValue({ reply: "Ankara subesi icin basvuru nasil yapilir?", finishReason: "STOP" });
    const extractor = makeExtractor(mockCallLLM);

    const history = [
      { role: "user", content: "Ankara subesi nerede?" },
      { role: "assistant", content: "Kizilay'da." },
    ];

    const result = await extractor.extractQuestion(history, "Oraya nasil gidilir?");
    expect(result).toBe("Ankara subesi icin basvuru nasil yapilir?");
  });

  it("returns original message on LLM failure", async () => {
    const mockCallLLM = vi.fn().mockRejectedValue(new Error("API error"));
    const extractor = makeExtractor(mockCallLLM);

    const history = [
      { role: "user", content: "Merhaba" },
      { role: "assistant", content: "Hosgeldiniz" },
    ];

    const result = await extractor.extractQuestion(history, "Ayni seyi tekrarla");
    expect(result).toBe("Ayni seyi tekrarla");
  });

  it("returns original message when extraction is too long", async () => {
    const original = "Kisa soru";
    // Return something 4x longer than original (over 3x threshold)
    const longResult = "Bu cok uzun bir cikarilmis soru metnidir ve orijinal mesajin uc katindan fazladir asla kullanilmamalidir";
    const mockCallLLM = vi.fn().mockResolvedValue({ reply: longResult, finishReason: "STOP" });
    const extractor = makeExtractor(mockCallLLM);

    const history = [
      { role: "user", content: "Merhaba" },
      { role: "assistant", content: "Hosgeldiniz" },
    ];

    const result = await extractor.extractQuestion(history, original);
    expect(result).toBe(original);
  });

  it("limits history to last 6 messages", async () => {
    const mockCallLLM = vi.fn().mockResolvedValue({ reply: "cikarilmis soru", finishReason: "STOP" });
    const extractor = makeExtractor(mockCallLLM);

    const history = [];
    for (let i = 0; i < 10; i++) {
      history.push({ role: i % 2 === 0 ? "user" : "assistant", content: `Mesaj ${i}` });
    }

    await extractor.extractQuestion(history, "Son soru");

    const messagesArg = mockCallLLM.mock.calls[0][0];
    const promptArg = messagesArg[0].parts[0].text;
    // Should NOT contain first 4 messages (indices 0-3)
    expect(promptArg).not.toContain("Mesaj 0");
    expect(promptArg).not.toContain("Mesaj 1");
    expect(promptArg).not.toContain("Mesaj 2");
    expect(promptArg).not.toContain("Mesaj 3");
    // Should contain last 6 messages (indices 4-9)
    expect(promptArg).toContain("Mesaj 4");
    expect(promptArg).toContain("Mesaj 9");
  });

  it("handles null chat history", async () => {
    const extractor = makeExtractor();
    const result = await extractor.extractQuestion(null, "Test mesaji");
    expect(result).toBe("Test mesaji");
  });

  it("trims extracted result", async () => {
    const mockCallLLM = vi.fn().mockResolvedValue({ reply: "  cikarilmis soru  \n", finishReason: "STOP" });
    const extractor = makeExtractor(mockCallLLM);

    const history = [
      { role: "user", content: "Merhaba" },
      { role: "assistant", content: "Hosgeldiniz" },
    ];

    const result = await extractor.extractQuestion(history, "Baska bir soru");
    expect(result).toBe("cikarilmis soru");
  });

  it("questionExtractionEnabled flag in default chatFlowConfig", () => {
    const tmpDir = path.join(__dirname, "_tmp_qe_" + Date.now());
    fs.mkdirSync(tmpDir, { recursive: true });

    try {
      const store = createConfigStore({
        fs,
        logger: { info() {}, warn() {}, error() {} },
        paths: {
          chatFlowConfigFile: path.join(tmpDir, "chat-flow-config.json"),
          siteConfigFile: path.join(tmpDir, "site-config.json"),
          sunshineConfigFile: path.join(tmpDir, "sunshine-config.json"),
          telegramSessionsFile: path.join(tmpDir, "telegram-sessions.json"),
          sunshineSessionsFile: path.join(tmpDir, "sunshine-sessions.json"),
          promptVersionsFile: path.join(tmpDir, "prompt-versions.json"),
        },
      });

      const cfg = store.getChatFlowConfig();
      expect(cfg.questionExtractionEnabled).toBe(true);
      expect(store.DEFAULT_CHAT_FLOW_CONFIG.questionExtractionEnabled).toBe(true);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

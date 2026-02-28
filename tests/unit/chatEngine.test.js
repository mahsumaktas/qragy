const {
  isGibberishMessage,
  isFarewellMessage,
  extractBranchCodeFromText,
  sanitizeIssueSummary,
  splitActiveTicketMessages,
  hasRequiredFields,
  isAssistantConfirmationMessage,
  isNonIssueMessage,
  isStatusFollowupMessage,
  isFieldClarificationMessage,
  isGreetingOnlyMessage,
  isAssistantEscalationMessage,
  getLastAssistantMessage,
  extractTicketMemory,
  buildConfirmationMessage,
  parseClosedTicketFromAssistantMessage,
  detectConversationLoop,
} = require("../../src/services/chatEngine.js");

describe("isGibberishMessage", () => {
  it("returns false for empty string", () => {
    expect(isGibberishMessage("")).toBe(false);
  });
  it("returns true for single char 'a'", () => {
    expect(isGibberishMessage("a")).toBe(true);
  });
  it("returns true for repeated chars 'aaaaaaa'", () => {
    expect(isGibberishMessage("aaaaaaa")).toBe(true);
  });
  it("returns true for consonant-only 'btrskp'", () => {
    expect(isGibberishMessage("btrskp")).toBe(true);
  });
  it("returns false for valid Turkish 'sorunum var'", () => {
    expect(isGibberishMessage("sorunum var")).toBe(false);
  });
  it("returns false when gibberishDetectionEnabled is false", () => {
    expect(isGibberishMessage("a", { chatFlowConfig: { gibberishDetectionEnabled: false } })).toBe(false);
  });
});

describe("isFarewellMessage", () => {
  it("returns false when turnCount < 3", () => {
    expect(isFarewellMessage("tesekkurler", 1)).toBe(false);
  });
  it("returns true for 'tesekkurler' at turn 5", () => {
    expect(isFarewellMessage("tesekkurler", 5)).toBe(true);
  });
  it("returns false for long message with farewell embedded", () => {
    expect(isFarewellMessage("ben bugun cok uzun bir mesaj yaziyorum tesekkurler cok sagolun hepinize", 5)).toBe(false);
  });
  it("returns true for 'hosca kal'", () => {
    expect(isFarewellMessage("hosca kal", 5)).toBe(true);
  });
  it("returns false when closingFlowEnabled is false", () => {
    expect(isFarewellMessage("tesekkurler", 5, { chatFlowConfig: { closingFlowEnabled: false } })).toBe(false);
  });
});

describe("extractBranchCodeFromText", () => {
  it("extracts from 'sube kodu: ABC123'", () => {
    expect(extractBranchCodeFromText("sube kodu: ABC123")).toBe("ABC123");
  });
  it("extracts standalone 'AB45' from short input", () => {
    expect(extractBranchCodeFromText("AB45")).toBe("AB45");
  });
  it("returns empty for plain sentence", () => {
    expect(extractBranchCodeFromText("yazicim calismiyor lutfen yardim edin")).toBe("");
  });
  it("extracts from issue context", () => {
    expect(extractBranchCodeFromText("yazici hata veriyor EST01 numarali subede")).toBe("EST01");
  });
  it("returns empty for long token > 8 chars in issue context", () => {
    expect(extractBranchCodeFromText("hata var ABCDEFGH123456 kodu")).toBe("");
  });
  it("handles Turkish 'sube kodu: EST01'", () => {
    expect(extractBranchCodeFromText("\u015Fube kodu: EST01")).toBe("EST01");
  });
});

describe("sanitizeIssueSummary", () => {
  it("strips branch code from text", () => {
    const result = sanitizeIssueSummary("sube kodu: ABC123 yazicim calismiyor", "ABC123");
    expect(result).not.toContain("ABC123");
    expect(result.toLowerCase()).toContain("yazicim calismiyor");
  });
  it("strips greeting prefix", () => {
    const result = sanitizeIssueSummary("merhaba, yazicim calismiyor");
    expect(result.toLowerCase()).not.toMatch(/^merhaba/);
    expect(result.toLowerCase()).toContain("yazicim calismiyor");
  });
  it("returns empty after full cleaning", () => {
    expect(sanitizeIssueSummary("merhaba")).toBe("");
  });
});

describe("splitActiveTicketMessages", () => {
  it("returns full messages when no confirmation", () => {
    const msgs = [
      { role: "user", content: "merhaba" },
      { role: "assistant", content: "nasil yardimci olabilirim?" },
    ];
    const result = splitActiveTicketMessages(msgs);
    expect(result.activeMessages).toHaveLength(2);
    expect(result.hasClosedTicketHistory).toBe(false);
  });
  it("slices after confirmation message", () => {
    const msgs = [
      { role: "user", content: "sube kodu: EST01, yazicim calismiyor" },
      { role: "assistant", content: "Talebinizi aldim. Kullanici adi: EST01. Kisa aciklama: Yazici sorunu. Destek ekibi en kisa surede donus yapacaktir." },
      { role: "user", content: "baska bir sorunum var" },
    ];
    const result = splitActiveTicketMessages(msgs);
    expect(result.activeMessages).toHaveLength(1);
    expect(result.hasClosedTicketHistory).toBe(true);
  });
  it("hasClosedTicketHistory is false when none", () => {
    const msgs = [{ role: "user", content: "test" }];
    expect(splitActiveTicketMessages(msgs).hasClosedTicketHistory).toBe(false);
  });
});

describe("hasRequiredFields", () => {
  it("returns true when both branchCode and issueSummary present", () => {
    expect(hasRequiredFields({ branchCode: "EST01", issueSummary: "yazici sorunu" })).toBe(true);
  });
  it("returns false when branchCode missing", () => {
    expect(hasRequiredFields({ branchCode: "", issueSummary: "yazici sorunu" })).toBe(false);
  });
  it("returns false when issueSummary missing", () => {
    expect(hasRequiredFields({ branchCode: "EST01", issueSummary: "" })).toBe(false);
  });
});

describe("isAssistantConfirmationMessage", () => {
  it("returns true for confirmation prefix", () => {
    const msg = { role: "assistant", content: "Talebinizi ald\u0131m. Kullan\u0131c\u0131 ad\u0131: EST01. K\u0131sa a\u00e7\u0131klama: Test." };
    expect(isAssistantConfirmationMessage(msg)).toBe(true);
  });
  it("returns false for regular message", () => {
    const msg = { role: "assistant", content: "Merhaba, nasil yardimci olabilirim?" };
    expect(isAssistantConfirmationMessage(msg)).toBe(false);
  });
});

describe("isNonIssueMessage", () => {
  it("returns true for 'merhaba'", () => {
    expect(isNonIssueMessage("merhaba")).toBe(true);
  });
  it("returns false for a real issue", () => {
    expect(isNonIssueMessage("yazicim calismiyor")).toBe(false);
  });
});

describe("isStatusFollowupMessage", () => {
  it("returns true for 'bekliyorum'", () => {
    expect(isStatusFollowupMessage("bekliyorum")).toBe(true);
  });
  it("returns false when issue hint present", () => {
    expect(isStatusFollowupMessage("yazici bekliyorum")).toBe(false);
  });
  it("returns false for empty string", () => {
    expect(isStatusFollowupMessage("")).toBe(false);
  });
});

describe("isFieldClarificationMessage", () => {
  it("returns true for field question", () => {
    expect(isFieldClarificationMessage("sube kodu nerede yaziyor?")).toBe(true);
  });
  it("returns false for plain text", () => {
    expect(isFieldClarificationMessage("yazicim bozuldu")).toBe(false);
  });
});

describe("isGreetingOnlyMessage", () => {
  it("returns true for 'merhaba'", () => {
    expect(isGreetingOnlyMessage("merhaba")).toBe(true);
  });
  it("returns false for issue text", () => {
    expect(isGreetingOnlyMessage("yazicim calismiyor")).toBe(false);
  });
});

describe("isAssistantEscalationMessage", () => {
  it("returns true for escalation message", () => {
    const msg = { role: "assistant", content: "Sizi canli destek temsilcimize aktariyorum." };
    expect(isAssistantEscalationMessage(msg)).toBe(true);
  });
  it("returns false for regular message", () => {
    const msg = { role: "assistant", content: "Anladim, size yardimci olabilirim." };
    expect(isAssistantEscalationMessage(msg)).toBe(false);
  });
});

describe("getLastAssistantMessage", () => {
  it("returns last assistant message", () => {
    const msgs = [
      { role: "user", content: "merhaba" },
      { role: "assistant", content: "ilk" },
      { role: "user", content: "test" },
      { role: "assistant", content: "son" },
    ];
    expect(getLastAssistantMessage(msgs).content).toBe("son");
  });
  it("returns null when no assistant message", () => {
    expect(getLastAssistantMessage([{ role: "user", content: "test" }])).toBeNull();
  });
});

describe("parseClosedTicketFromAssistantMessage", () => {
  it("parses branch code and summary from confirmation", () => {
    const msg = { role: "assistant", content: "Talebinizi aldim. Kullanici adi: EST01. Kisa aciklama: Yazici arizasi. Destek ekibi en kisa surede donus yapacaktir." };
    const result = parseClosedTicketFromAssistantMessage(msg);
    expect(result.branchCode).toBe("EST01");
    expect(result.issueSummary).toBe("Yazici arizasi");
  });
  it("returns null for non-confirmation", () => {
    expect(parseClosedTicketFromAssistantMessage({ role: "assistant", content: "Merhaba" })).toBeNull();
  });
});

describe("extractTicketMemory", () => {
  it("extracts branchCode and issueSummary from messages", () => {
    const msgs = [
      { role: "user", content: "sube kodu: EST01" },
      { role: "user", content: "yazicim calismiyor baski alamiyorum" },
    ];
    const memory = extractTicketMemory(msgs);
    expect(memory.branchCode).toBe("EST01");
    expect(memory.issueSummary).toBeTruthy();
  });
  it("extracts phone number", () => {
    const msgs = [{ role: "user", content: "telefon: 05321234567" }];
    const memory = extractTicketMemory(msgs);
    expect(memory.phone).toContain("05321234567");
  });
});

describe("buildConfirmationMessage", () => {
  it("builds message with memory fields", () => {
    const result = buildConfirmationMessage({ branchCode: "EST01", issueSummary: "Yazici sorunu" });
    expect(result).toContain("EST01");
    expect(result).toContain("Yazici sorunu");
  });
});

describe("detectConversationLoop", () => {
  it("returns false for < 2 messages", () => {
    expect(detectConversationLoop(["merhaba"])).toEqual({ isLoop: false, repeatCount: 0 });
  });
  it("detects exact repeat (2+)", () => {
    const result = detectConversationLoop(["yazicim calismiyor", "baska sey", "yazicim calismiyor", "yazicim calismiyor"]);
    expect(result.isLoop).toBe(true);
    expect(result.repeatCount).toBeGreaterThanOrEqual(2);
  });
  it("no loop for different messages", () => {
    expect(detectConversationLoop(["merhaba", "yazici sorunu", "toneri degistirdim"])).toEqual({ isLoop: false, repeatCount: 0 });
  });
  it("returns false for empty array", () => {
    expect(detectConversationLoop([])).toEqual({ isLoop: false, repeatCount: 0 });
  });
});

// ── Fix 1: Gibberish detection genisletme ──────────────────────────────
describe("isGibberishMessage — extended rules", () => {
  it("detects keyboard mash 'asdfghjkl'", () => {
    expect(isGibberishMessage("asdfghjkl")).toBe(true);
  });
  it("detects keyboard mash 'qwerty'", () => {
    expect(isGibberishMessage("qwerty")).toBe(true);
  });
  it("detects programming keyword 'SELECT 1+1'", () => {
    expect(isGibberishMessage("SELECT 1+1")).toBe(true);
  });
  it("detects programming keyword 'null undefined NaN'", () => {
    expect(isGibberishMessage("null undefined NaN")).toBe(true);
  });
  it("detects programming keyword 'console.log'", () => {
    expect(isGibberishMessage("console.log")).toBe(true);
  });
  it("false positive: 'merhaba' is not gibberish", () => {
    expect(isGibberishMessage("merhaba")).toBe(false);
  });
  it("false positive: 'yazicim calismiyor' is not gibberish", () => {
    expect(isGibberishMessage("yazicim calismiyor")).toBe(false);
  });
  it("false positive: branch code 'EST01' is not gibberish", () => {
    expect(isGibberishMessage("EST01")).toBe(false);
  });
  it("false positive: 'sorun var' is not gibberish", () => {
    expect(isGibberishMessage("sorun var")).toBe(false);
  });
});

// ── Fix 2: Farewell negative override ──────────────────────────────────
describe("isFarewellMessage — negative override", () => {
  it("'tesekkurler ama calismadi' is NOT farewell", () => {
    expect(isFarewellMessage("tesekkurler ama calismadi", 5)).toBe(false);
  });
  it("'tesekkurler ama hala sorun var' is NOT farewell", () => {
    expect(isFarewellMessage("tesekkurler ama hala sorun var", 5)).toBe(false);
  });
  it("'sagol ama olmadi' is NOT farewell", () => {
    expect(isFarewellMessage("sagol ama olmadi", 5)).toBe(false);
  });
  it("'tesekkurler' (alone) is still farewell", () => {
    expect(isFarewellMessage("tesekkurler", 5)).toBe(true);
  });
  it("'hosca kal' is still farewell", () => {
    expect(isFarewellMessage("hosca kal", 5)).toBe(true);
  });
});

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
      { role: "assistant", content: "Talebinizi aldim. Sube kodu: EST01. Kisa aciklama: Yazici sorunu. Destek ekibi en kisa surede donus yapacaktir." },
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
    const msg = { role: "assistant", content: "Talebinizi ald\u0131m. \u015Eube kodu: EST01. K\u0131sa a\u00e7\u0131klama: Test." };
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
    const msg = { role: "assistant", content: "Talebinizi aldim. Sube kodu: EST01. Kisa aciklama: Yazici arizasi. Destek ekibi en kisa surede donus yapacaktir." };
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

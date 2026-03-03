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
  it("returns false for valid English 'I have a problem'", () => {
    expect(isGibberishMessage("I have a problem")).toBe(false);
  });
  it("returns false when gibberishDetectionEnabled is false", () => {
    expect(isGibberishMessage("a", { chatFlowConfig: { gibberishDetectionEnabled: false } })).toBe(false);
  });
});

describe("isFarewellMessage", () => {
  it("returns false when turnCount < 3", () => {
    expect(isFarewellMessage("thanks", 1)).toBe(false);
  });
  it("returns true for 'thanks' at turn 5", () => {
    expect(isFarewellMessage("thanks", 5)).toBe(true);
  });
  it("returns false for long message with farewell embedded", () => {
    expect(isFarewellMessage("I am writing a very long message today thanks so much to all of you really", 5)).toBe(false);
  });
  it("returns true for 'goodbye'", () => {
    expect(isFarewellMessage("goodbye", 5)).toBe(true);
  });
  it("returns false when closingFlowEnabled is false", () => {
    expect(isFarewellMessage("thanks", 5, { chatFlowConfig: { closingFlowEnabled: false } })).toBe(false);
  });
});

describe("extractBranchCodeFromText", () => {
  it("extracts from 'account id: ABC123'", () => {
    expect(extractBranchCodeFromText("account id: ABC123")).toBe("ABC123");
  });
  it("extracts standalone 'AB45' from short input", () => {
    expect(extractBranchCodeFromText("AB45")).toBe("AB45");
  });
  it("returns empty for plain sentence", () => {
    expect(extractBranchCodeFromText("my printer is not working please help")).toBe("");
  });
  it("extracts from issue context", () => {
    expect(extractBranchCodeFromText("printer error at branch EST01")).toBe("EST01");
  });
  it("returns empty for long token > 8 chars in issue context", () => {
    expect(extractBranchCodeFromText("error with ABCDEFGH123456 code")).toBe("");
  });
  it("extracts from 'branch code: EST01'", () => {
    expect(extractBranchCodeFromText("branch code: EST01")).toBe("EST01");
  });
});

describe("sanitizeIssueSummary", () => {
  it("strips branch code from text", () => {
    const result = sanitizeIssueSummary("account id: ABC123 my printer is not working", "ABC123");
    expect(result).not.toContain("ABC123");
    expect(result.toLowerCase()).toContain("my printer is not working");
  });
  it("strips greeting prefix", () => {
    const result = sanitizeIssueSummary("hello, my printer is not working");
    expect(result.toLowerCase()).not.toMatch(/^hello/);
    expect(result.toLowerCase()).toContain("my printer is not working");
  });
  it("returns empty after full cleaning", () => {
    expect(sanitizeIssueSummary("hello")).toBe("");
  });
});

describe("splitActiveTicketMessages", () => {
  it("returns full messages when no confirmation", () => {
    const msgs = [
      { role: "user", content: "hello" },
      { role: "assistant", content: "How can I help you?" },
    ];
    const result = splitActiveTicketMessages(msgs);
    expect(result.activeMessages).toHaveLength(2);
    expect(result.hasClosedTicketHistory).toBe(false);
  });
  it("slices after confirmation message", () => {
    const msgs = [
      { role: "user", content: "account id: EST01, my printer is not working" },
      { role: "assistant", content: "I've noted your request. Account ID: EST01. Issue: Printer problem. Our support team will follow up shortly." },
      { role: "user", content: "I have another issue" },
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
    expect(hasRequiredFields({ branchCode: "EST01", issueSummary: "printer issue" })).toBe(true);
  });
  it("returns false when branchCode missing", () => {
    expect(hasRequiredFields({ branchCode: "", issueSummary: "printer issue" })).toBe(false);
  });
  it("returns false when issueSummary missing", () => {
    expect(hasRequiredFields({ branchCode: "EST01", issueSummary: "" })).toBe(false);
  });
});

describe("isAssistantConfirmationMessage", () => {
  it("returns true for confirmation prefix", () => {
    const msg = { role: "assistant", content: "I've noted your request. Account ID: EST01. Issue: Test." };
    expect(isAssistantConfirmationMessage(msg)).toBe(true);
  });
  it("returns false for regular message", () => {
    const msg = { role: "assistant", content: "Hello, how can I help you?" };
    expect(isAssistantConfirmationMessage(msg)).toBe(false);
  });
});

describe("isNonIssueMessage", () => {
  it("returns true for 'hello'", () => {
    expect(isNonIssueMessage("hello")).toBe(true);
  });
  it("returns false for a real issue", () => {
    expect(isNonIssueMessage("my printer is not working")).toBe(false);
  });
});

describe("isStatusFollowupMessage", () => {
  it("returns true for 'waiting'", () => {
    expect(isStatusFollowupMessage("waiting")).toBe(true);
  });
  it("returns false when issue hint present", () => {
    expect(isStatusFollowupMessage("printer still waiting")).toBe(false);
  });
  it("returns false for empty string", () => {
    expect(isStatusFollowupMessage("")).toBe(false);
  });
});

describe("isFieldClarificationMessage", () => {
  it("returns true for field question", () => {
    expect(isFieldClarificationMessage("where can I find my account id?")).toBe(true);
  });
  it("returns false for plain text", () => {
    expect(isFieldClarificationMessage("my printer is broken")).toBe(false);
  });
});

describe("isGreetingOnlyMessage", () => {
  it("returns true for 'hello'", () => {
    expect(isGreetingOnlyMessage("hello")).toBe(true);
  });
  it("returns false for issue text", () => {
    expect(isGreetingOnlyMessage("my printer is not working")).toBe(false);
  });
});

describe("isAssistantEscalationMessage", () => {
  it("returns true for escalation message", () => {
    const msg = { role: "assistant", content: "I'm connecting you with a live support agent." };
    expect(isAssistantEscalationMessage(msg)).toBe(true);
  });
  it("returns false for regular message", () => {
    const msg = { role: "assistant", content: "I understand, I can help you with that." };
    expect(isAssistantEscalationMessage(msg)).toBe(false);
  });
});

describe("getLastAssistantMessage", () => {
  it("returns last assistant message", () => {
    const msgs = [
      { role: "user", content: "hello" },
      { role: "assistant", content: "first" },
      { role: "user", content: "test" },
      { role: "assistant", content: "last" },
    ];
    expect(getLastAssistantMessage(msgs).content).toBe("last");
  });
  it("returns null when no assistant message", () => {
    expect(getLastAssistantMessage([{ role: "user", content: "test" }])).toBeNull();
  });
});

describe("parseClosedTicketFromAssistantMessage", () => {
  it("parses branch code and summary from confirmation", () => {
    const msg = { role: "assistant", content: "I've noted your request. Account ID: EST01. Issue: Printer malfunction. Our support team will follow up shortly." };
    const result = parseClosedTicketFromAssistantMessage(msg);
    expect(result.branchCode).toBe("EST01");
    expect(result.issueSummary).toBe("Printer malfunction");
  });
  it("returns null for non-confirmation", () => {
    expect(parseClosedTicketFromAssistantMessage({ role: "assistant", content: "Hello" })).toBeNull();
  });
});

describe("extractTicketMemory", () => {
  it("extracts branchCode and issueSummary from messages", () => {
    const msgs = [
      { role: "user", content: "account id: EST01" },
      { role: "user", content: "my printer is not working I cannot print" },
    ];
    const memory = extractTicketMemory(msgs);
    expect(memory.branchCode).toBe("EST01");
    expect(memory.issueSummary).toBeTruthy();
  });
  it("extracts phone number", () => {
    const msgs = [{ role: "user", content: "phone: 05321234567" }];
    const memory = extractTicketMemory(msgs);
    expect(memory.phone).toContain("05321234567");
  });
});

describe("buildConfirmationMessage", () => {
  it("builds message with memory fields", () => {
    const result = buildConfirmationMessage({ branchCode: "EST01", issueSummary: "Printer issue" });
    expect(result).toContain("EST01");
    expect(result).toContain("Printer issue");
  });
});

describe("detectConversationLoop", () => {
  it("returns false for < 2 messages", () => {
    expect(detectConversationLoop(["hello"])).toEqual({ isLoop: false, repeatCount: 0 });
  });
  it("detects exact repeat (2+)", () => {
    const result = detectConversationLoop(["my printer is not working", "something else", "my printer is not working", "my printer is not working"]);
    expect(result.isLoop).toBe(true);
    expect(result.repeatCount).toBeGreaterThanOrEqual(2);
  });
  it("no loop for different messages", () => {
    expect(detectConversationLoop(["hello", "printer issue", "I replaced the toner"])).toEqual({ isLoop: false, repeatCount: 0 });
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
  it("false positive: 'hello' is not gibberish", () => {
    expect(isGibberishMessage("hello")).toBe(false);
  });
  it("false positive: 'my printer is not working' is not gibberish", () => {
    expect(isGibberishMessage("my printer is not working")).toBe(false);
  });
  it("false positive: branch code 'EST01' is not gibberish", () => {
    expect(isGibberishMessage("EST01")).toBe(false);
  });
  it("false positive: 'I have a problem' is not gibberish", () => {
    expect(isGibberishMessage("I have a problem")).toBe(false);
  });
});

// ── Fix 2: Farewell negative override ──────────────────────────────────
describe("isFarewellMessage — negative override", () => {
  it("'thanks but it didn't work' is NOT farewell", () => {
    expect(isFarewellMessage("thanks but it didn't work", 5)).toBe(false);
  });
  it("'thanks but still having issue' is NOT farewell", () => {
    expect(isFarewellMessage("thanks but still having issue", 5)).toBe(false);
  });
  it("'thanks but failed' is NOT farewell", () => {
    expect(isFarewellMessage("thanks but failed", 5)).toBe(false);
  });
  it("'thanks' (alone) is still farewell", () => {
    expect(isFarewellMessage("thanks", 5)).toBe(true);
  });
  it("'goodbye' is still farewell", () => {
    expect(isFarewellMessage("goodbye", 5)).toBe(true);
  });
});

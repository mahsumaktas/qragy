import { describe, expect, it } from "vitest";
import assistantModule from "../../src/routes/admin/assistant";

const { parseAssistantResponse, sanitizeProfessionalAssistantText } = assistantModule;

describe("admin assistant reply formatting", () => {
  it("strips markdown emphasis from plain replies", () => {
    const parsed = parseAssistantResponse('{"reply":"**Önerilen**\\n\\n1. `Giriş` ekranını kontrol edin.\\n2. *Hata* metnini paylaşın.","actions":[]}');

    expect(parsed.reply).toContain("Önerilen");
    expect(parsed.reply).not.toContain("**");
    expect(parsed.reply).not.toContain("`");
  });

  it("sanitizes fallback plain text replies", () => {
    const reply = sanitizeProfessionalAssistantText("## Başlık\n\n* Adım 1\n\n\n**Vurgu**");

    expect(reply).toBe("Başlık\n- Adım 1\n\nVurgu");
  });
});

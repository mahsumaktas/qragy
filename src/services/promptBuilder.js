"use strict";

const { trimToTokenBudget, TOKEN_BUDGETS } = require("./memory.js");

/**
 * Prompt Builder Service
 *
 * Builds the system prompt for LLM calls from agent config, topic data,
 * memory state, and knowledge base results.
 * Factory pattern — agent text getters injected via deps.
 */
function createPromptBuilder(deps) {
  const {
    getAgentTexts,
    getTopicIndexSummary,
    loadTopicFile,
    getTopicMeta,
    getMemoryTemplate,
    logger = { info() {}, debug() {} },
  } = deps;

  function buildSystemPrompt(memory, conversationContext, knowledgeResults, options) {
    const {
      SOUL_TEXT, PERSONA_TEXT, BOOTSTRAP_TEXT, DOMAIN_TEXT,
      SKILLS_TEXT, HARD_BANS_TEXT, ESCALATION_MATRIX_TEXT,
      RESPONSE_POLICY_TEXT, DOD_TEXT, OUTPUT_FILTER_TEXT,
    } = getAgentTexts();
    const TOPIC_INDEX_SUMMARY = getTopicIndexSummary();
    const MEMORY_TEMPLATE = getMemoryTemplate();

    const parts = [];
    const state = conversationContext?.conversationState || "welcome_or_greet";
    const turnCount = conversationContext?.turnCount || 0;

    // Core identity — always included
    if (SOUL_TEXT) parts.push(SOUL_TEXT);
    if (PERSONA_TEXT) parts.push(PERSONA_TEXT);

    // Early turns (0-1): only soul + persona + bootstrap for lighter prompt
    if (turnCount <= 1) {
      if (BOOTSTRAP_TEXT) parts.push(BOOTSTRAP_TEXT);
    } else {
      // Full agent config for ongoing conversations
      if (DOMAIN_TEXT) parts.push(DOMAIN_TEXT);
      if (BOOTSTRAP_TEXT) parts.push(BOOTSTRAP_TEXT);
      if (SKILLS_TEXT) parts.push(SKILLS_TEXT);
      if (HARD_BANS_TEXT) parts.push(HARD_BANS_TEXT);

      // Skip escalation matrix during farewell state
      if (state !== "farewell" && ESCALATION_MATRIX_TEXT) {
        parts.push(ESCALATION_MATRIX_TEXT);
      }

      parts.push(RESPONSE_POLICY_TEXT);
      if (DOD_TEXT) parts.push(DOD_TEXT);
      if (OUTPUT_FILTER_TEXT) parts.push(OUTPUT_FILTER_TEXT);
    }

    // Konu listesini HER ZAMAN ekle
    parts.push(`## Destek Konuları Listesi\nKullanıcının talebini aşağıdaki konulardan en uygun olanıyla eşleştir. Keyword'lere değil anlama bak.\n${TOPIC_INDEX_SUMMARY}`);

    // Keyword ile on-eslesme yapildiysa detayli konu dosyasini da ekle
    if (conversationContext?.currentTopic) {
      const topicContent = loadTopicFile(conversationContext.currentTopic);
      const topicMeta = getTopicMeta(conversationContext.currentTopic);
      if (topicContent) {
        parts.push(`## Tespit Edilen Konu Detayı\nKonu: ${topicMeta?.title || conversationContext.currentTopic}\n${topicContent}`);
        if (topicMeta?.requiredInfo?.length) {
          parts.push(`## Escalation Gerekirse Toplanacak Bilgiler\nBu bilgiler SADECE escalation (canlı temsilciye aktarım) gerektiğinde toplanır. Bilgilendirme YAPILMADAN bu bilgileri SORMA.\n${topicMeta.requiredInfo.join(", ")}`);
        }
        if (topicMeta?.requiresEscalation) {
          parts.push("## Not: Bu konu sonunda canlı temsilciye aktarım gerektirir.");
        }
        if (topicMeta?.canResolveDirectly) {
          parts.push("## Not: Bu konu doğrudan çözülebilir. Bilgi tabanı ve konu dosyasındaki adımları kullanarak HEMEN bilgilendir. Firma/şube/kullanıcı kodu SORMA. Bilgilendirme sonrası uğurlama prosedürüne geç.");
        }
      }
    }

    if (conversationContext?.earlyEscalation) {
      parts.push(`## ERKEN ESCALATION — TROUBLESHOOTING ATLANDI\nKullanıcı ilk mesajında zaten sorunun çözülemediğini belirtti. Adım adım troubleshooting VERME.\nDoğrudan şube kodunu sor: "Anlıyorum, size yardımcı olabilmem için şube kodunuzu iletebilir misiniz?"\nBilgilendirme adımlarını ATLAYIP direkt şube kodu topla.`);
    }

    if (conversationContext?.escalationTriggered) {
      parts.push(`## ESCALATION TETİKLENDİ\nSebep: ${conversationContext.escalationReason}\nEscalation mesajı gönder: "Sizi canlı destek temsilcimize aktarıyorum. Kısa sürede yardımcı olacaktır."`);
    }

    // Structured context — human-readable for LLM
    const MEMORY_LABELS = {
      branchCode: "Sube Kodu",
      issueSummary: "Sorun Ozeti",
      companyName: "Firma Adi",
      fullName: "Ad Soyad",
      phone: "Telefon",
    };

    const ctxLines = ["## Konusma Durumu"];
    ctxLines.push(`- Asama: ${state}`);
    ctxLines.push(`- Tur sayisi: ${turnCount}`);
    if (conversationContext?.currentTopic) {
      ctxLines.push(`- Aktif konu: ${conversationContext.currentTopic}`);
    }
    if (conversationContext?.earlyEscalation) {
      ctxLines.push("- ERKEN ESCALATION: EVET — Troubleshooting YAPMA, direkt sube kodu sor");
    }
    if (conversationContext?.escalationTriggered) {
      ctxLines.push("- ESCALATION TETIKLENDI — Aktarim mesaji gonder");
    }
    parts.push(ctxLines.join("\n"));

    // Toplanan bilgiler — LLM'in hangi alanlarin eksik oldugunu gormesi icin
    const allFields = [...(MEMORY_TEMPLATE.requiredFields || []), ...(MEMORY_TEMPLATE.optionalFields || [])];
    const memLines = ["## Toplanan Bilgiler"];
    const requiredSet = new Set(MEMORY_TEMPLATE.requiredFields || []);
    for (const field of allFields) {
      const label = MEMORY_LABELS[field] || field;
      const value = memory?.[field];
      const tag = requiredSet.has(field) ? " (zorunlu)" : "";
      memLines.push(`- ${label}${tag}: ${value || "[bilinmiyor]"}`);
    }
    parts.push(memLines.join("\n"));
    parts.push("Onay metni (SADECE escalation/ticket toplama sonrası kullan): Talebinizi aldım. Şube kodu: <KOD>. Kısa açıklama: <ÖZET>. Destek ekibi en kısa sürede dönüş yapacaktır.");
    parts.push("Uygun olduğunda yanıtının sonuna hızlı yanıt seçenekleri ekle: [QUICK_REPLIES: secenek1 | secenek2 | secenek3]. Maks 3 seçenek. Yalnızca kullanıcıyı yönlendirmek mantıklıysa ekle.");

    // User Memory: kalici kullanici hafizasi
    const userMemory = options?.userMemory;
    if (userMemory && typeof userMemory === "object" && Object.keys(userMemory).length > 0) {
      const memLines = ["--- KULLANICI HAFIZASI ---", "Bu kullanici hakkinda bildiklerimiz:"];
      for (const [k, v] of Object.entries(userMemory)) {
        memLines.push(`${k}: ${v}`);
      }
      memLines.push("---");
      parts.push(memLines.join("\n"));
    }

    // Core Memory (from new memory engine — replaces old userMemory when provided)
    if (options?.coreMemoryText) {
      parts.push(options.coreMemoryText);
    }

    // Recall Memory
    if (options?.recallMemoryText) {
      parts.push(options.recallMemoryText);
    }

    // Reflexion warnings
    if (options?.reflexionWarnings) {
      parts.push(options.reflexionWarnings);
    }

    // Graph context
    if (options?.graphContext) {
      parts.push(options.graphContext);
    }

    // Zero-shot bootstrap: sektor bilgisi ile yardimci baglam
    if (options?.sectorTemplate) {
      const tmpl = options.sectorTemplate;
      parts.push(`## Sektor Bilgisi: ${tmpl.title || ""}\n${tmpl.persona || ""}`);
      if (tmpl.policies?.length) {
        parts.push("Politikalar:\n" + tmpl.policies.map(p => `- ${p}`).join("\n"));
      }
    }

    // Graceful fallback when KB is empty
    if (!knowledgeResults || knowledgeResults.length === 0) {
      parts.push("## Not: Bilgi tabaninda ilgili kayit bulunamadi. Genel bilginle yardimci ol, ancak spesifik firma bilgisi verme. Gerekirse: 'Detayli bilgim yok ama size yardimci olmaya calisacagim' de.");
    }

    // RAG: Bilgi tabani sonuclarini ekle (token budget ile sinirla)
    if (Array.isArray(knowledgeResults) && knowledgeResults.length > 0) {
      const kbLines = ["## Bilgi Tabanı Sonuçları",
        "Aşağıdaki soru-cevap çiftleri kullanıcının sorusuyla ilişkili olabilir.",
        "Bu bilgileri kullanarak HEMEN yanıt ver. Firma/şube bilgisi sormadan ÖNCE bu cevapları paylaş.",
        "Kullanıcının sorusuna uygun değilse görmezden gel.", ""];
      for (const item of knowledgeResults) {
        kbLines.push(`Soru: ${item.question}`);
        kbLines.push(`Cevap: ${item.answer}`);
        kbLines.push("");
      }
      const ragText = kbLines.join("\n");
      parts.push(trimToTokenBudget(ragText, TOKEN_BUDGETS.ragContext));
    }

    const finalPrompt = parts.join("\n\n");

    logger.info("promptBuilder", "Prompt olusturuldu", {
      state,
      turnCount,
      topic: conversationContext?.currentTopic || null,
      escalation: !!conversationContext?.escalationTriggered,
      ragResults: Array.isArray(knowledgeResults) ? knowledgeResults.length : 0,
      hasCoreMemory: !!options?.coreMemoryText,
      hasReflexion: !!options?.reflexionWarnings,
      hasGraph: !!options?.graphContext,
      promptLen: finalPrompt.length,
    });

    return finalPrompt;
  }

  return { buildSystemPrompt };
}

module.exports = { createPromptBuilder };

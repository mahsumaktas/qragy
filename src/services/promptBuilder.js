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

    // Early turns (0-1): soul + persona + bootstrap + response-policy (KB priority needs it)
    if (turnCount <= 1) {
      if (BOOTSTRAP_TEXT) parts.push(BOOTSTRAP_TEXT);
      if (RESPONSE_POLICY_TEXT) parts.push(RESPONSE_POLICY_TEXT);
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

    // Always include topic list
    parts.push(`## Support Topics List\nMatch the user's request with the most relevant topic below. Focus on meaning, not keywords.\n${TOPIC_INDEX_SUMMARY}`);

    // If keyword pre-match found, also include detailed topic file
    if (conversationContext?.currentTopic) {
      const topicContent = loadTopicFile(conversationContext.currentTopic);
      const topicMeta = getTopicMeta(conversationContext.currentTopic);
      if (topicContent) {
        parts.push(`## Detected Topic Details\nTopic: ${topicMeta?.title || conversationContext.currentTopic}\n${topicContent}`);
        if (topicMeta?.requiredInfo?.length) {
          parts.push(`## Information to Collect If Escalation Is Needed\nThis information is ONLY collected when escalation (transfer to live agent) is required. Do NOT ask for this information before providing help.\n${topicMeta.requiredInfo.join(", ")}`);
        }
        if (topicMeta?.requiresEscalation) {
          parts.push("## Note: This topic ultimately requires transfer to a live agent.");
        }
        if (topicMeta?.canResolveDirectly) {
          parts.push("## Note: This topic can be resolved directly. Use the knowledge base and topic file steps to provide information IMMEDIATELY. Do NOT ask for company/branch/user code. After providing information, proceed to farewell procedure.");
        } else {
          parts.push("## IMPORTANT: If the knowledge base has help steps related to this topic, share them FIRST. Do NOT ask for branch code, username, or other details in the first turn. If the user cannot resolve their issue with these steps, collect information for escalation in the next turn.");
        }
      }
    }

    if (conversationContext?.escalationTriggered) {
      parts.push(`## ESCALATION TRIGGERED\nReason: ${conversationContext.escalationReason}\nSend escalation message: "I'm transferring you to a live support agent. They will assist you shortly."`);
    }

    // Structured context — human-readable for LLM
    const MEMORY_LABELS = {
      branchCode: "Branch Code",
      issueSummary: "Issue Summary",
      companyName: "Company Name",
      fullName: "Full Name",
      phone: "Phone",
    };

    const ctxLines = ["## Conversation State"];
    ctxLines.push(`- Stage: ${state}`);
    ctxLines.push(`- Turn count: ${turnCount}`);
    if (conversationContext?.currentTopic) {
      ctxLines.push(`- Active topic: ${conversationContext.currentTopic}`);
    }
    if (conversationContext?.escalationTriggered) {
      ctxLines.push("- ESCALATION TRIGGERED — Send transfer message");
    }
    parts.push(ctxLines.join("\n"));

    // Collected information — so LLM can see which fields are missing
    // If topic detected and first turn, suppress (required) tag — KB-first behavior
    const allFields = [...(MEMORY_TEMPLATE.requiredFields || []), ...(MEMORY_TEMPLATE.optionalFields || [])];
    const memLines = ["## Collected Information"];
    const requiredSet = new Set(MEMORY_TEMPLATE.requiredFields || []);
    const suppressRequired = conversationContext?.currentTopic && turnCount <= 1;
    for (const field of allFields) {
      const label = MEMORY_LABELS[field] || field;
      const value = memory?.[field];
      const tag = (!suppressRequired && requiredSet.has(field)) ? " (required)" : "";
      memLines.push(`- ${label}${tag}: ${value || "[unknown]"}`);
    }
    parts.push(memLines.join("\n"));
    parts.push("Confirmation text (ONLY use after escalation/ticket collection): I've received your request. Branch code: <CODE>. Brief description: <SUMMARY>. The support team will follow up shortly.");
    parts.push("When appropriate, add quick reply options at the end of your response: [QUICK_REPLIES: option1 | option2 | option3]. Max 3 options. Only add when it makes sense to guide the user.");

    // User Memory: persistent user memory
    const userMemory = options?.userMemory;
    if (userMemory && typeof userMemory === "object" && Object.keys(userMemory).length > 0) {
      const userMemLines = ["--- USER MEMORY ---", "What we know about this user:"];
      for (const [k, v] of Object.entries(userMemory)) {
        userMemLines.push(`${k}: ${v}`);
      }
      userMemLines.push("---");
      parts.push(userMemLines.join("\n"));
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

    // Quality warning (previous turn's score result)
    if (options?.qualityWarning) {
      parts.push(options.qualityWarning);
    }

    // Loop warning
    if (conversationContext?.loopDetected) {
      parts.push(
        "## WARNING: CONVERSATION LOOP DETECTED\n" +
        `The user has repeated the same/similar message ${conversationContext.loopRepeatCount + 1} times.\n` +
        "- Try a different approach or ask for missing information.\n" +
        "- If you cannot produce a solution, IMMEDIATELY offer to transfer to a live agent."
      );
    }

    // Turn limit warning
    if (conversationContext?.turnLimitReached && !conversationContext?.escalationTriggered) {
      parts.push(
        "## WARNING: CONVERSATION HAS BEEN GOING ON FOR A LONG TIME\n" +
        `This conversation has lasted ${conversationContext.turnCount} turns.\n` +
        "- If you could not resolve the issue, offer the user the live support option.\n" +
        '- Example: "Would you like me to transfer you to a live support agent who can assist you further with this?"'
      );
    }

    // Zero-shot bootstrap: sector knowledge as helper context
    if (options?.sectorTemplate) {
      const tmpl = options.sectorTemplate;
      parts.push(`## Sector Information: ${tmpl.title || ""}\n${tmpl.persona || ""}`);
      if (tmpl.policies?.length) {
        parts.push("Policies:\n" + tmpl.policies.map(p => `- ${p}`).join("\n"));
      }
    }

    // KB empty — do NOT hallucinate, offer escalation
    if (!knowledgeResults || knowledgeResults.length === 0) {
      parts.push("## CRITICAL: No records found in the knowledge base for this topic.\n" +
        "- If there is NO information in the knowledge base or topic files about this subject, absolutely do NOT fabricate or guess information.\n" +
        "- Only provide specific details like menu paths, button names, or process steps based SOLELY on data from the knowledge base or topic files.\n" +
        "- If the topic files also have no information about this: say 'I don't have detailed information on this topic. Our live support agent can help you. Would you like me to transfer you to an agent?'\n" +
        "- NEVER respond with guesses or general information.");
    }

    // RAG: Add knowledge base results (limited by token budget)
    if (Array.isArray(knowledgeResults) && knowledgeResults.length > 0) {
      const kbLines = ["## Knowledge Base Results — MUST USE",
        "The following Q&A pairs may be relevant to the user's question.",
        "CRITICAL: Use this information to respond IMMEDIATELY. Do NOT ask for branch code or redirect to live support.",
        "Share this information first. Only start escalation if the user says 'that didn't work/didn't help'.",
        "If not relevant to the user's question, ignore and say 'I don't have detailed information on this topic. Our live support agent can help you.'",
        "IMPORTANT: Do NOT fabricate menu paths, button names, or process steps that are NOT in the knowledge base or topic files. Only use the information below.", ""];
      for (const item of knowledgeResults) {
        kbLines.push(`Q: ${item.question}`);
        kbLines.push(`A: ${item.answer}`);
        kbLines.push("");
      }
      const ragText = kbLines.join("\n");
      parts.push(trimToTokenBudget(ragText, TOKEN_BUDGETS.ragContext));
    }

    const finalPrompt = parts.join("\n\n");

    logger.info("promptBuilder", "Prompt built", {
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

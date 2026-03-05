function containsAny(text, patterns) {
  return patterns.some((pattern) => pattern.test(text || ""));
}

function addWarning(collection, filename, key, params = {}) {
  collection.push({ filename, key, params });
}

export function getBotSettingsQualityReport(files = {}, memoryFiles = {}) {
  const warnings = [];
  const requiredTextFiles = [
    "soul.md",
    "bootstrap.md",
    "persona.md",
    "response-policy.md",
    "domain.md",
    "skills.md",
    "hard-bans.md",
    "escalation-matrix.md",
    "definition-of-done.md",
    "output-filter.md",
  ];

  for (const filename of requiredTextFiles) {
    if (!(files[filename] || "").trim()) {
      addWarning(warnings, filename, "botSettings.warning.missingContent");
    }
  }

  const bootstrapText = files["bootstrap.md"] || "";
  const responsePolicyText = files["response-policy.md"] || "";
  const escalationMatrixText = files["escalation-matrix.md"] || "";

  const earlyEscalationPatterns = [
    /erken escalation/i,
    /ilk mesaj/i,
    /direkt info_collection/i,
    /direkt .*escalation/i,
    /troubleshooting vermenin anlami yok/i,
  ];

  if (containsAny(bootstrapText, earlyEscalationPatterns)) {
    addWarning(warnings, "bootstrap.md", "botSettings.warning.earlyEscalation");
  }
  if (containsAny(responsePolicyText, earlyEscalationPatterns)) {
    addWarning(warnings, "response-policy.md", "botSettings.warning.earlyEscalation");
  }

  if (/onay/i.test(escalationMatrixText) && /direkt aktar/i.test(responsePolicyText)) {
    addWarning(warnings, "response-policy.md", "botSettings.warning.escalationFlowConflict");
    addWarning(warnings, "escalation-matrix.md", "botSettings.warning.escalationFlowConflict");
  }

  const ticketTemplate = memoryFiles["ticket-template.json"] || {};
  const memoryTemplateText = JSON.stringify(ticketTemplate).toLowerCase();
  if (/(your request|account id|issue:|support team|live support)/.test(memoryTemplateText)) {
    addWarning(warnings, "ticket-template.json", "botSettings.warning.memoryLanguage");
  }

  const conversationSchema = memoryFiles["conversation-schema.json"] || {};
  const initialState = conversationSchema.sessionFields?.conversationState;
  const validStates = Array.isArray(conversationSchema.validStates) ? conversationSchema.validStates : [];
  if (initialState && !validStates.includes(initialState)) {
    addWarning(warnings, "conversation-schema.json", "botSettings.warning.invalidInitialState", { state: initialState });
  }
  if (initialState === "welcome") {
    addWarning(warnings, "conversation-schema.json", "botSettings.warning.legacyInitialState");
  }

  const warningsByFile = warnings.reduce((acc, warning) => {
    acc[warning.filename] ||= [];
    acc[warning.filename].push(warning);
    return acc;
  }, {});

  return {
    warnings,
    warningsByFile,
    warningCount: warnings.length,
  };
}

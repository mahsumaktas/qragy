"use strict";

function mount(app, deps) {
  const {
    getSupportAvailability, getZendeskEnabled, getZendeskSnippetKey,
    getZendeskDefaultTags, getAdminToken, getChatFlowConfig, getSiteConfig,
  } = deps;

  app.get("/api/config", (_req, res) => {
    const supportAvailability = getSupportAvailability();
    res.json({
      zendesk: {
        enabled: getZendeskEnabled(),
        snippetKey: getZendeskSnippetKey(),
        defaultTags: getZendeskDefaultTags(),
      },
      support: supportAvailability,
      admin: {
        tokenRequired: Boolean(getAdminToken()),
      },
      chatFlow: getChatFlowConfig(),
      site: getSiteConfig(),
    });
  });
}

module.exports = { mount };

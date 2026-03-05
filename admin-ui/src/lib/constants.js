import { t } from "./i18n.svelte.js";

export const NAV_GROUPS = [
  {
    key: "izle",
    labelKey: "nav.monitor",
    descriptionKey: "nav.monitorDesc",
    items: [
      { id: "dashboard", labelKey: "nav.dashboard", icon: "dashboard" },
      { id: "live-chats", labelKey: "nav.liveChats", icon: "chat" },
      { id: "closed-chats", labelKey: "nav.closedChats", icon: "archive" },
      { id: "search", labelKey: "nav.search", icon: "search" },
    ],
  },
  {
    key: "yonet",
    labelKey: "nav.manage",
    descriptionKey: "nav.manageDesc",
    items: [
      { id: "agent-inbox", labelKey: "nav.agentInbox", icon: "inbox" },
      { id: "knowledge-base", labelKey: "nav.knowledgeBase", icon: "book" },
      { id: "topics", labelKey: "nav.topics", icon: "tag" },
      { id: "bot-settings", labelKey: "nav.botSettings", icon: "settings" },
      { id: "bot-test", labelKey: "nav.botTest", icon: "test" },
      { id: "chat-flow", labelKey: "nav.chatFlow", icon: "flow" },
    ],
  },
  {
    key: "ayarla",
    labelKey: "nav.configure",
    descriptionKey: "nav.configureDesc",
    items: [
      { id: "site-settings", labelKey: "nav.siteSettings", icon: "globe" },
      { id: "zendesk", labelKey: "nav.zendesk", icon: "zendesk" },
      { id: "whatsapp", labelKey: "nav.whatsapp", icon: "whatsapp" },
      { id: "webhooks", labelKey: "nav.webhooks", icon: "webhook" },
      { id: "env-vars", labelKey: "nav.envVars", icon: "env" },
      { id: "agent-files", labelKey: "nav.agentFiles", icon: "file" },
      { id: "memory-templates", labelKey: "nav.memoryTemplates", icon: "memory" },
    ],
  },
  {
    key: "analiz",
    labelKey: "nav.analyze",
    descriptionKey: "nav.analyzeDesc",
    items: [
      { id: "analytics", labelKey: "nav.analytics", icon: "chart" },
      { id: "eval", labelKey: "nav.eval", icon: "eval" },
      { id: "faq-suggestions", labelKey: "nav.faqSuggestions", icon: "faq" },
      { id: "feedback", labelKey: "nav.feedback", icon: "feedback" },
      { id: "content-gaps", labelKey: "nav.contentGaps", icon: "gap" },
      { id: "prompt-history", labelKey: "nav.promptHistory", icon: "history" },
      { id: "system-status", labelKey: "nav.systemStatus", icon: "status" },
    ],
  },
];

export function getPanelMeta(id) {
  for (const group of NAV_GROUPS) {
    for (const item of group.items) {
      if (item.id === id) return { group, item };
    }
  }
  return null;
}

export function getPanelGroup(id) {
  return getPanelMeta(id)?.group || null;
}

export function getPanelTitle(id) {
  return t(getPanelMeta(id)?.item?.labelKey || id);
}

export const DEFAULT_PANEL = "dashboard";

export const NAV_GROUPS = [
  {
    key: "izle",
    label: "Monitor",
    items: [
      { id: "dashboard", label: "Dashboard", icon: "dashboard" },
      { id: "live-chats", label: "Live Chats", icon: "chat" },
      { id: "closed-chats", label: "Closed Chats", icon: "archive" },
      { id: "search", label: "Search", icon: "search" },
    ],
  },
  {
    key: "yonet",
    label: "Manage",
    items: [
      { id: "agent-inbox", label: "Agent Inbox", icon: "inbox" },
      { id: "knowledge-base", label: "Knowledge Base", icon: "book" },
      { id: "topics", label: "Topics", icon: "tag" },
      { id: "bot-settings", label: "Bot Settings", icon: "settings" },
      { id: "bot-test", label: "Bot Test", icon: "test" },
      { id: "chat-flow", label: "Chat Flow", icon: "flow" },
    ],
  },
  {
    key: "ayarla",
    label: "Configure",
    items: [
      { id: "site-settings", label: "Site Settings", icon: "globe" },
      { id: "zendesk", label: "Zendesk", icon: "zendesk" },
      { id: "whatsapp", label: "WhatsApp", icon: "whatsapp" },
      { id: "webhooks", label: "Webhooks", icon: "webhook" },
      { id: "env-vars", label: "Environment Variables", icon: "env" },
      { id: "agent-files", label: "Agent Files", icon: "file" },
      { id: "memory-templates", label: "Memory Templates", icon: "memory" },
    ],
  },
  {
    key: "analiz",
    label: "Analyze",
    items: [
      { id: "analytics", label: "Analytics", icon: "chart" },
      { id: "eval", label: "Eval Management", icon: "eval" },
      { id: "faq-suggestions", label: "FAQ Suggestions", icon: "faq" },
      { id: "feedback", label: "Feedback Report", icon: "feedback" },
      { id: "content-gaps", label: "Content Gaps", icon: "gap" },
      { id: "prompt-history", label: "Prompt History", icon: "history" },
      { id: "system-status", label: "System Status", icon: "status" },
    ],
  },
];

export const PANEL_TITLES = {};
for (const group of NAV_GROUPS) {
  for (const item of group.items) {
    PANEL_TITLES[item.id] = item.label;
  }
}

export const DEFAULT_PANEL = "dashboard";

export const NAV_GROUPS = [
  {
    key: "izle",
    label: "Izle",
    items: [
      { id: "dashboard", label: "Dashboard", icon: "dashboard" },
      { id: "live-chats", label: "Canli Sohbetler", icon: "chat" },
      { id: "closed-chats", label: "Kapali Sohbetler", icon: "archive" },
      { id: "search", label: "Arama", icon: "search" },
    ],
  },
  {
    key: "yonet",
    label: "Yonet",
    items: [
      { id: "agent-inbox", label: "Agent Inbox", icon: "inbox" },
      { id: "knowledge-base", label: "Bilgi Tabani", icon: "book" },
      { id: "topics", label: "Konular", icon: "tag" },
      { id: "bot-settings", label: "Bot Ayarlari", icon: "settings" },
      { id: "bot-test", label: "Bot Test", icon: "test" },
      { id: "chat-flow", label: "Sohbet Akisi", icon: "flow" },
    ],
  },
  {
    key: "ayarla",
    label: "Ayarla",
    items: [
      { id: "site-settings", label: "Site Ayarlari", icon: "globe" },
      { id: "zendesk", label: "Zendesk", icon: "zendesk" },
      { id: "whatsapp", label: "WhatsApp", icon: "whatsapp" },
      { id: "webhooks", label: "Webhooks", icon: "webhook" },
      { id: "env-vars", label: "Ortam Degiskenleri", icon: "env" },
      { id: "agent-files", label: "Agent Dosyalari", icon: "file" },
      { id: "memory-templates", label: "Bellek Sablonlari", icon: "memory" },
    ],
  },
  {
    key: "analiz",
    label: "Analiz Et",
    items: [
      { id: "analytics", label: "Analytics", icon: "chart" },
      { id: "eval", label: "Eval Yonetimi", icon: "eval" },
      { id: "faq-suggestions", label: "FAQ Onerileri", icon: "faq" },
      { id: "feedback", label: "Feedback Raporu", icon: "feedback" },
      { id: "content-gaps", label: "Content Gaps", icon: "gap" },
      { id: "prompt-history", label: "Prompt Gecmisi", icon: "history" },
      { id: "system-status", label: "Sistem Durumu", icon: "status" },
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

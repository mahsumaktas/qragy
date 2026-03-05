import { DEFAULT_PANEL } from "./constants.js";

const PANEL_ALIASES = {
  "agent-files": "bot-settings",
  "memory-templates": "bot-settings",
};

let currentPanel = $state(parseHash());

function parseHash() {
  const hash = window.location.hash.slice(1);
  return PANEL_ALIASES[hash] || hash || DEFAULT_PANEL;
}

export function getPanel() {
  return currentPanel;
}

export function navigate(panelId) {
  window.location.hash = "#" + panelId;
}

function onHashChange() {
  currentPanel = parseHash();
}

export function initRouter() {
  window.addEventListener("hashchange", onHashChange);
  return () => window.removeEventListener("hashchange", onHashChange);
}

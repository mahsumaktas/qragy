import { t } from "./i18n.svelte.js";

export function humanizeValue(value) {
  return String(value || "")
    .split(/[_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function translateScopedValue(scope, value, fallback = "") {
  const normalized = String(value || fallback || "").trim();
  if (!normalized) return "";
  const key = `${scope}.${normalized}`;
  const translated = t(key);
  return translated === key ? humanizeValue(normalized) : translated;
}

export function translateStatus(value) {
  return translateScopedValue("status", value);
}

export function translateSource(value) {
  return translateScopedValue("source", value, "web");
}

export function translatePriority(value) {
  return translateScopedValue("priority", value, "normal");
}

export function formatMessageCount(count = 0) {
  return t("common.messagesCount", { n: Number(count) || 0 });
}

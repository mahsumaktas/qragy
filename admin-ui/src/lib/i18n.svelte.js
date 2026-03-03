import en from "../i18n/en.js";
import tr from "../i18n/tr.js";

const LANGS = { en, tr };
const STORAGE_KEY = "qragy_admin_lang";

let locale = $state(localStorage.getItem(STORAGE_KEY) || "en");

export function getLocale() {
  return locale;
}

export function setLocale(lang) {
  if (!LANGS[lang]) return;
  locale = lang;
  localStorage.setItem(STORAGE_KEY, lang);
  document.documentElement.lang = lang;
}

export function getDateLocale() {
  return locale === "tr" ? "tr-TR" : "en-US";
}

export function t(key, params) {
  const val = LANGS[locale]?.[key] || LANGS.en?.[key] || key;
  if (!params) return val;
  return val.replace(/\{(\w+)\}/g, (_, k) => params[k] ?? "");
}

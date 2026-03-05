import en from "../i18n/en.js";
import tr from "../i18n/tr.js";

const LANGS = { en, tr };
const STORAGE_KEY = "qragy_admin_lang";

function detectInitialLocale() {
  const stored = globalThis.localStorage?.getItem(STORAGE_KEY);
  if (stored && LANGS[stored]) return stored;
  const browserLang = (globalThis.navigator?.language || "en").toLowerCase();
  return browserLang.startsWith("tr") ? "tr" : "en";
}

const initialLocale = detectInitialLocale();
let locale = $state(initialLocale);

function syncDocumentLang(lang) {
  if (typeof document !== "undefined") {
    document.documentElement.lang = lang;
  }
}

syncDocumentLang(initialLocale);

export function getLocale() {
  return locale;
}

export function setLocale(lang) {
  if (!LANGS[lang]) return;
  locale = lang;
  globalThis.localStorage?.setItem(STORAGE_KEY, lang);
  syncDocumentLang(lang);
}

export function getDateLocale() {
  return locale === "tr" ? "tr-TR" : "en-US";
}

export function t(key, params) {
  const val = LANGS[locale]?.[key] || LANGS.en?.[key] || key;
  if (!params) return val;
  return val.replace(/\{(\w+)\}/g, (_, k) => params[k] ?? "");
}

/* Admin v1 — Lightweight i18n runtime */
(function () {
  "use strict";

  var STORAGE_KEY = "qragy_admin_lang";
  var locale = localStorage.getItem(STORAGE_KEY) || "en";
  var langs = { en: window.I18N_EN || {}, tr: window.I18N_TR || {} };

  /** Translate a key, with optional {param} interpolation */
  window.t = function (key, params) {
    var val = (langs[locale] && langs[locale][key]) || (langs.en && langs.en[key]) || key;
    if (!params) return val;
    return val.replace(/\{(\w+)\}/g, function (_, k) {
      return params[k] != null ? params[k] : "";
    });
  };

  window.getLocale = function () {
    return locale;
  };

  window.setLocale = function (lang) {
    if (!langs[lang]) return;
    locale = lang;
    localStorage.setItem(STORAGE_KEY, lang);
    document.documentElement.lang = lang;
    translatePage();
  };

  window.getDateLocale = function () {
    return locale === "tr" ? "tr-TR" : "en-US";
  };

  /** Walk all [data-i18n] elements and update their text/placeholder/title */
  function translatePage() {
    document.querySelectorAll("[data-i18n]").forEach(function (el) {
      var key = el.getAttribute("data-i18n");
      if (key) el.textContent = window.t(key);
    });
    document.querySelectorAll("[data-i18n-placeholder]").forEach(function (el) {
      var key = el.getAttribute("data-i18n-placeholder");
      if (key) el.placeholder = window.t(key);
    });
    document.querySelectorAll("[data-i18n-title]").forEach(function (el) {
      var key = el.getAttribute("data-i18n-title");
      if (key) el.title = window.t(key);
    });
    // Update lang toggle button text
    var langBtn = document.getElementById("langToggleBtn");
    if (langBtn) langBtn.textContent = locale === "en" ? "TR" : "EN";
  }
  window.translatePage = translatePage;

  // Auto-translate on load
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", translatePage);
  } else {
    translatePage();
  }
})();

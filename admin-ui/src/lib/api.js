import { getToken, clearToken } from "./auth.svelte.js";
import { getLocale } from "./i18n.svelte.js";

const SSO_SKIP_KEY = "qragy-admin-sso-skip";

const LOCALIZED_BACKEND_ERRORS = {
  "surface is required.": {
    tr: "İşlem yüzeyi seçilmelidir.",
    en: "Surface is required.",
  },
  "target is required.": {
    tr: "Hedef kayıt seçilmelidir.",
    en: "Target is required.",
  },
  "unsupported surface.": {
    tr: "Desteklenmeyen işlem yüzeyi.",
    en: "Unsupported surface.",
  },
  "question and answer are required.": {
    tr: "Soru ve cevap alanları zorunludur.",
    en: "Question and answer are required.",
  },
  "record not found.": {
    tr: "Kayıt bulunamadı.",
    en: "Record not found.",
  },
  "knowledge base record not found.": {
    tr: "Bilgi bankası kaydı bulunamadı.",
    en: "Knowledge base record not found.",
  },
  "topic not found.": {
    tr: "Konu bulunamadı.",
    en: "Topic not found.",
  },
  "invalid filename.": {
    tr: "Geçersiz dosya adı.",
    en: "Invalid filename.",
  },
  "file not found.": {
    tr: "Dosya bulunamadı.",
    en: "File not found.",
  },
  "content is required.": {
    tr: "İçerik alanı zorunludur.",
    en: "Content is required.",
  },
  "id and title are required.": {
    tr: "Konu kimliği ve başlık zorunludur.",
    en: "Topic ID and title are required.",
  },
  "invalid topic id format.": {
    tr: "Konu kimliği biçimi geçersiz.",
    en: "Invalid topic ID format.",
  },
  "this id already exists.": {
    tr: "Bu konu kimliği zaten kullanılıyor.",
    en: "This topic ID already exists.",
  },
  "title is required.": {
    tr: "Başlık alanı zorunludur.",
    en: "Title is required.",
  },
  "llm service is not configured.": {
    tr: "LLM servisi yapılandırılmamış.",
    en: "LLM service is not configured.",
  },
  "invalid json format.": {
    tr: "Geçersiz JSON biçimi.",
    en: "Invalid JSON format.",
  },
  "file is required.": {
    tr: "Dosya zorunludur.",
    en: "File is required.",
  },
  "could not extract q&a pairs from xlsx file.": {
    tr: "XLSX dosyasından soru-cevap çiftleri çıkarılamadı.",
    en: "Could not extract Q&A pairs from XLSX file.",
  },
  "could not extract text from file.": {
    tr: "Dosyadan metin çıkarılamadı.",
    en: "Could not extract text from file.",
  },
  "insufficient content found.": {
    tr: "Yeterli içerik bulunamadı.",
    en: "Insufficient content found.",
  },
  "url is required.": {
    tr: "URL zorunludur.",
    en: "URL is required.",
  },
  "invalid url.": {
    tr: "Geçersiz URL.",
    en: "Invalid URL.",
  },
  "url import service is not configured.": {
    tr: "URL içe aktarma servisi yapılandırılmamış.",
    en: "URL import service is not configured.",
  },
  "could not extract sufficient content from page.": {
    tr: "Sayfadan yeterli içerik çıkarılamadı.",
    en: "Could not extract sufficient content from page.",
  },
  "at least one file is required.": {
    tr: "En az bir dosya zorunludur.",
    en: "At least one file is required.",
  },
  "updates object is required.": {
    tr: "Güncelleme nesnesi zorunludur.",
    en: "Updates object is required.",
  },
  "config object is required.": {
    tr: "Yapılandırma nesnesi zorunludur.",
    en: "Config object is required.",
  },
  "message or file is required.": {
    tr: "Mesaj veya dosya zorunludur.",
    en: "Message or file is required.",
  },
  "unsupported file type. use jpeg, png, svg, webp, or gif.": {
    tr: "Desteklenmeyen dosya türü. JPEG, PNG, SVG, WebP veya GIF kullanın.",
    en: "Unsupported file type. Use JPEG, PNG, SVG, WebP, or GIF.",
  },
};

function getSessionExpiredMessage() {
  return getLocale() === "tr" ? "Oturum süresi doldu." : "Session expired.";
}

function isWorkspaceAdminPath() {
  if (typeof window === "undefined") return false;
  return /^\/[^/]+\/admin(?:\/|$)/.test(window.location.pathname);
}

function hasSsoSkip() {
  return typeof window !== "undefined" && window.sessionStorage.getItem(SSO_SKIP_KEY) === "1";
}

function getSsoLoginUrl() {
  if (typeof window === "undefined") return "../api/admin/sso/login?redirect=%2Fadmin-v2%2F";
  const redirect = encodeURIComponent(`${window.location.pathname}${window.location.search}${window.location.hash}` || "/admin-v2/");
  return `../api/admin/sso/login?redirect=${redirect}`;
}

function localizeBackendError(payload, status) {
  const locale = getLocale();
  const raw = String(payload?.error || "").trim();
  if (!raw) return "HTTP " + status;
  const match = LOCALIZED_BACKEND_ERRORS[raw.toLowerCase()];
  return match?.[locale] || raw;
}

async function fetchJson(url, options = {}) {
  const headers = {
    "Content-Type": "application/json",
    "Bypass-Tunnel-Reminder": "true",
    "x-admin-locale": getLocale(),
    ...(options.headers || {}),
  };

  const token = getToken();
  if (token) {
    headers["x-admin-token"] = token;
  }

  const response = await fetch(url, { ...options, headers });

  if (response.status === 401) {
    clearToken();
    if (!token && isWorkspaceAdminPath() && !hasSsoSkip()) {
      window.location.href = getSsoLoginUrl();
    }
    window.location.hash = "#login";
    throw new Error(getSessionExpiredMessage());
  }

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(localizeBackendError(payload, response.status));
  }
  return payload;
}

function apiUrl(path) {
  // Workspace admin UI /<workspace>/admin/ altinda, ../api/ ile /<workspace>/api/ hedefine gider.
  return "../api/" + path;
}

export const api = {
  get(path, options = {}) {
    return fetchJson(apiUrl(path), options);
  },

  post(path, body, options = {}) {
    return fetchJson(apiUrl(path), {
      ...options,
      method: "POST",
      body: JSON.stringify(body),
    });
  },

  put(path, body, options = {}) {
    return fetchJson(apiUrl(path), {
      ...options,
      method: "PUT",
      body: JSON.stringify(body),
    });
  },

  delete(path, options = {}) {
    return fetchJson(apiUrl(path), { ...options, method: "DELETE" });
  },

  async upload(path, file) {
    const headers = {
      "Content-Type": file.type,
      "Bypass-Tunnel-Reminder": "true",
      "x-admin-locale": getLocale(),
    };
    const token = getToken();
    if (token) headers["x-admin-token"] = token;

    const response = await fetch(apiUrl(path), {
      method: "POST",
      headers,
      body: file,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(localizeBackendError(payload, response.status));
    return payload;
  },

  async uploadForm(path, formData) {
    const headers = {
      "Bypass-Tunnel-Reminder": "true",
      "x-admin-locale": getLocale(),
    };
    const token = getToken();
    if (token) headers["x-admin-token"] = token;

    const response = await fetch(apiUrl(path), {
      method: "POST",
      headers,
      body: formData,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(localizeBackendError(payload, response.status));
    return payload;
  },
};

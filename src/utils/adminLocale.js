"use strict";

const ADMIN_MESSAGES = {
  "auth.notConfigured": {
    tr: "Admin erişimi yapılandırılmamış. ADMIN_TOKEN veya trusted SSO ayarlayın.",
    en: "Admin access is not configured. Set ADMIN_TOKEN or trusted SSO.",
  },
  "auth.tokenRequired": {
    tr: "Admin erişimi gerekli.",
    en: "Admin access is required.",
  },
  "copilot.surfaceRequired": {
    tr: "İşlem yüzeyi seçilmelidir.",
    en: "Surface is required.",
  },
  "copilot.targetRequired": {
    tr: "Hedef kayıt seçilmelidir.",
    en: "Target is required.",
  },
  "copilot.unsupportedSurface": {
    tr: "Desteklenmeyen işlem yüzeyi.",
    en: "Unsupported surface.",
  },
  "knowledge.questionAnswerRequired": {
    tr: "Soru ve cevap alanları zorunludur.",
    en: "Question and answer are required.",
  },
  "knowledge.recordNotFound": {
    tr: "Bilgi bankası kaydı bulunamadı.",
    en: "Knowledge base record not found.",
  },
  "guardrail.knowledge.noTopicMatch": {
    tr: "Bu kayıt mevcut konu anahtar kelimeleriyle eşleşmediği için kaydedilemez. Önce uygun konu kapsamını netleştirin.",
    en: "This record cannot be saved because it does not match any current topic keyword. Clarify the topic coverage first.",
  },
  "contentGaps.handleUnavailable": {
    tr: "İçerik eksiği durumu güncellenemiyor.",
    en: "Content gap status update is unavailable.",
  },
  "contentGaps.queryRequired": {
    tr: "İçerik eksiği kaydı seçilmelidir.",
    en: "Content gap record is required.",
  },
  "contentGaps.invalidAction": {
    tr: "Geçersiz içerik eksiği aksiyonu.",
    en: "Invalid content gap action.",
  },
  "contentGaps.recordNotFound": {
    tr: "İçerik eksiği kaydı bulunamadı.",
    en: "Content gap record not found.",
  },
  "topics.invalidFilename": {
    tr: "Geçersiz dosya adı.",
    en: "Invalid filename.",
  },
  "topics.fileNotFound": {
    tr: "Dosya bulunamadı.",
    en: "File not found.",
  },
  "topics.contentRequired": {
    tr: "İçerik alanı zorunludur.",
    en: "Content is required.",
  },
  "topics.topicNotFound": {
    tr: "Konu bulunamadı.",
    en: "Topic not found.",
  },
  "topics.idTitleRequired": {
    tr: "Konu kimliği ve başlık zorunludur.",
    en: "Topic ID and title are required.",
  },
  "topics.invalidIdFormat": {
    tr: "Konu kimliği biçimi geçersiz.",
    en: "Invalid topic ID format.",
  },
  "topics.duplicateId": {
    tr: "Bu konu kimliği zaten kullanılıyor.",
    en: "This topic ID already exists.",
  },
  "guardrail.topics.missingRequiredInfo": {
    tr: "Yönlendirme açık olduğu için gerekli bilgi alanları doldurulmadan konu kaydedilemez.",
    en: "This topic cannot be saved while escalation is enabled and required information is empty.",
  },
  "guardrail.topics.directWithoutKb": {
    tr: "Doğrudan çözülebilir işaretlenen konu, eşleşen bilgi bankası kaydı olmadan kaydedilemez.",
    en: "A directly solvable topic cannot be saved without a matching knowledge base record.",
  },
};

function getAdminLocale(req) {
  const headerLocale = String(req.headers["x-admin-locale"] || "").trim().toLowerCase();
  const bodyLocale = String(req.body?.locale || "").trim().toLowerCase();
  const queryLocale = String(req.query?.locale || "").trim().toLowerCase();
  const locale = headerLocale || bodyLocale || queryLocale;
  return locale === "tr" ? "tr" : "en";
}

function adminMessage(req, key, params = {}) {
  const locale = getAdminLocale(req);
  const template = ADMIN_MESSAGES[key]?.[locale]
    || ADMIN_MESSAGES[key]?.en
    || key;

  return template.replace(/\{(\w+)\}/g, (_, token) => params[token] ?? "");
}

function adminError(res, req, status, key, params = {}) {
  return res.status(status).json({
    error: adminMessage(req, key, params),
    errorKey: key,
    errorMeta: params,
  });
}

module.exports = {
  getAdminLocale,
  adminMessage,
  adminError,
};

"use strict";

const TURKISH_STOP_WORDS = new Set([
  "bir", "bu", "su", "o", "ve", "ile", "de", "da", "den", "dan",
  "icin", "ki", "mi", "mu", "mi", "mi", "ne", "ama", "fakat", "ancak",
  "gibi", "kadar", "daha", "en", "cok", "az", "her", "hic", "bazi",
  "tum", "butun", "benim", "senin", "onun", "bizim", "sizin", "onlarin",
  "ben", "sen", "biz", "siz", "onlar", "ise", "veya", "ya", "hem",
  "nasil", "neden", "niye", "acaba",
]);

function removeStopWords(query) {
  if (!query || typeof query !== "string") return query || "";
  const words = query.split(/\s+/).filter(Boolean);
  const filtered = words.filter(w => !TURKISH_STOP_WORDS.has(w.toLowerCase()));
  // If all words are stop words, return original to avoid empty query
  return filtered.length > 0 ? filtered.join(" ") : query;
}

module.exports = { removeStopWords, TURKISH_STOP_WORDS };

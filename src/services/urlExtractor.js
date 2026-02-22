"use strict";

/**
 * URL Extractor Service
 *
 * Fetches a URL, extracts readable text via jsdom + Readability.
 * Factory pattern: createUrlExtractor(deps)
 */

function createUrlExtractor(deps) {
  const { logger } = deps;

  /**
   * Fetch a URL and extract readable text content.
   * @param {string} url - The URL to extract content from
   * @returns {{ title: string, text: string, excerpt: string }}
   */
  async function extract(url) {
    const { JSDOM } = require("jsdom");
    const { Readability } = require("@mozilla/readability");

    const response = await fetch(url, {
      headers: { "User-Agent": "Qragy-Bot/1.0 (Knowledge Importer)" },
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("text/html") && !contentType.includes("text/plain")) {
      throw new Error("Desteklenmeyen icerik tipi: " + contentType);
    }

    const html = await response.text();
    const dom = new JSDOM(html, { url });
    const reader = new Readability(dom.window.document);
    const article = reader.parse();

    if (!article || !article.textContent || article.textContent.trim().length < 50) {
      throw new Error("Sayfadan yeterli metin cikarilamadi.");
    }

    return {
      title: article.title || "",
      text: article.textContent.trim(),
      excerpt: (article.excerpt || "").trim(),
    };
  }

  return { extract };
}

module.exports = { createUrlExtractor };

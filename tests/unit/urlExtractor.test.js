"use strict";

const { createUrlExtractor } = require("../../src/services/urlExtractor.js");

describe("urlExtractor", () => {
  const logger = { info() {}, warn() {}, error() {} };

  it("extracts readable text from HTML content", async () => {
    const html = `<!DOCTYPE html>
<html><head><title>Test Page</title></head>
<body>
  <nav>Menu item</nav>
  <article>
    <h1>Test Article</h1>
    <p>This is a test article with enough content to pass the minimum threshold for extraction.
    It contains multiple sentences to make the readability algorithm happy. The article discusses
    various topics including technology and science. Lorem ipsum dolor sit amet, consectetur
    adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.</p>
  </article>
  <footer>Footer content</footer>
</body></html>`;

    // Mock global fetch
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => "text/html; charset=utf-8" },
      text: () => Promise.resolve(html),
    });

    try {
      const extractor = createUrlExtractor({ logger });
      const result = await extractor.extract("https://example.com/article");

      expect(result.title).toBeTruthy();
      expect(result.text).toContain("test article");
      expect(result.text.length).toBeGreaterThan(50);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("throws on non-HTML content type", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => "application/pdf" },
      text: () => Promise.resolve(""),
    });

    try {
      const extractor = createUrlExtractor({ logger });
      await expect(extractor.extract("https://example.com/file.pdf"))
        .rejects.toThrow("Desteklenmeyen icerik tipi");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("throws on HTTP error", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      statusText: "Not Found",
      headers: { get: () => "text/html" },
    });

    try {
      const extractor = createUrlExtractor({ logger });
      await expect(extractor.extract("https://example.com/404"))
        .rejects.toThrow("HTTP 404");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

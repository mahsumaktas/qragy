import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const PUBLIC_DIR = join(__dirname, "..", "..", "public");

describe("Bot Test Panel", () => {
  describe("test-widget.html is served correctly", () => {
    it("should exist and contain expected test mode markup", () => {
      const html = readFileSync(join(PUBLIC_DIR, "test-widget.html"), "utf-8");

      // Must set the test mode flag before app.js loads
      expect(html).toContain("window.__QRAGY_TEST_MODE__ = true");
      // Must load app.js
      expect(html).toContain('src="app.js"');
      // Must have a reset button
      expect(html).toContain("resetTestSession");
      // Must have the TEST MODE badge
      expect(html).toContain("TEST MODE");
      // Must load widget styles
      expect(html).toContain('href="style.css"');
    });
  });

  describe("test mode session isolation", () => {
    it("should prefix session IDs with test_ when testMode is active", () => {
      // Read app.js source and verify the session ID generation logic
      const appJs = readFileSync(join(PUBLIC_DIR, "app.js"), "utf-8");

      // Verify isTestMode detection line exists
      expect(appJs).toContain('window.__QRAGY_TEST_MODE__ === true');
      expect(appJs).toContain('urlParams.has("testMode")');

      // Verify session ID generation uses test_ prefix conditionally
      expect(appJs).toContain('const prefix = isTestMode ? "test_" : "s-"');
      expect(appJs).toContain("id = prefix + Date.now()");
    });
  });
});

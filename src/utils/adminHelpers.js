"use strict";

/**
 * Admin Helpers
 *
 * CSV data management, .env file read/write, filename validation.
 * Used by admin routes for knowledge base and runtime config management.
 */

function createAdminHelpers(deps) {
  const { fs, path, Papa, logger, csvFile, envDir } = deps;

  function loadCSVData() {
    try {
      const raw = fs.readFileSync(csvFile, "utf8");
      const result = Papa.parse(raw, { header: true, skipEmptyLines: true });
      return result.data || [];
    } catch (err) {
      logger.warn("csv", "CSV yuklenemedi", err);
      return [];
    }
  }

  function saveCSVData(rows) {
    const csv = Papa.unparse(rows, { header: true });
    fs.writeFileSync(csvFile, csv, "utf8");
  }

  function readEnvFile() {
    try {
      const raw = fs.readFileSync(path.join(envDir, ".env"), "utf8");
      const result = {};
      for (const line of raw.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const eqIdx = trimmed.indexOf("=");
        if (eqIdx < 0) continue;
        const key = trimmed.slice(0, eqIdx).trim();
        const value = trimmed.slice(eqIdx + 1).trim();
        result[key] = value;
      }
      return result;
    } catch (_err) {
      return {};
    }
  }

  function writeEnvFile(updates) {
    const envPath = path.join(envDir, ".env");
    let raw = "";
    try { raw = fs.readFileSync(envPath, "utf8"); } catch (_err) { /* ignore */ }

    const lines = raw.split("\n");
    const updatedKeys = new Set();
    const newLines = lines.map(line => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) return line;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx < 0) return line;
      const key = trimmed.slice(0, eqIdx).trim();
      if (key in updates) {
        updatedKeys.add(key);
        return `${key}=${updates[key]}`;
      }
      return line;
    });

    for (const [key, value] of Object.entries(updates)) {
      if (!updatedKeys.has(key)) {
        newLines.push(`${key}=${value}`);
      }
    }

    fs.writeFileSync(envPath, newLines.join("\n"), "utf8");
  }

  function isValidFilename(name) {
    if (!name || typeof name !== "string") return false;
    if (name.includes("..") || name.includes("/") || name.includes("\\")) return false;
    if (!/^[a-zA-Z0-9_-]+\.(md|json)$/.test(name)) return false;
    return true;
  }

  return { loadCSVData, saveCSVData, readEnvFile, writeEnvFile, isValidFilename };
}

module.exports = { createAdminHelpers };

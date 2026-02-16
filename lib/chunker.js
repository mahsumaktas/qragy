/**
 * Document chunking engine
 *
 * Strategies: markdown, recursive, sentence
 * Auto-detects best strategy based on filename + content
 */

"use strict";

// ── Strategy Detection ──────────────────────────────────────────────────

function detectStrategy(text, filename) {
  if (filename) {
    const ext = filename.toLowerCase().split(".").pop();
    if (ext === "md" || ext === "markdown") return "markdown";
  }

  // Check if text has markdown headers
  if (/^#{1,3}\s+/m.test(text)) {
    const headerCount = (text.match(/^#{1,3}\s+/gm) || []).length;
    const lineCount = text.split("\n").length;
    // If headers appear reasonably often, treat as markdown
    if (headerCount >= 2 && headerCount / lineCount > 0.01) return "markdown";
  }

  // Check paragraph density — if few paragraph breaks relative to text length, use sentence
  const paragraphs = text.split(/\n\s*\n/).filter((p) => p.trim());
  const avgParagraphLen = text.length / Math.max(paragraphs.length, 1);
  if (avgParagraphLen > 2000) return "sentence";

  return "recursive";
}

// ── Markdown Chunker ────────────────────────────────────────────────────

function chunkMarkdown(text, chunkSize = 800, overlap = 100) {
  const lines = text.split("\n");
  const sections = [];
  let currentSection = { headers: [], lines: [] };

  for (const line of lines) {
    const headerMatch = line.match(/^(#{1,3})\s+(.+)/);
    if (headerMatch) {
      // Save previous section if it has content
      if (currentSection.lines.length > 0) {
        sections.push({ ...currentSection, lines: [...currentSection.lines] });
      }
      const level = headerMatch[1].length;
      const headerText = headerMatch[2].trim();
      // Keep parent headers, replace at this level
      const headers = currentSection.headers.slice(0, level - 1);
      headers[level - 1] = headerText;
      currentSection = { headers: [...headers], lines: [] };
    } else {
      currentSection.lines.push(line);
    }
  }

  // Don't forget last section
  if (currentSection.lines.length > 0) {
    sections.push(currentSection);
  }

  const chunks = [];
  for (const section of sections) {
    const prefix = section.headers.filter(Boolean).join(" > ");
    const body = section.lines.join("\n").trim();
    if (!body) continue;

    const fullText = prefix ? prefix + "\n\n" + body : body;

    if (fullText.length <= chunkSize) {
      chunks.push(fullText);
    } else {
      // Fall back to recursive for oversized sections
      const subChunks = chunkRecursive(body, chunkSize, overlap);
      for (const sub of subChunks) {
        chunks.push(prefix ? prefix + "\n\n" + sub : sub);
      }
    }
  }

  return chunks.filter((c) => c.length > 20);
}

// ── Recursive Chunker ───────────────────────────────────────────────────

function chunkRecursive(text, chunkSize = 800, overlap = 100) {
  if (text.length <= chunkSize) {
    return text.trim() ? [text.trim()] : [];
  }

  // Try separators in order: double newline, single newline, sentence end, space
  const separators = ["\n\n", "\n", ". ", " "];

  for (const sep of separators) {
    const parts = text.split(sep);
    if (parts.length <= 1) continue;

    const chunks = [];
    let current = "";

    for (const part of parts) {
      const candidate = current ? current + sep + part : part;

      if (candidate.length > chunkSize && current) {
        chunks.push(current.trim());
        // Overlap: keep tail of previous chunk
        if (overlap > 0 && current.length > overlap) {
          current = current.slice(-overlap) + sep + part;
        } else {
          current = part;
        }
      } else {
        current = candidate;
      }
    }

    if (current.trim()) {
      chunks.push(current.trim());
    }

    if (chunks.length > 1) {
      return chunks.filter((c) => c.length > 20);
    }
  }

  // Last resort: character-level splitting
  const chunks = [];
  let start = 0;
  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length);
    chunks.push(text.slice(start, end).trim());
    start += chunkSize - overlap;
  }
  return chunks.filter((c) => c.length > 20);
}

// ── Sentence Chunker ────────────────────────────────────────────────────

function chunkBySentence(text, chunkSize = 800) {
  // Split on sentence boundaries, supporting Turkish characters
  const sentences = text.split(/(?<=[.!?;])\s+(?=[A-ZÇĞİÖŞÜçğıöşü\d])/);

  const chunks = [];
  let current = "";

  for (const sentence of sentences) {
    const candidate = current ? current + " " + sentence : sentence;

    if (candidate.length > chunkSize && current) {
      chunks.push(current.trim());
      current = sentence;
    } else {
      current = candidate;
    }
  }

  if (current.trim()) {
    chunks.push(current.trim());
  }

  return chunks.filter((c) => c.length > 20);
}

// ── Main Dispatcher ─────────────────────────────────────────────────────

function chunkText(text, { filename, strategy, chunkSize = 800, overlap = 100 } = {}) {
  const strat = strategy || detectStrategy(text, filename);

  switch (strat) {
    case "markdown":
      return chunkMarkdown(text, chunkSize, overlap);
    case "sentence":
      return chunkBySentence(text, chunkSize);
    default:
      return chunkRecursive(text, chunkSize, overlap);
  }
}

// ── Exports ─────────────────────────────────────────────────────────────

module.exports = { chunkText, chunkMarkdown, chunkRecursive, chunkBySentence, detectStrategy };

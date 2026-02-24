const LOG_LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };

function createLogger(opts = {}) {
  const level = LOG_LEVELS[(opts.level || process.env.LOG_LEVEL || "info").toLowerCase()] ?? LOG_LEVELS.info;

  function format(lvl, context, message, extra) {
    const ts = new Date().toISOString();
    const ctx = context ? ` [${context}]` : "";
    const base = `${ts} [${lvl.toUpperCase()}]${ctx} ${message}`;
    if (extra !== undefined) {
      let detail;
      if (extra instanceof Error) {
        detail = extra.message;
      } else if (typeof extra === "object" && extra !== null) {
        try { detail = JSON.stringify(extra); } catch { detail = String(extra); }
      } else {
        detail = String(extra);
      }
      return `${base} ${detail}`;
    }
    return base;
  }

  return {
    error(context, message, extra) {
      if (level >= LOG_LEVELS.error) {
        console.error(format("error", context, message, extra));
      }
    },
    warn(context, message, extra) {
      if (level >= LOG_LEVELS.warn) {
        console.warn(format("warn", context, message, extra));
      }
    },
    info(context, message, extra) {
      if (level >= LOG_LEVELS.info) {
        console.log(format("info", context, message, extra));
      }
    },
    debug(context, message, extra) {
      if (level >= LOG_LEVELS.debug) {
        console.log(format("debug", context, message, extra));
      }
    },
  };
}

const logger = createLogger();

module.exports = { createLogger, logger };

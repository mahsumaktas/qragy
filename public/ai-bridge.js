(function (window, document) {
  "use strict";

  if (!window || !document) {
    return;
  }

  if (window.__qragyAiBridgeInstalled) {
    if (window.console && typeof window.console.log === "function") {
      window.console.log("[Qragy] AI bridge already installed.");
    }
    return;
  }
  window.__qragyAiBridgeInstalled = true;

  var DEFAULT_CONFIG = {
    aiOrigin: "",
    aiUrl: "",
    supportButtonSelector: "button.supportButton__N-QLW",
    supportButtonText: "canli destek",
    defaultTags: ["qragy", "ai_handoff"],
    debug: true,
    frame: {
      right: "16px",
      bottom: "16px",
      width: "420px",
      height: "680px",
      maxWidth: "calc(100vw - 24px)",
      maxHeight: "calc(100vh - 24px)",
      border: "1px solid #c7d5df",
      borderRadius: "14px",
      boxShadow: "0 18px 40px rgba(0, 0, 0, .2)",
      background: "#fff",
      zIndex: "2147483000"
    },
    zendeskPollIntervalMs: 300,
    zendeskPollAttempts: 50,
    sendRetryDelaysMs: [600, 1400, 2400]
  };

  var userConfig = window.QragyBridgeConfig || window.CorpcxBridgeConfig || {};
  var config = mergeConfig(DEFAULT_CONFIG, userConfig);

  config.aiOrigin = getOrigin(config.aiUrl) || trimTrailingSlash(config.aiOrigin);
  config.aiUrl = config.aiUrl || (config.aiOrigin + "/?embed=1");

  var state = {
    aiFrame: null,
    allowNativeSupportClick: false,
    handoffInProgress: false
  };

  function mergeConfig(baseConfig, overrideConfig) {
    var merged = {
      aiOrigin: baseConfig.aiOrigin,
      aiUrl: baseConfig.aiUrl,
      supportButtonSelector: baseConfig.supportButtonSelector,
      supportButtonText: baseConfig.supportButtonText,
      defaultTags: baseConfig.defaultTags.slice(0),
      debug: baseConfig.debug,
      frame: {
        right: baseConfig.frame.right,
        bottom: baseConfig.frame.bottom,
        width: baseConfig.frame.width,
        height: baseConfig.frame.height,
        maxWidth: baseConfig.frame.maxWidth,
        maxHeight: baseConfig.frame.maxHeight,
        border: baseConfig.frame.border,
        borderRadius: baseConfig.frame.borderRadius,
        boxShadow: baseConfig.frame.boxShadow,
        background: baseConfig.frame.background,
        zIndex: baseConfig.frame.zIndex
      },
      zendeskPollIntervalMs: baseConfig.zendeskPollIntervalMs,
      zendeskPollAttempts: baseConfig.zendeskPollAttempts,
      sendRetryDelaysMs: baseConfig.sendRetryDelaysMs.slice(0)
    };

    if (!overrideConfig || typeof overrideConfig !== "object") {
      return merged;
    }

    if (typeof overrideConfig.aiOrigin === "string" && overrideConfig.aiOrigin) {
      merged.aiOrigin = overrideConfig.aiOrigin;
    }

    if (typeof overrideConfig.aiUrl === "string" && overrideConfig.aiUrl) {
      merged.aiUrl = overrideConfig.aiUrl;
    }

    if (typeof overrideConfig.supportButtonSelector === "string" && overrideConfig.supportButtonSelector) {
      merged.supportButtonSelector = overrideConfig.supportButtonSelector;
    }

    if (typeof overrideConfig.supportButtonText === "string" && overrideConfig.supportButtonText) {
      merged.supportButtonText = overrideConfig.supportButtonText;
    }

    if (Array.isArray(overrideConfig.defaultTags) && overrideConfig.defaultTags.length) {
      merged.defaultTags = overrideConfig.defaultTags.slice(0);
    }

    if (typeof overrideConfig.debug === "boolean") {
      merged.debug = overrideConfig.debug;
    }

    if (overrideConfig.frame && typeof overrideConfig.frame === "object") {
      if (typeof overrideConfig.frame.right === "string") merged.frame.right = overrideConfig.frame.right;
      if (typeof overrideConfig.frame.bottom === "string") merged.frame.bottom = overrideConfig.frame.bottom;
      if (typeof overrideConfig.frame.width === "string") merged.frame.width = overrideConfig.frame.width;
      if (typeof overrideConfig.frame.height === "string") merged.frame.height = overrideConfig.frame.height;
      if (typeof overrideConfig.frame.maxWidth === "string") merged.frame.maxWidth = overrideConfig.frame.maxWidth;
      if (typeof overrideConfig.frame.maxHeight === "string") merged.frame.maxHeight = overrideConfig.frame.maxHeight;
      if (typeof overrideConfig.frame.border === "string") merged.frame.border = overrideConfig.frame.border;
      if (typeof overrideConfig.frame.borderRadius === "string") merged.frame.borderRadius = overrideConfig.frame.borderRadius;
      if (typeof overrideConfig.frame.boxShadow === "string") merged.frame.boxShadow = overrideConfig.frame.boxShadow;
      if (typeof overrideConfig.frame.background === "string") merged.frame.background = overrideConfig.frame.background;
      if (typeof overrideConfig.frame.zIndex === "string") merged.frame.zIndex = overrideConfig.frame.zIndex;
    }

    if (typeof overrideConfig.zendeskPollIntervalMs === "number" && overrideConfig.zendeskPollIntervalMs > 0) {
      merged.zendeskPollIntervalMs = overrideConfig.zendeskPollIntervalMs;
    }

    if (typeof overrideConfig.zendeskPollAttempts === "number" && overrideConfig.zendeskPollAttempts > 0) {
      merged.zendeskPollAttempts = overrideConfig.zendeskPollAttempts;
    }

    if (Array.isArray(overrideConfig.sendRetryDelaysMs) && overrideConfig.sendRetryDelaysMs.length) {
      merged.sendRetryDelaysMs = overrideConfig.sendRetryDelaysMs.slice(0);
    }

    return merged;
  }

  function trimTrailingSlash(value) {
    return String(value || "").replace(/\/$/, "");
  }

  function getOrigin(url) {
    try {
      var parsed = new URL(url);
      return trimTrailingSlash(parsed.origin);
    } catch (_error) {
      return "";
    }
  }

  function log(message) {
    if (!config.debug) return;
    if (window.console && typeof window.console.log === "function") {
      window.console.log("[Qragy] " + message);
    }
  }

  function warn(message) {
    if (window.console && typeof window.console.warn === "function") {
      window.console.warn("[Qragy] " + message);
    }
  }

  function normalizeText(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/\u0131/g, "i")
      .replace(/\u00e7/g, "c")
      .replace(/\u011f/g, "g")
      .replace(/\u00f6/g, "o")
      .replace(/\u015f/g, "s")
      .replace(/\u00fc/g, "u")
      .trim();
  }

  function matchesSelector(element, selector) {
    if (!element || typeof selector !== "string" || !selector) {
      return false;
    }

    var matcher = element.matches || element.msMatchesSelector || element.webkitMatchesSelector;
    if (!matcher) {
      return false;
    }

    try {
      return matcher.call(element, selector);
    } catch (_error) {
      return false;
    }
  }

  function closestButtonElement(startNode) {
    var node = startNode;
    while (node && node !== document) {
      if (node.nodeType === 1) {
        if (matchesSelector(node, "button, [role='button']")) {
          return node;
        }
      }
      node = node.parentNode;
    }
    return null;
  }

  function findSupportButtonByText() {
    var candidates = document.querySelectorAll("button, [role='button']");
    var expected = normalizeText(config.supportButtonText);
    var i;

    for (i = 0; i < candidates.length; i += 1) {
      var candidate = candidates[i];
      var text = normalizeText(candidate.textContent || "");
      if (text.indexOf(expected) !== -1) {
        return candidate;
      }
    }

    return null;
  }

  function findSupportButton() {
    if (config.supportButtonSelector) {
      var selected = document.querySelector(config.supportButtonSelector);
      if (selected) {
        return selected;
      }
    }

    return findSupportButtonByText();
  }

  function isSupportButtonElement(buttonElement) {
    if (!buttonElement) {
      return false;
    }

    if (config.supportButtonSelector && matchesSelector(buttonElement, config.supportButtonSelector)) {
      return true;
    }

    var text = normalizeText(buttonElement.textContent || "");
    var expected = normalizeText(config.supportButtonText);
    return text.indexOf(expected) !== -1;
  }

  function ensureAiFrame() {
    if (state.aiFrame && state.aiFrame.parentNode) {
      return state.aiFrame;
    }

    var frame = document.createElement("iframe");
    frame.src = config.aiUrl;
    frame.title = "Qragy Teknik Destek AI";
    frame.setAttribute("data-qragy-ai-frame", "1");
    frame.setAttribute("allow", "clipboard-read; clipboard-write");

    frame.style.position = "fixed";
    frame.style.right = config.frame.right;
    frame.style.bottom = config.frame.bottom;
    frame.style.width = config.frame.width;
    frame.style.height = config.frame.height;
    frame.style.maxWidth = config.frame.maxWidth;
    frame.style.maxHeight = config.frame.maxHeight;
    frame.style.border = config.frame.border;
    frame.style.borderRadius = config.frame.borderRadius;
    frame.style.boxShadow = config.frame.boxShadow;
    frame.style.background = config.frame.background;
    frame.style.zIndex = config.frame.zIndex;
    frame.style.display = "none";

    document.body.appendChild(frame);
    state.aiFrame = frame;
    return frame;
  }

  function openAiFrame() {
    var frame = ensureAiFrame();
    frame.style.display = "block";
  }

  function closeAiFrame() {
    if (state.aiFrame && state.aiFrame.parentNode) {
      state.aiFrame.style.display = "none";
    }
  }

  function isZendeskReady() {
    return typeof window.zE === "function";
  }

  function openZendeskUi() {
    if (!isZendeskReady()) {
      return false;
    }

    var opened = false;

    try {
      window.zE("messenger", "open");
      opened = true;
    } catch (_error1) {
      // ignore
    }

    try {
      window.zE("webWidget", "show");
      opened = true;
    } catch (_error2) {
      // ignore
    }

    try {
      window.zE("webWidget", "open");
      opened = true;
    } catch (_error3) {
      // ignore
    }

    return opened;
  }

  function addZendeskTags(tags) {
    if (!isZendeskReady()) {
      return;
    }

    if (!Array.isArray(tags) || !tags.length) {
      return;
    }

    try {
      window.zE("webWidget", "chat:addTags", tags);
    } catch (_error) {
      // ignore
    }
  }

  function sendZendeskSummary(summaryText) {
    if (!isZendeskReady()) {
      return false;
    }

    try {
      window.zE("webWidget", "chat:send", summaryText);
      return true;
    } catch (_error) {
      return false;
    }
  }

  function sendSummaryWithRetries(summaryText, tags) {
    var i;

    addZendeskTags(tags);
    sendZendeskSummary(summaryText);

    for (i = 0; i < config.sendRetryDelaysMs.length; i += 1) {
      (function (delayMs) {
        window.setTimeout(function () {
          addZendeskTags(tags);
          sendZendeskSummary(summaryText);
        }, delayMs);
      })(config.sendRetryDelaysMs[i]);
    }
  }

  function clickNativeSupportButton() {
    var supportButton = findSupportButton();
    if (!supportButton) {
      return false;
    }

    state.allowNativeSupportClick = true;

    try {
      supportButton.click();
    } catch (_error) {
      state.allowNativeSupportClick = false;
      return false;
    }

    window.setTimeout(function () {
      state.allowNativeSupportClick = false;
    }, 0);

    return true;
  }

  function handoffToZendesk(summaryText, tags) {
    if (state.handoffInProgress) {
      return;
    }

    state.handoffInProgress = true;

    var attempts = 0;
    var pollTimer = null;

    function done(success) {
      if (pollTimer) {
        window.clearInterval(pollTimer);
        pollTimer = null;
      }

      state.handoffInProgress = false;

      if (success) {
        closeAiFrame();
        log("Zendesk handoff success.");
      } else {
        warn("Zendesk handoff failed. zE not ready.");
      }
    }

    function tryOpenAndSend() {
      if (!isZendeskReady()) {
        return false;
      }

      openZendeskUi();
      sendSummaryWithRetries(summaryText, tags);
      return true;
    }

    if (tryOpenAndSend()) {
      done(true);
      return;
    }

    clickNativeSupportButton();

    pollTimer = window.setInterval(function () {
      attempts += 1;

      if (tryOpenAndSend()) {
        done(true);
        return;
      }

      if (attempts >= config.zendeskPollAttempts) {
        done(false);
      }
    }, config.zendeskPollIntervalMs);
  }

  function isTrustedMessage(event) {
    if (!event || !event.origin || !config.aiOrigin) {
      return false;
    }

    return trimTrailingSlash(event.origin) === trimTrailingSlash(config.aiOrigin);
  }

  function onHandoffMessage(event) {
    if (!isTrustedMessage(event)) {
      return;
    }

    var payload = event.data || {};
    if (payload.type !== "QRAGY_HANDOFF" && payload.type !== "CORPCX_HANDOFF") {
      return;
    }

    var summaryText = String(payload.summary || "AI handoff");
    var tags = Array.isArray(payload.tags) && payload.tags.length
      ? payload.tags.slice(0)
      : config.defaultTags.slice(0);

    handoffToZendesk(summaryText, tags);
  }

  function onDocumentClick(event) {
    if (state.allowNativeSupportClick) {
      return;
    }

    var target = event.target || event.srcElement;
    var clickedButton = closestButtonElement(target);

    if (!isSupportButtonElement(clickedButton)) {
      return;
    }

    if (event.preventDefault) {
      event.preventDefault();
    } else {
      event.returnValue = false;
    }

    if (event.stopPropagation) {
      event.stopPropagation();
    }

    if (event.stopImmediatePropagation) {
      event.stopImmediatePropagation();
    }

    openAiFrame();
  }

  function installBridge() {
    document.addEventListener("click", onDocumentClick, true);
    window.addEventListener("message", onHandoffMessage, false);
    log("AI bridge active.");
  }

  installBridge();
})(window, document);

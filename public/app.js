/* ============================================================
   Qragy Chatbot – app.js v2 (20 Feature Enhancement)
   ============================================================ */

const launchSupportButton = document.getElementById("launchSupportButton");
const closeWidgetButton = document.getElementById("closeWidgetButton");
const aiWidget = document.getElementById("aiWidget");
const pageShell = document.querySelector(".page-shell");
const composeStatus = document.getElementById("composeStatus");
const handoffStatus = document.getElementById("handoffStatus");
const handoffActions = document.getElementById("handoffActions");
const manualHandoffButton = document.getElementById("manualHandoffButton");
const chatMessages = document.getElementById("chatMessages");
const chatForm = document.getElementById("chatForm");
const chatInput = document.getElementById("chatInput");
const sendButton = document.getElementById("sendButton");
const statusDot = document.getElementById("statusDot");
const statusText = document.getElementById("statusText");
const fabLauncher = document.getElementById("fabLauncher");
const scrollDownBtn = document.getElementById("scrollDownBtn");
const quickRepliesContainer = document.getElementById("quickReplies");
const connectionBanner = document.getElementById("connectionBanner");
const darkModeToggle = document.getElementById("darkModeToggle");
const soundToggle = document.getElementById("soundToggle");
const exportBtn = document.getElementById("exportBtn");
const endSessionBtn = document.getElementById("endSessionBtn");
const attachBtn = document.getElementById("attachBtn");
const fileInput = document.getElementById("fileInput");

const messages = [];
const urlParams = new URLSearchParams(window.location.search);
const isEmbedMode = urlParams.get("embed") === "1";
const USER_BUFFER_WINDOW_MS = 4000;
const TIMESTAMP_GAP_MS = 3 * 60 * 1000;
const STORAGE_KEY = "qragy_chat";
const SESSION_TTL_MS = 30 * 60 * 1000;
const NUDGE_DELAY_MS = 30000;

const state = {
  widgetStarted: false,
  isSending: false,
  flushTimer: null,
  flushAfterSend: false,
  pendingUserSegments: [],
  zendeskLoadPromise: null,
  runtimeConfigLoadPromise: null,
  handoffInFlight: new Set(),
  handedOffTickets: new Set(),
  lastHandoffPayload: null,
  lastSystemStatus: "",
  triggerElement: null,
  lastMessageTime: 0,
  soundEnabled: true,
  nudgeShown: false,
  nudgeTimer: null,
  sessionLoaded: false,
  offlineQueue: [],
  runtimeConfig: {
    zendesk: {
      enabled: false,
      snippetKey: "",
      defaultTags: ["qragy", "ai_handoff"]
    },
    support: {
      enabled: false,
      isOpen: true,
      timezone: "Europe/Istanbul",
      openHour: 8,
      closeHour: 23,
      openDays: [1, 2, 3, 4, 5, 6, 7]
    }
  }
};

/* ---- localStorage Persistence (1.1) ---- */

function saveSession() {
  try {
    const data = {
      messages,
      widgetStarted: state.widgetStarted,
      lastMessageTime: state.lastMessageTime,
      savedAt: Date.now()
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (_e) {
    // localStorage dolu veya devre disi
  }
}

function loadSession() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;

    const data = JSON.parse(raw);
    if (!data || !Array.isArray(data.messages) || !data.messages.length) return false;

    // TTL kontrolu
    if (data.savedAt && Date.now() - data.savedAt > SESSION_TTL_MS) {
      clearSession();
      return false;
    }

    // Mesajlari yukle
    messages.length = 0;
    for (const msg of data.messages) {
      messages.push(msg);
    }

    state.widgetStarted = Boolean(data.widgetStarted);
    state.lastMessageTime = data.lastMessageTime || 0;

    // Mesajlari DOM'a animasyonsuz render et
    for (const msg of messages) {
      const bubble = document.createElement("div");
      bubble.className = `message ${msg.role} no-animate`;
      if (msg.role === "assistant") {
        bubble.innerHTML = renderMarkdown(msg.content);
      } else {
        bubble.textContent = msg.content;
      }
      chatMessages.appendChild(bubble);
    }

    scrollToBottom();
    state.sessionLoaded = true;
    return true;
  } catch (_e) {
    return false;
  }
}

function clearSession() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (_e) {
    // ignore
  }
}

/* ---- Timestamp ---- */

function maybeInsertTimestamp() {
  const now = Date.now();
  if (state.lastMessageTime && now - state.lastMessageTime >= TIMESTAMP_GAP_MS) {
    const divider = document.createElement("div");
    divider.className = "timestamp-divider";
    divider.setAttribute("aria-hidden", "true");
    divider.textContent = new Date(now).toLocaleTimeString("tr-TR", {
      hour: "2-digit",
      minute: "2-digit"
    });
    chatMessages.appendChild(divider);
  }
  state.lastMessageTime = now;
}

/* ---- Markdown Rendering (3.1) ---- */

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function renderMarkdown(text) {
  if (!text) return "";

  // Escape HTML first to prevent XSS
  let html = escapeHtml(text);

  // Bold: **text**
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");

  // Italic: *text*
  html = html.replace(/\*(.+?)\*/g, "<em>$1</em>");

  // Bullet lists: lines starting with "- "
  html = html.replace(/((?:^|\n)- .+(?:\n- .+)*)/g, (match) => {
    const items = match.trim().split("\n").map((line) => {
      const content = line.replace(/^- /, "");
      return `<li>${content}</li>`;
    }).join("");
    return `<ul>${items}</ul>`;
  });

  // Line breaks
  html = html.replace(/\n/g, "<br>");

  // Clean up: remove <br> right before/after <ul>/<li>
  html = html.replace(/<br><ul>/g, "<ul>");
  html = html.replace(/<\/ul><br>/g, "</ul>");

  return html;
}

/* ---- Messages ---- */

function pushMessage(role, content, persist = true) {
  if (persist) {
    messages.push({ role, content });
    saveSession();
  }

  maybeInsertTimestamp();

  const bubble = document.createElement("div");
  bubble.className = `message ${role}`;

  if (role === "assistant") {
    bubble.innerHTML = renderMarkdown(content);
  } else {
    bubble.textContent = content;
    // Delivery status (2.2)
    const statusEl = document.createElement("span");
    statusEl.className = "msg-status sending";
    bubble.appendChild(statusEl);
    bubble._statusEl = statusEl;
  }

  chatMessages.appendChild(bubble);

  // User mesaji: her zaman alta in (kullanici gonderdiyse gormek ister)
  // Assistant mesaji: sadece zaten alttaysa otomatik scroll
  if (role === "user") {
    scrollToBottom();
  } else if (isNearBottom()) {
    scrollToBottom();
  } else {
    scrollDownBtn.hidden = false;
  }

  resetNudgeTimer();
  return bubble;
}

function scrollToBottom() {
  chatMessages.scrollTop = chatMessages.scrollHeight;
  requestAnimationFrame(() => {
    chatMessages.scrollTop = chatMessages.scrollHeight;
    requestAnimationFrame(() => {
      chatMessages.scrollTop = chatMessages.scrollHeight;
    });
  });
}

/* ---- Scroll-to-Bottom Button (1.5) ---- */

function isNearBottom() {
  return chatMessages.scrollTop + chatMessages.clientHeight >= chatMessages.scrollHeight - 60;
}

let scrollDebounceTimer = null;
chatMessages.addEventListener("scroll", () => {
  if (scrollDebounceTimer) return;
  scrollDebounceTimer = setTimeout(() => {
    scrollDebounceTimer = null;
    scrollDownBtn.hidden = isNearBottom();
  }, 100);
});

scrollDownBtn.addEventListener("click", () => {
  scrollToBottom();
  scrollDownBtn.hidden = true;
});

/* ---- Quick Replies (1.2) ---- */

function renderQuickReplies(replies) {
  if (!replies || !replies.length) {
    quickRepliesContainer.hidden = true;
    quickRepliesContainer.innerHTML = "";
    return;
  }

  quickRepliesContainer.innerHTML = "";
  quickRepliesContainer.hidden = false;

  for (const text of replies) {
    const btn = document.createElement("button");
    btn.className = "quick-reply-btn";
    btn.type = "button";
    btn.textContent = text;
    btn.addEventListener("click", () => {
      chatInput.value = text;
      chatForm.requestSubmit();
      clearQuickReplies();
    });
    quickRepliesContainer.appendChild(btn);
  }
}

function clearQuickReplies() {
  quickRepliesContainer.hidden = true;
  quickRepliesContainer.innerHTML = "";
}

/* ---- Welcome Screen (1.3) ---- */

function showWelcomeScreen() {
  chatMessages.innerHTML = `
    <div class="welcome-screen">
      <div class="welcome-logo" aria-hidden="true">
        <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path d="M12 2a9 9 0 0 0-9 9v5a3 3 0 0 0 3 3h1a1 1 0 0 0 1-1v-5a1 1 0 0 0-1-1H5v-1a7 7 0 1 1 14 0v1h-2a1 1 0 0 0-1 1v5a1 1 0 0 0 1 1h1.28A2 2 0 0 1 16 20h-2a1 1 0 1 0 0 2h2a4 4 0 0 0 3.87-3H21a3 3 0 0 0 3-3v-5a9 9 0 0 0-9-9Z"/>
        </svg>
      </div>
      <div class="welcome-title">QRAGY Teknik Destek</div>
      <div class="welcome-subtitle">Teknik sorunlariniz icin size yardimci olabiliriz.</div>
      <button class="welcome-start-btn" type="button" id="welcomeStartBtn">Sohbete Başla</button>
    </div>
  `;

  document.getElementById("welcomeStartBtn").addEventListener("click", dismissWelcome);
}

function dismissWelcome() {
  chatMessages.innerHTML = "";
  state.widgetStarted = true;
  pushMessage(
    "assistant",
    "Merhaba, Teknik Destek hattina hos geldiniz. Talep olusturmamiz icin firma adi (opsiyonel), sube kodu ve sorununuzu paylasir misiniz?"
  );
  chatInput.focus();
}

/* ---- Skeleton Loading (2.3) ---- */

function showSkeleton() {
  const container = document.createElement("div");
  container.id = "skeletonLoader";
  for (let i = 0; i < 3; i++) {
    const skel = document.createElement("div");
    skel.className = "skeleton-msg";
    container.appendChild(skel);
  }
  chatMessages.appendChild(container);
}

function removeSkeleton() {
  const el = document.getElementById("skeletonLoader");
  if (el) el.remove();
}

/* ---- Connection Banner (1.4) ---- */

function showConnectionBanner() {
  connectionBanner.hidden = false;
}

function hideConnectionBanner() {
  connectionBanner.hidden = true;
}

window.addEventListener("online", () => {
  hideConnectionBanner();
  flushOfflineQueue();
});

window.addEventListener("offline", () => {
  showConnectionBanner();
});

/* ---- Notification Sound (3.2) ---- */

let audioCtx = null;

function playNotificationSound() {
  if (!state.soundEnabled) return;
  if (document.hasFocus()) return; // Sayfa focus'taysa calma

  try {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }

    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.frequency.setValueAtTime(800, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(600, audioCtx.currentTime + 0.1);
    gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.15);
    osc.start(audioCtx.currentTime);
    osc.stop(audioCtx.currentTime + 0.15);
  } catch (_e) {
    // Ses calinamiyor, sessizce devam et
  }
}

function initSoundToggle() {
  const saved = localStorage.getItem("qragy_sound");
  if (saved === "false") {
    state.soundEnabled = false;
    soundToggle.classList.add("muted");
  }

  soundToggle.addEventListener("click", () => {
    state.soundEnabled = !state.soundEnabled;
    soundToggle.classList.toggle("muted", !state.soundEnabled);
    localStorage.setItem("qragy_sound", String(state.soundEnabled));
  });
}

/* ---- Dark Mode (3.5) ---- */

function initDarkMode() {
  const saved = localStorage.getItem("qragy_theme");
  if (saved === "dark") {
    document.documentElement.setAttribute("data-theme", "dark");
  } else if (saved === "light") {
    document.documentElement.removeAttribute("data-theme");
  } else {
    // Sistem tercihine bak
    if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
      document.documentElement.setAttribute("data-theme", "dark");
    }
  }

  darkModeToggle.addEventListener("click", () => {
    const isDark = document.documentElement.getAttribute("data-theme") === "dark";
    if (isDark) {
      document.documentElement.removeAttribute("data-theme");
      localStorage.setItem("qragy_theme", "light");
    } else {
      document.documentElement.setAttribute("data-theme", "dark");
      localStorage.setItem("qragy_theme", "dark");
    }
  });

  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", (e) => {
    const saved = localStorage.getItem("qragy_theme");
    if (!saved) {
      if (e.matches) {
        document.documentElement.setAttribute("data-theme", "dark");
      } else {
        document.documentElement.removeAttribute("data-theme");
      }
    }
  });
}

/* ---- Proactive Nudge (2.5) ---- */

function resetNudgeTimer() {
  if (state.nudgeTimer) {
    clearTimeout(state.nudgeTimer);
    state.nudgeTimer = null;
  }

  if (state.nudgeShown || !state.widgetStarted) return;

  state.nudgeTimer = setTimeout(() => {
    if (!state.nudgeShown && state.widgetStarted && !aiWidget.hidden && !state.isSending) {
      state.nudgeShown = true;
      pushMessage("assistant", "Yardımcı olabilir miyim? Teknik bir sorun yaşıyorsanız bana iletebilirsiniz.", false);
    }
  }, NUDGE_DELAY_MS);
}

/* ---- CSAT Survey (3.3) ---- */

function showCSATSurvey(ticketId) {
  const container = document.createElement("div");
  container.className = "csat-survey";

  const title = document.createElement("div");
  title.className = "csat-title";
  title.textContent = "Deneyiminizi değerlendirir misiniz?";
  container.appendChild(title);

  const starsDiv = document.createElement("div");
  starsDiv.className = "csat-stars";

  for (let i = 1; i <= 5; i++) {
    const star = document.createElement("button");
    star.className = "csat-star";
    star.type = "button";
    star.textContent = "\u2605";
    star.setAttribute("aria-label", `${i} yıldız`);

    star.addEventListener("mouseenter", () => {
      const stars = starsDiv.querySelectorAll(".csat-star");
      stars.forEach((s, idx) => s.classList.toggle("active", idx < i));
    });

    star.addEventListener("click", () => {
      submitCSATRating(ticketId, i);
      container.innerHTML = "";
      const thanks = document.createElement("div");
      thanks.className = "csat-thanks";
      thanks.textContent = "Değerlendirmeniz için teşekkür ederiz!";
      container.appendChild(thanks);
    });

    starsDiv.appendChild(star);
  }

  starsDiv.addEventListener("mouseleave", () => {
    starsDiv.querySelectorAll(".csat-star").forEach((s) => s.classList.remove("active"));
  });

  container.appendChild(starsDiv);
  chatMessages.appendChild(container);
  scrollToBottom();
}

async function submitCSATRating(ticketId, rating) {
  try {
    await fetch(`api/tickets/${encodeURIComponent(ticketId)}/rating`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Bypass-Tunnel-Reminder": "true" },
      body: JSON.stringify({ rating })
    });
  } catch (_e) {
    // CSAT gonderimi basarisiz olsa da akisi durdurma
  }
}

/* ---- File Attach UI (3.4) ---- */

function initFileAttach() {
  attachBtn.addEventListener("click", () => {
    fileInput.click();
  });

  fileInput.addEventListener("change", () => {
    if (fileInput.files && fileInput.files.length > 0) {
      const file = fileInput.files[0];
      pushMessage("user", `[Dosya: ${file.name}]`, false);
      pushMessage("assistant", "Dosya yükleme özelliği yakın zamanda aktif olacaktır. Şimdilik sorununuzu metin olarak iletebilirsiniz.", false);
      fileInput.value = "";
    }
  });
}

/* ---- Conversation Export (4.1) ---- */

function exportConversation() {
  if (!messages.length) return;

  const lines = [];
  lines.push("QRAGY Teknik Destek - Sohbet Gecmisi");
  lines.push("Tarih: " + new Date().toLocaleString("tr-TR"));
  lines.push("=".repeat(40));
  lines.push("");

  for (const msg of messages) {
    const label = msg.role === "user" ? "Siz" : "Destek";
    lines.push(`[${label}] ${msg.content}`);
    lines.push("");
  }

  const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `qragy-destek-${new Date().toISOString().slice(0, 10)}.txt`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/* ---- End Session ---- */

function endSession() {
  if (!messages.length) return;

  const existing = document.getElementById("endSessionOverlay");
  if (existing) { existing.remove(); return; }

  const overlay = document.createElement("div");
  overlay.id = "endSessionOverlay";
  overlay.className = "end-session-overlay";

  const card = document.createElement("div");
  card.className = "end-session-card";

  const msg = document.createElement("p");
  msg.className = "end-session-text";
  msg.textContent = "Sohbeti sonlandırmak istediğinize emin misiniz?";

  const actions = document.createElement("div");
  actions.className = "end-session-actions";

  const cancelBtn = document.createElement("button");
  cancelBtn.className = "end-session-cancel";
  cancelBtn.type = "button";
  cancelBtn.textContent = "Vazgeç";
  cancelBtn.addEventListener("click", () => overlay.remove());

  const confirmBtn = document.createElement("button");
  confirmBtn.className = "end-session-confirm";
  confirmBtn.type = "button";
  confirmBtn.textContent = "Sonlandır";
  confirmBtn.addEventListener("click", () => {
    overlay.remove();
    performEndSession();
  });

  actions.appendChild(cancelBtn);
  actions.appendChild(confirmBtn);
  card.appendChild(msg);
  card.appendChild(actions);
  overlay.appendChild(card);
  aiWidget.appendChild(overlay);
}

function performEndSession() {
  messages.length = 0;
  clearSession();
  chatMessages.innerHTML = "";
  clearQuickReplies();
  clearComposeStatus();
  clearHandoffStatus();
  setHandoffActionVisible(false);

  state.widgetStarted = false;
  state.sessionLoaded = false;
  state.lastMessageTime = 0;
  state.nudgeShown = false;
  state.lastHandoffPayload = null;
  state.handedOffTickets.clear();
  state.lastSystemStatus = "";
  state.pendingUserSegments = [];

  if (state.flushTimer) {
    clearTimeout(state.flushTimer);
    state.flushTimer = null;
  }
  if (state.nudgeTimer) {
    clearTimeout(state.nudgeTimer);
    state.nudgeTimer = null;
  }

  hideWidget();
}

/* ---- Send Pulse (2.4) ---- */

function triggerSendPulse() {
  sendButton.classList.add("pulse");
  sendButton.addEventListener("animationend", () => {
    sendButton.classList.remove("pulse");
  }, { once: true });
}

/* ---- Offline Queue (4.4) ---- */

function queueOfflineMessage(content) {
  state.offlineQueue.push(content);
}

async function flushOfflineQueue() {
  if (!state.offlineQueue.length) return;
  const queued = [...state.offlineQueue];
  state.offlineQueue = [];

  for (const content of queued) {
    queueUserSegment(content);
  }
}

/* ---- Widget animation ---- */

function showWidget() {
  if (isEmbedMode) {
    aiWidget.hidden = false;
    aiWidget.classList.add("is-visible");
  } else {
    state.triggerElement = document.activeElement;
    aiWidget.hidden = false;
    fabLauncher.hidden = true;
    aiWidget.classList.add("is-opening");
    void aiWidget.offsetHeight;
    aiWidget.classList.remove("is-opening");
    aiWidget.classList.add("is-visible");
  }

  if (!state.widgetStarted && chatMessages.childElementCount === 0) {
    // Oturumu yuklemeyi dene
    const sessionRestored = loadSession();

    if (sessionRestored) {
      // Oturum basariyla yuklendi, mevcut mesajlar gosterildi
      removeSkeleton();
    } else {
      // Ilk acilis: direkt sohbeti baslat (welcome screen yok)
      state.widgetStarted = true;
      // persist=false: sadece UI'da gosterilir, backend'e gitmez (cift karsilama onlenir)
      pushMessage(
        "assistant",
        "Merhaba, Teknik Destek hattina hos geldiniz. Talep olusturmamiz icin firma adi (opsiyonel), sube kodu ve sorununuzu paylasir misiniz?",
        false
      );
    }
  } else if (!state.widgetStarted) {
    state.widgetStarted = true;
  }

  chatInput.focus();
  resetNudgeTimer();
}

function hideWidget() {
  if (isEmbedMode) {
    return;
  }

  aiWidget.classList.remove("is-visible");
  aiWidget.classList.add("is-closing");

  const cleanup = () => {
    aiWidget.classList.remove("is-closing");
    aiWidget.hidden = true;
    fabLauncher.hidden = false;
    if (state.triggerElement && typeof state.triggerElement.focus === "function") {
      state.triggerElement.focus();
      state.triggerElement = null;
    }
  };

  const onEnd = (event) => {
    if (event.target !== aiWidget) return;
    clearTimeout(fallback);
    aiWidget.removeEventListener("transitionend", onEnd);
    cleanup();
  };

  aiWidget.addEventListener("transitionend", onEnd);
  const fallback = setTimeout(() => {
    aiWidget.removeEventListener("transitionend", onEnd);
    cleanup();
  }, 400);
}

function closeWidgetAfterHandoff(delayMs = 700) {
  window.setTimeout(() => {
    hideWidget();
  }, delayMs);
}

/* ---- Focus trap ---- */

function handleFocusTrap(event) {
  if (event.key !== "Tab" || aiWidget.hidden) return;

  const focusable = aiWidget.querySelectorAll(
    'button:not([disabled]):not([hidden]), input:not([disabled]):not([hidden]), [tabindex]:not([tabindex="-1"])'
  );
  if (focusable.length === 0) return;

  const first = focusable[0];
  const last = focusable[focusable.length - 1];

  if (event.shiftKey) {
    if (document.activeElement === first) {
      event.preventDefault();
      last.focus();
    }
  } else {
    if (document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }
}

/* ---- Header status ---- */

function updateHeaderStatus(isOpen) {
  if (!statusDot || !statusText) return;

  if (isOpen) {
    statusDot.classList.remove("offline");
    statusText.textContent = "Aktif";
  } else {
    statusDot.classList.add("offline");
    statusText.textContent = "Mesai dışı";
  }
}

/* ---- Loading & compose status ---- */

function setLoadingState(isLoading) {
  state.isSending = isLoading;
  sendButton.textContent = isLoading ? "İşleniyor" : "Gönder";
}

function setComposeStatus(message) {
  composeStatus.hidden = false;
  composeStatus.textContent = message;
}

function clearComposeStatus() {
  composeStatus.hidden = true;
  composeStatus.textContent = "";
}

function setHandoffStatus(message, isError = false) {
  handoffStatus.hidden = false;
  handoffStatus.classList.toggle("is-error", isError);
  handoffStatus.textContent = message;

  if (state.lastSystemStatus !== message) {
    pushMessage("assistant", `[Sistem] ${message}`, false);
    state.lastSystemStatus = message;
  }
}

function clearHandoffStatus() {
  handoffStatus.hidden = true;
  handoffStatus.classList.remove("is-error");
  handoffStatus.textContent = "";
  state.lastSystemStatus = "";
}

function setHandoffActionVisible(visible) {
  handoffActions.hidden = !visible;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

/* ---- Handoff helpers ---- */

function postHandoffToParent(summary, tags, memory) {
  if (window.parent === window) {
    return false;
  }

  try {
    window.parent.postMessage(
      {
        type: "QRAGY_HANDOFF",
        source: "qragy-ai-widget",
        summary,
        tags: Array.isArray(tags) ? tags : [],
        memory: memory || {}
      },
      "*"
    );
    return true;
  } catch (_error) {
    return false;
  }
}

function findExistingSupportButton() {
  const knownClassButton = document.querySelector("button[class*='supportButton']");
  if (knownClassButton) {
    return knownClassButton;
  }

  const buttons = Array.from(document.querySelectorAll("button, [role='button']"));
  return (
    buttons.find((button) => {
      if (button.id === "launchSupportButton" || button.id === "manualHandoffButton") {
        return false;
      }

      return normalizeText(button.textContent).includes("canli destek");
    }) || null
  );
}

async function clickExistingSupportButton() {
  const button = findExistingSupportButton();
  if (!button) {
    return false;
  }

  button.click();
  await sleep(500);
  return true;
}

async function loadRuntimeConfig() {
  try {
    const response = await fetch("api/config", { headers: { "Bypass-Tunnel-Reminder": "true" } });
    if (!response.ok) return;

    const payload = await response.json();
    if (payload?.zendesk) {
      state.runtimeConfig.zendesk = {
        enabled: Boolean(payload.zendesk.enabled),
        snippetKey: payload.zendesk.snippetKey || "",
        defaultTags: Array.isArray(payload.zendesk.defaultTags)
          ? payload.zendesk.defaultTags.filter(Boolean)
          : ["qragy", "ai_handoff"]
      };
    }

    if (payload?.support) {
      const support = payload.support;
      state.runtimeConfig.support = {
        enabled: Boolean(support.enabled),
        isOpen: support.isOpen !== false,
        timezone: support.timezone || "Europe/Istanbul",
        openHour: Number.isFinite(support.openHour) ? support.openHour : 8,
        closeHour: Number.isFinite(support.closeHour) ? support.closeHour : 23,
        openDays: Array.isArray(support.openDays) && support.openDays.length
          ? support.openDays
          : [1, 2, 3, 4, 5, 6, 7]
      };

      updateHeaderStatus(state.runtimeConfig.support.isOpen);
    }
  } catch (_error) {
    // AI katmani tek basina da calissin.
  }
}

/* ---- Zendesk integration ---- */

async function ensureZendeskWidget() {
  if (typeof window.zE === "function") {
    return true;
  }

  const zendeskConfig = state.runtimeConfig.zendesk;
  if (!zendeskConfig.enabled || !zendeskConfig.snippetKey) {
    return false;
  }

  if (!state.zendeskLoadPromise) {
    state.zendeskLoadPromise = new Promise((resolve, reject) => {
      window.zESettings = window.zESettings || {};

      const existing = document.getElementById("ze-snippet");
      if (existing) {
        existing.addEventListener("load", () => resolve(), { once: true });
        existing.addEventListener("error", () => reject(new Error("Zendesk snippet yüklenemedi.")), {
          once: true
        });
        return;
      }

      const script = document.createElement("script");
      script.id = "ze-snippet";
      script.src =
        "https://static.zdassets.com/ekr/snippet.js?key=" +
        encodeURIComponent(zendeskConfig.snippetKey);
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("Zendesk snippet yüklenemedi."));
      document.head.appendChild(script);
    });
  }

  try {
    await state.zendeskLoadPromise;
    await sleep(300);
    return typeof window.zE === "function";
  } catch (_error) {
    return false;
  }
}

async function waitForZendeskReady(timeoutMs = 10000) {
  const loaded = await ensureZendeskWidget();
  if (!loaded || typeof window.zE !== "function") {
    return false;
  }

  return new Promise((resolve) => {
    let completed = false;
    const finish = (value) => {
      if (completed) return;
      completed = true;
      resolve(value);
    };

    const timer = window.setTimeout(() => finish(false), timeoutMs);
    try {
      window.zE(() => {
        window.clearTimeout(timer);
        finish(true);
      });
    } catch (_error) {
      window.clearTimeout(timer);
      finish(false);
    }
  });
}

async function openZendeskUi() {
  try {
    window.zE("webWidget", "show");
    window.zE("webWidget", "open");
    return true;
  } catch (_error) {
    // continue
  }

  try {
    window.zE("messenger", "open");
    return true;
  } catch (_error) {
    // continue
  }

  return clickExistingSupportButton();
}

async function pushSummaryToZendesk(summary, tags) {
  const attemptSend = () => {
    try {
      window.zE("webWidget", "chat:addTags", tags);
    } catch (_error) {
      // ignore
    }

    try {
      window.zE("webWidget", "chat:send", summary);
      return true;
    } catch (_error) {
      return false;
    }
  };

  if (attemptSend()) return true;
  await sleep(900);
  if (attemptSend()) return true;
  await sleep(1200);
  return attemptSend();
}

function buildZendeskSummary(memory, payload) {
  const now = new Date().toLocaleString("tr-TR");
  const lines = [
    "AI Destek Katmanı - Yeni Talep",
    `Tarih: ${now}`
  ];

  if (payload?.conversationContext?.currentTopic) {
    lines.push(`Konu: ${payload.conversationContext.currentTopic}`);
  }

  if (payload?.handoffReason) {
    lines.push(`Aktarım sebebi: ${payload.handoffReason}`);
  }

  lines.push(`Şube kodu: ${memory.branchCode || "-"}`);
  lines.push(`Sorun özeti: ${memory.issueSummary || "-"}`);
  lines.push(`Firma: ${memory.companyName || "-"}`);
  lines.push(`Ad Soyad: ${memory.fullName || "-"}`);
  lines.push(`Telefon: ${memory.phone || "-"}`);

  return lines.join("\n");
}

async function reportHandoffResult(ticketId, status, detail, meta = {}) {
  const id = String(ticketId || "").trim();
  if (!id) {
    return;
  }

  try {
    await fetch(`api/tickets/${encodeURIComponent(id)}/handoff`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Bypass-Tunnel-Reminder": "true" },
      body: JSON.stringify({
        status,
        detail,
        meta
      })
    });
  } catch (_error) {
    // Raporlama basarisiz olsa bile kullanici akisina engel olmayalim.
  }
}

async function handoffToZendesk(payload) {
  // Handoff basladiysa nudge'i durdur
  state.nudgeShown = true;
  if (state.nudgeTimer) {
    clearTimeout(state.nudgeTimer);
    state.nudgeTimer = null;
  }

  if (state.runtimeConfigLoadPromise) {
    await state.runtimeConfigLoadPromise;
  }

  const zendeskConfig = state.runtimeConfig.zendesk;
  const memory = payload?.memory || {};
  const ticketId = String(payload?.ticketId || "").trim();
  const topicId = payload?.conversationContext?.currentTopic || "";
  const ticketKey = `${memory.branchCode || topicId}|${memory.issueSummary || payload?.handoffReason || ""}`.trim();

  if (!zendeskConfig.enabled || !zendeskConfig.snippetKey) {
    const summary = buildZendeskSummary(memory, payload);
    const tags = ["qragy", "ai_handoff"];

    if (ticketId) {
      state.handedOffTickets.add(ticketKey);
      setHandoffStatus("Talebiniz kayda alındı. Temsilci en kısa sürede sizinle iletişime geçecektir.");
      await reportHandoffResult(ticketId, "success", "Zendesk devre disi, ticket kaydedildi.");
      showCSATSurvey(ticketId);
    } else {
      setHandoffStatus("Talebiniz temsilciye iletildi.");
    }

    // Embed modda parent sayfaya Zendesk handoff + widget kapat mesaji gonder
    if (isEmbedMode) {
      postHandoffToParent(summary, tags, memory);
      setTimeout(() => {
        try { window.parent.postMessage({ type: "QRAGY_CLOSE", source: "qragy-ai-widget" }, "*"); } catch (_e) {}
      }, 2500);
    } else {
      // Standalone modda: sayfadaki Canli Destek butonunu tikla
      await clickExistingSupportButton();
      closeWidgetAfterHandoff(2000);
    }
    return;
  }

  const tags =
    state.runtimeConfig.zendesk.defaultTags && state.runtimeConfig.zendesk.defaultTags.length
      ? state.runtimeConfig.zendesk.defaultTags
      : ["qragy", "ai_handoff"];
  const summary = buildZendeskSummary(memory, payload);

  if (!ticketKey || ticketKey === "|") {
    setHandoffStatus("Temsilciye aktarım için talep bilgisi eksik.", true);
    return;
  }

  if (state.handedOffTickets.has(ticketKey)) {
    const reopened = await openZendeskUi();
    if (reopened) {
      setHandoffStatus("Canlı destek penceresi tekrar açıldı.");
      await reportHandoffResult(ticketId, "success", "Zendesk penceresi tekrar acildi.");
      closeWidgetAfterHandoff();
      return;
    }

    const posted = postHandoffToParent(summary, tags, memory);
    if (posted) {
      setHandoffStatus("Talep bilgisi sayfaya iletildi. Canlı destek açılıyor.");
      await reportHandoffResult(ticketId, "parent_posted", "Handoff bilgisi parent sayfaya iletildi.");
      closeWidgetAfterHandoff();
    } else {
      setHandoffStatus("Canlı destek penceresi tekrar açılamadı.", true);
      await reportHandoffResult(ticketId, "failed", "Canli destek penceresi tekrar acilamadi.");
    }
    return;
  }

  if (state.handoffInFlight.has(ticketKey)) {
    return;
  }

  state.handoffInFlight.add(ticketKey);
  manualHandoffButton.disabled = true;
  setHandoffActionVisible(false);
  setHandoffStatus("Talebiniz temsilciye aktarılıyor...");

  try {
    if (typeof window.zE !== "function") {
      await clickExistingSupportButton();
      await sleep(350);
    }

    let zendeskReady = await waitForZendeskReady(12000);

    if (!zendeskReady) {
      const clicked = await clickExistingSupportButton();
      if (clicked) {
        zendeskReady = await waitForZendeskReady(8000);
      }
    }

    if (!zendeskReady) {
      await sleep(1000);
      const clickedAgain = await clickExistingSupportButton();
      if (clickedAgain) {
        zendeskReady = await waitForZendeskReady(6000);
      }
    }

    if (!zendeskReady) {
      const posted = postHandoffToParent(summary, tags, memory);
      if (posted) {
        state.handedOffTickets.add(ticketKey);
        setHandoffStatus("Talep bilgisi sayfaya iletildi. Canlı destek açılıyor.");
        await reportHandoffResult(ticketId, "parent_posted", "Zendesk hazir degildi, parent handoff kullanildi.");
        closeWidgetAfterHandoff();
        return;
      }

      setHandoffStatus(
        "Zendesk hazır değil. Alan adının Zendesk Trusted Domains listesinde olduğunu kontrol edin.",
        true
      );
      await reportHandoffResult(ticketId, "failed", "Zendesk hazir degil (trusted domain/snippet kontrolu).");
      setHandoffActionVisible(true);
      return;
    }

    const uiOpened = await openZendeskUi();
    if (!uiOpened) {
      const posted = postHandoffToParent(summary, tags, memory);
      if (posted) {
        state.handedOffTickets.add(ticketKey);
        setHandoffStatus("Talep bilgisi sayfaya iletildi. Canlı destek açılıyor.");
        await reportHandoffResult(ticketId, "parent_posted", "Zendesk UI acilamadi, parent handoff kullanildi.");
        closeWidgetAfterHandoff();
        return;
      }

      setHandoffStatus(
        "Zendesk penceresi acilamadi. Canli Destek butonu veya widget ayarini kontrol edin.",
        true
      );
      await reportHandoffResult(ticketId, "failed", "Zendesk penceresi acilamadi.");
      setHandoffActionVisible(true);
      return;
    }

    await sleep(600);
    const summarySent = await pushSummaryToZendesk(summary, tags);
    if (summarySent) {
      state.handedOffTickets.add(ticketKey);
      setHandoffStatus("Talebiniz temsilciye aktarıldı. Canlı destek penceresi açıldı.");
      await reportHandoffResult(ticketId, "success", "Zendesk chat ozeti gonderildi.");
      if (ticketId) showCSATSurvey(ticketId);
      closeWidgetAfterHandoff();
      return;
    }

    const posted = postHandoffToParent(summary, tags, memory);
    if (posted) {
      state.handedOffTickets.add(ticketKey);
      setHandoffStatus("Özet bilgisi sayfaya iletildi. Canlı destek açılıyor.");
      await reportHandoffResult(ticketId, "parent_posted", "Zendesk acildi ancak ozet parenta iletildi.");
      closeWidgetAfterHandoff();
      return;
    }

    setHandoffActionVisible(true);
    setHandoffStatus(
      "Zendesk açıldı ancak özet otomatik gönderilemedi. Lütfen temsilciye sorunu kısaca yazın.",
      true
    );
    await reportHandoffResult(ticketId, "opened_no_summary", "Zendesk acildi fakat ozet gonderilemedi.");
  } catch (_error) {
    setHandoffStatus("Zendesk aktarımında beklenmeyen bir hata oluştu. Lütfen tekrar deneyin.", true);
    await reportHandoffResult(ticketId, "failed", "Zendesk aktariminda beklenmeyen hata.");
    setHandoffActionVisible(true);
  } finally {
    manualHandoffButton.disabled = false;
    state.handoffInFlight.delete(ticketKey);
  }
}

/* ---- Backend communication ---- */

async function sendToBackend() {
  const response = await fetch("api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Bypass-Tunnel-Reminder": "true" },
    body: JSON.stringify({ messages })
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload?.error || "Sunucu hatası.");
  }
  return payload;
}

function scheduleUserFlush() {
  if (state.flushTimer) {
    window.clearTimeout(state.flushTimer);
  }

  setComposeStatus("Yazıyorsunuz...");
  state.flushTimer = window.setTimeout(() => {
    state.flushTimer = null;
    void flushPendingUserSegments();
  }, USER_BUFFER_WINDOW_MS);
}

function queueUserSegment(content) {
  state.pendingUserSegments.push(content);
  scheduleUserFlush();
}

function showTypingIndicator() {
  const bubble = document.createElement("div");
  bubble.className = "message assistant typing-indicator";
  bubble.innerHTML = '<span class="dot"></span><span class="dot"></span><span class="dot"></span>';
  chatMessages.appendChild(bubble);
  scrollToBottom();
  return bubble;
}

function removeTypingIndicator(bubble) {
  if (bubble && bubble.parentNode) {
    bubble.parentNode.removeChild(bubble);
  }
}

/* ---- Update delivery statuses of user messages ---- */

function updateUserMessageStatuses(status) {
  const userBubbles = chatMessages.querySelectorAll(".message.user");
  userBubbles.forEach((bubble) => {
    const statusEl = bubble.querySelector(".msg-status");
    if (statusEl && (statusEl.classList.contains("sending") || statusEl.classList.contains("delivered"))) {
      statusEl.className = `msg-status ${status}`;
    }
  });
}

async function flushPendingUserSegments() {
  if (!state.pendingUserSegments.length) {
    clearComposeStatus();
    return;
  }

  if (state.isSending) {
    state.flushAfterSend = true;
    return;
  }

  if (state.flushTimer) {
    window.clearTimeout(state.flushTimer);
    state.flushTimer = null;
  }

  const combinedUserMessage = state.pendingUserSegments.join("\n");
  state.pendingUserSegments = [];
  clearComposeStatus();
  clearHandoffStatus();
  clearQuickReplies();

  messages.push({ role: "user", content: combinedUserMessage });
  saveSession();

  setLoadingState(true);
  const typingBubble = showTypingIndicator();
  const longWaitTimer = setTimeout(() => {
    setComposeStatus("Yazıyor...");
  }, 3000);

  try {
    const payload = await sendToBackend();
    clearTimeout(longWaitTimer);
    clearComposeStatus();
    removeTypingIndicator(typingBubble);
    hideConnectionBanner();

    // Mark user messages as delivered
    updateUserMessageStatuses("delivered");

    scrollToBottom();
    await sleep(80);
    pushMessage("assistant", payload.reply);
    scrollToBottom();

    // Play notification sound
    playNotificationSound();

    // Render quick replies if present
    if (payload?.quickReplies && Array.isArray(payload.quickReplies) && payload.quickReplies.length) {
      renderQuickReplies(payload.quickReplies);
    }

    // Queue position (4.2)
    if (payload?.queuePosition && payload.queuePosition > 0) {
      const queueEl = document.createElement("div");
      queueEl.className = "queue-position";
      queueEl.textContent = `Sırada ${payload.queuePosition}. sıradasınız`;
      chatMessages.appendChild(queueEl);
      scrollToBottom();
    }

    if (payload?.source === "memory-template" || payload?.handoffReady) {
      state.lastHandoffPayload = payload;

      if (payload?.handoffReady) {
        await handoffToZendesk(payload);
      } else if (payload?.handoffReason === "outside-support-hours") {
        setHandoffActionVisible(false);
        setHandoffStatus(
          payload?.handoffMessage ||
            "Canlı destek şu an mesai dışındadır. Talebiniz kayda alındı."
        );
        if (payload?.ticketId) {
          showCSATSurvey(payload.ticketId);
        }
      }
    }
  } catch (error) {
    clearTimeout(longWaitTimer);
    removeTypingIndicator(typingBubble);

    // Mark user messages as failed
    updateUserMessageStatuses("failed");

    if (!navigator.onLine) {
      showConnectionBanner();
      queueOfflineMessage(combinedUserMessage);
      // Mesajlar array'inden cikart (tekrar gonderilecek)
      if (messages.length && messages[messages.length - 1].content === combinedUserMessage) {
        messages.pop();
        saveSession();
      }
    } else {
      showConnectionBanner();
      pushMessage("assistant", `İşlem sırasında hata oluştu: ${error.message}`);
    }
  } finally {
    clearTimeout(longWaitTimer);
    clearComposeStatus();
    setLoadingState(false);

    if (state.flushAfterSend) {
      state.flushAfterSend = false;
      void flushPendingUserSegments();
    }
  }
}

/* ---- Message Virtualization (4.5) ---- */

function maybeVirtualizeMessages() {
  const allMessages = chatMessages.querySelectorAll(".message:not(.typing-indicator)");
  if (allMessages.length < 100) return;

  // Sadece gorunmeyen mesajlari gizle (basit yaklasin)
  const chatRect = chatMessages.getBoundingClientRect();

  allMessages.forEach((msg, idx) => {
    // Son 20 mesaj her zaman gorunur
    if (idx >= allMessages.length - 20) {
      msg.style.display = "";
      return;
    }

    const rect = msg.getBoundingClientRect();
    if (rect.bottom < chatRect.top - 200 || rect.top > chatRect.bottom + 200) {
      msg.style.display = "none";
    } else {
      msg.style.display = "";
    }
  });
}

// Virtualization sadece buyuk konusmalarda aktif
let virtTimer = null;
chatMessages.addEventListener("scroll", () => {
  if (virtTimer) return;
  virtTimer = setTimeout(() => {
    virtTimer = null;
    maybeVirtualizeMessages();
  }, 300);
});

/* ---- Push Notifications (4.3) ---- */

async function initPushNotifications() {
  if (!("serviceWorker" in navigator) || !("Notification" in window)) return;

  try {
    const reg = await navigator.serviceWorker.register("sw.js");

    if (Notification.permission === "default") {
      // Izin isteme: kullanici bir mesaj gonderdikten sonra
      // (ilk acilista spam yapma)
    }
  } catch (_e) {
    // SW desteklenmiyor veya kayit basarisiz
  }
}

async function requestNotificationPermission() {
  if (!("Notification" in window)) return;
  if (Notification.permission === "default") {
    await Notification.requestPermission();
  }
}

function showBrowserNotification(title, body) {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  if (document.hasFocus()) return;

  try {
    new Notification(title, { body, icon: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'><circle cx='12' cy='12' r='10' fill='%23D23B38'/></svg>" });
  } catch (_e) {
    // ignore
  }
}

/* ---- Event listeners ---- */

chatForm.addEventListener("submit", (event) => {
  event.preventDefault();

  const content = chatInput.value.trim();
  if (!content) return;

  triggerSendPulse();
  pushMessage("user", content, false);
  chatInput.value = "";

  // Offline ise queue'ya ekle
  if (!navigator.onLine) {
    showConnectionBanner();
    queueOfflineMessage(content);
  } else {
    queueUserSegment(content);
  }

  clearComposeStatus();
  chatInput.focus();
  resetNudgeTimer();

  // Ilk mesajda bildirim izni iste
  requestNotificationPermission();
});

chatInput.addEventListener("input", () => {
  if (state.flushTimer && chatInput.value.trim().length > 0) {
    scheduleUserFlush();
  }
  resetNudgeTimer();
});

launchSupportButton.addEventListener("click", () => {
  showWidget();
});

fabLauncher.addEventListener("click", () => {
  showWidget();
});

closeWidgetButton.addEventListener("click", () => {
  hideWidget();
});

manualHandoffButton.addEventListener("click", async () => {
  if (!state.lastHandoffPayload) {
    setHandoffStatus("Aktarım için hazır bir talep bulunamadı.", true);
    return;
  }

  await handoffToZendesk(state.lastHandoffPayload);
});

exportBtn.addEventListener("click", () => {
  exportConversation();
});

endSessionBtn.addEventListener("click", () => {
  endSession();
});

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !aiWidget.hidden) {
    hideWidget();
  }

  handleFocusTrap(event);
});

/* ---- Init ---- */

initDarkMode();
initSoundToggle();
initFileAttach();
initPushNotifications();

state.runtimeConfigLoadPromise = loadRuntimeConfig();

// Embed modda olmayan sayfalarda FAB'i goster
if (!isEmbedMode) {
  fabLauncher.hidden = false;
}

if (isEmbedMode) {
  document.body.classList.add("embed-mode");
  if (pageShell) {
    pageShell.hidden = true;
  }
  showWidget();
}

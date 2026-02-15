/**
 * Qragy AI Destek Katmani - Embed Script v3
 *
 * Herhangi bir sayfada console'dan veya <script> ile yuklenebilir.
 * Widget'i iframe icinde acar, tum ozellikler (dark mode, CSAT, vb.) calisir.
 * Handoff durumunda parent sayfadaki Zendesk'e (Zopim + zE + buton) aktarim yapar.
 *
 * Kullanim:
 *   <script src="https://SUNUCU/embed.js"></script>
 *   veya console'da:
 *   window.__QRAGY_API = "https://SUNUCU"; fetch(window.__QRAGY_API+"/embed.js").then(r=>r.text()).then(eval)
 */
(function () {
  "use strict";

  var WIDGET_ID = "qragy-ai-embed";
  var IFRAME_ID = "qragy-ai-iframe";

  // API_BASE: script src'den otomatik tespit, yoksa __CORPCX_API
  var API_BASE = (function () {
    try {
      var scripts = document.querySelectorAll("script[src*='embed.js']");
      for (var i = 0; i < scripts.length; i++) {
        var src = scripts[i].src;
        if (src && src.indexOf("embed.js") !== -1) {
          return src.replace(/\/embed\.js.*$/, "");
        }
      }
    } catch (_e) { /* ignore */ }
    return window.__QRAGY_API || window.__CORPCX_API || "";
  })();

  if (!API_BASE) {
    console.error("[Qragy] API_BASE belirlenemedi. Lutfen window.__QRAGY_API ayarlayin.");
    return;
  }

  // Zaten yukluyse tekrar yukleme
  if (document.getElementById(WIDGET_ID)) {
    var old = document.getElementById(WIDGET_ID);
    old.parentNode.removeChild(old);
  }
  var oldToggle = document.getElementById(WIDGET_ID + "-toggle");
  if (oldToggle) oldToggle.parentNode.removeChild(oldToggle);

  // ---- CSS ----
  var css = [
    "#" + WIDGET_ID + "{position:fixed;bottom:20px;right:20px;width:min(420px,calc(100% - 24px));height:min(680px,calc(100dvh - 36px));border-radius:16px;box-shadow:0 20px 48px rgba(37,99,235,0.16);z-index:999999;overflow:hidden;display:none;border:1px solid #dbeafe}",
    "#" + WIDGET_ID + " iframe{width:100%;height:100%;border:none;border-radius:16px}",
    "#" + WIDGET_ID + "-toggle{position:fixed;bottom:20px;right:20px;width:56px;height:56px;border-radius:50%;background:linear-gradient(140deg,#3B82F6,#2563EB);color:#fff;border:none;cursor:pointer;box-shadow:0 4px 16px rgba(37,99,235,0.35);z-index:999998;display:flex;align-items:center;justify-content:center;transition:transform 200ms}",
    "#" + WIDGET_ID + "-toggle:hover{transform:scale(1.08)}",
    "#" + WIDGET_ID + "-toggle svg{width:26px;height:26px;fill:#fff}",
    "@media(max-width:780px){#" + WIDGET_ID + "{right:0;bottom:0;width:100%;height:100dvh;border-radius:0;border:0}}"
  ].join("\n");

  var styleEl = document.createElement("style");
  styleEl.textContent = css;
  document.head.appendChild(styleEl);

  // ---- WIDGET CONTAINER + IFRAME ----
  var widget = document.createElement("div");
  widget.id = WIDGET_ID;

  var iframe = document.createElement("iframe");
  iframe.id = IFRAME_ID;
  iframe.src = API_BASE + "?embed=1";
  iframe.setAttribute("allow", "microphone; notifications");
  iframe.setAttribute("title", "QRAGY Teknik Destek");
  widget.appendChild(iframe);
  document.body.appendChild(widget);

  // ---- TOGGLE BUTTON ----
  var toggleBtn = document.createElement("button");
  toggleBtn.id = WIDGET_ID + "-toggle";
  toggleBtn.innerHTML = '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H5.2L4 17.2V4h16v12z"/></svg>';
  toggleBtn.setAttribute("aria-label", "Sohbet ac");
  document.body.appendChild(toggleBtn);

  // ---- SHOW / HIDE ----
  function showWidget() {
    widget.style.display = "block";
    toggleBtn.style.display = "none";
  }

  function hideWidget() {
    widget.style.display = "none";
    toggleBtn.style.display = "flex";
  }

  toggleBtn.addEventListener("click", showWidget);

  // ESC ile kapat
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && widget.style.display !== "none") {
      hideWidget();
    }
  });

  // ---- Zendesk / Zopim Acma ----
  function openZendeskOnParent() {
    var opened = false;

    // 1) Sayfadaki "Canli Destek" butonunu tikla (en guvenilir yontem)
    try {
      var supportBtn = document.querySelector("button[class*='supportButton']");
      if (!supportBtn) {
        // Metin icerigine gore ara
        var allBtns = document.querySelectorAll("button, [role='button']");
        for (var i = 0; i < allBtns.length; i++) {
          var txt = (allBtns[i].textContent || "").toLowerCase().replace(/[\u015f\u015e]/g, "s").replace(/[\u0131\u0130]/g, "i");
          if (txt.indexOf("canli destek") !== -1) {
            supportBtn = allBtns[i];
            break;
          }
        }
      }
      if (supportBtn) {
        supportBtn.click();
        opened = true;
        console.log("[Qragy] Canli Destek butonu tiklandi.");
      }
    } catch (_e) { /* ignore */ }

    // 2) Zopim (eski Zendesk Chat) API
    if (!opened) {
      try {
        if (window.$zopim && window.$zopim.livechat) {
          window.$zopim.livechat.window.show();
          opened = true;
          console.log("[Qragy] $zopim.livechat acildi.");
        }
      } catch (_e) { /* ignore */ }
    }

    // 3) Zendesk Web Widget (Classic) API
    if (!opened) {
      try {
        if (typeof window.zE === "function") {
          try { window.zE("webWidget", "show"); } catch (_e) { /* ignore */ }
          try { window.zE("webWidget", "open"); } catch (_e) {
            try { window.zE("messenger", "open"); } catch (_e2) { /* ignore */ }
          }
          opened = true;
          console.log("[Qragy] Zendesk zE widget acildi.");
        }
      } catch (_e) { /* ignore */ }
    }

    return opened;
  }

  // ---- POSTMESSAGE: iframe -> parent ----
  window.addEventListener("message", function (event) {
    var data = event.data;
    if (!data || (data.source !== "qragy-ai-widget" && data.source !== "corpcx-ai-widget")) return;

    // Handoff: Zendesk'e aktar + widget kapat
    if (data.type === "QRAGY_HANDOFF" || data.type === "CORPCX_HANDOFF") {
      console.log("[Qragy] Handoff alindi, Zendesk aciliyor...", data);

      var summary = data.summary || "";
      var tags = Array.isArray(data.tags) ? data.tags : ["qragy", "ai_handoff"];

      var opened = openZendeskOnParent();

      if (opened) {
        // Zendesk acildiysa ozet gondermeyi dene
        setTimeout(function () {
          try {
            if (typeof window.zE === "function") {
              try { window.zE("webWidget", "chat:addTags", tags); } catch (_e) { /* ignore */ }
              try { window.zE("webWidget", "chat:send", summary); } catch (_e) { /* ignore */ }
            }
          } catch (_e) { /* ignore */ }
          console.log("[Qragy] Zendesk handoff tamamlandi.");
        }, 1000);
      } else {
        console.warn("[Qragy] Zendesk acilamadi. Talep kayda alindi, temsilci donecek.");
      }

      // Widget'i kapat
      setTimeout(hideWidget, 2000);
      return;
    }

    // Widget kapat mesaji
    if (data.type === "QRAGY_CLOSE" || data.type === "CORPCX_CLOSE") {
      console.log("[Qragy] Widget kapatma mesaji alindi.");
      setTimeout(hideWidget, 500);
      return;
    }
  });

  console.log("[Qragy] AI Destek Katmani v3 yuklendi. API: " + API_BASE);
})();

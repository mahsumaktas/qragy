"use strict";

// ── State ──
var currentStep = 1;
var TOTAL_STEPS = 4;

var STEP_NAMES = {
  1: "Sirket Bilgileri",
  2: "Gorunum Ayarlari",
  3: "Sikca Sorulan Sorular",
  4: "Onizleme",
};

// ── DOM Helpers ──
function $(id) { return document.getElementById(id); }

function showToast(msg, durationMs) {
  var duration = durationMs || 3000;
  var el = $("toast");
  el.textContent = msg;
  el.classList.add("show");
  setTimeout(function () { el.classList.remove("show"); }, duration);
}

// ── Step Navigation ──
function updateUI() {
  // Update step cards
  for (var i = 1; i <= TOTAL_STEPS; i++) {
    var card = $("step" + i);
    if (card) card.classList.toggle("active", i === currentStep);
  }

  // Update progress bar
  var steps = document.querySelectorAll(".progress-step");
  steps.forEach(function (el) {
    var stepNum = parseInt(el.getAttribute("data-step"), 10);
    el.classList.toggle("active", stepNum <= currentStep);
  });

  // Update labels
  $("stepIndicator").textContent = "Adim " + currentStep + "/" + TOTAL_STEPS;
  $("stepName").textContent = STEP_NAMES[currentStep] || "";

  // If preview step, render preview
  if (currentStep === TOTAL_STEPS) {
    renderPreview();
  }
}

function nextStep() {
  // Validate current step
  if (currentStep === 1) {
    var name = $("companyName").value.trim();
    if (!name) {
      $("companyName").classList.add("field-error");
      $("companyNameError").classList.add("show");
      $("companyName").focus();
      return;
    }
    $("companyName").classList.remove("field-error");
    $("companyNameError").classList.remove("show");
  }

  if (currentStep < TOTAL_STEPS) {
    currentStep++;
    updateUI();
  }
}

function prevStep() {
  if (currentStep > 1) {
    currentStep--;
    updateUI();
  }
}

// ── Preview ──
function renderPreview() {
  var companyName = $("companyName").value.trim() || "Sirket";
  var logoUrl = $("logoUrl").value.trim();
  var themeColor = $("themeColor").value;

  // Logo
  var logoEl = $("previewLogo");
  // Clear children
  while (logoEl.firstChild) logoEl.removeChild(logoEl.firstChild);

  if (logoUrl) {
    var img = document.createElement("img");
    img.src = logoUrl;
    img.alt = "Logo";
    logoEl.appendChild(img);
    logoEl.style.background = "transparent";
  } else {
    logoEl.textContent = companyName.charAt(0).toUpperCase();
    logoEl.style.background = themeColor;
  }

  // Title
  $("previewTitle").textContent = companyName + " Destek";

  // Welcome message
  $("previewWelcome").textContent =
    "Merhaba, " + companyName + " Destek hattina hos geldiniz. Size nasil yardimci olabilirim?";

  // Theme bar
  $("previewThemeBar").style.background = themeColor;

  // FAQs
  var faqs = collectFaqs();
  var faqSection = $("previewFaqSection");
  var faqContainer = $("previewFaqs");

  // Clear FAQ container
  while (faqContainer.firstChild) faqContainer.removeChild(faqContainer.firstChild);

  if (faqs.length > 0) {
    faqSection.style.display = "block";
    faqs.forEach(function (faq) {
      var el = document.createElement("div");
      el.className = "preview-faq";

      var strongQ = document.createElement("strong");
      strongQ.textContent = "S: ";
      el.appendChild(strongQ);

      var qText = document.createTextNode(faq.q);
      el.appendChild(qText);

      el.appendChild(document.createElement("br"));

      var strongA = document.createElement("strong");
      strongA.textContent = "C: ";
      el.appendChild(strongA);

      var aText = document.createTextNode(faq.a);
      el.appendChild(aText);

      faqContainer.appendChild(el);
    });
  } else {
    faqSection.style.display = "none";
  }
}

// ── Data Collection ──
function collectFaqs() {
  var faqs = [];
  for (var i = 1; i <= 3; i++) {
    var q = $("faq" + i + "q").value.trim();
    var a = $("faq" + i + "a").value.trim();
    if (q && a) {
      faqs.push({ q: q, a: a });
    }
  }
  return faqs;
}

// ── Complete Setup ──
function completeSetup() {
  var companyName = $("companyName").value.trim();
  if (!companyName) {
    showToast("Sirket adi zorunludur.");
    return;
  }

  var btn = $("btnComplete");
  btn.disabled = true;
  btn.textContent = "Kaydediliyor...";

  var payload = {
    companyName: companyName,
    sector: $("sector").value,
    logoUrl: $("logoUrl").value.trim() || undefined,
    themeColor: $("themeColor").value,
    faqs: collectFaqs(),
  };

  fetch("api/setup/complete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  })
    .then(function (res) {
      if (!res.ok) {
        return res.json().then(function (data) {
          throw new Error(data.error || "Bir hata olustu.");
        });
      }
      return res.json();
    })
    .then(function () {
      window.location.href = "admin";
    })
    .catch(function (err) {
      btn.disabled = false;
      btn.textContent = "Tamamla";
      showToast(err.message || "Bir hata olustu.");
    });
}

// ── Init ──
// Check if setup already complete, redirect if so
fetch("api/setup/status")
  .then(function (res) { return res.json(); })
  .then(function (data) {
    if (data.setupComplete) {
      window.location.href = "admin";
    }
  })
  .catch(function () { /* ignore, continue with setup */ });

// Clear error on input
$("companyName").addEventListener("input", function () {
  this.classList.remove("field-error");
  $("companyNameError").classList.remove("show");
});

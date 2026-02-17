/* ==========================================================================
   Qragy Admin Panel - Frontend JavaScript
   ========================================================================== */

// ── State ──────────────────────────────────────────────────────────────────
const state = {
  autoRefresh: true,
  autoTimer: null,
  token: localStorage.getItem("qragy_admin_token") || "",
  currentAgentFile: null,
  originalAgentContent: "",
  editingKBId: null,
  editingTopicId: null,
  editingWebhookId: null,
  confirmResolve: null,
  searchDebounceTimer: null,
  currentTicketId: null
};

// ── DOM References ─────────────────────────────────────────────────────────
const $ = (id) => document.getElementById(id);

// Header
const adminTokenInput = $("adminToken");

// Tabs
const tabBtns = document.querySelectorAll(".tab-btn");
const tabContents = document.querySelectorAll(".tab-content");

// Tab 1: Tickets
const searchFilter = $("searchFilter");
const statusFilter = $("statusFilter");
const sourceFilter = $("sourceFilter");
const limitFilter = $("limitFilter");
const refreshButton = $("refreshButton");
const autoButton = $("autoButton");
const summaryGrid = $("summaryGrid");
const ticketsTableBody = $("ticketsTableBody");
const ticketDetail = $("ticketDetail");
const chatHistoryEl = $("chatHistory");

// Tab 2: Knowledge Base
const kbRecordCount = $("kbRecordCount");
const kbTableBody = $("kbTableBody");
const kbAddBtn = $("kbAddBtn");
const kbModal = $("kbModal");
const kbModalTitle = $("kbModalTitle");
const kbModalQuestion = $("kbModalQuestion");
const kbModalAnswer = $("kbModalAnswer");
const kbModalSaveBtn = $("kbModalSaveBtn");
const kbModalCancelBtn = $("kbModalCancelBtn");
const kbReingestBtn = $("kbReingestBtn");
const kbReingestStatus = $("kbReingestStatus");

// Tab 3: Bot Config - Sub-tabs
const subTabBtns = document.querySelectorAll(".sub-tab-btn");
const subTabContents = document.querySelectorAll(".sub-tab-content");

// Agent Editor
const agentFileList = $("agentFileList");
const agentEditorFilename = $("agentEditorFilename");
const agentEditorTextarea = $("agentEditorTextarea");
const agentEditorSaveBtn = $("agentEditorSaveBtn");
const agentEditorRevertBtn = $("agentEditorRevertBtn");

// Topics
const topicsTableBody = $("topicsTableBody");
const topicAddBtn = $("topicAddBtn");
const topicModal = $("topicModal");
const topicModalId = $("topicModalId");
const topicModalTitle = $("topicModalTitle");
const topicModalKeywords = $("topicModalKeywords");
const topicModalRequiresEscalation = $("topicModalRequiresEscalation");
const topicModalCanResolveDirectly = $("topicModalCanResolveDirectly");
const topicModalRequiredInfo = $("topicModalRequiredInfo");
const topicModalContent = $("topicModalContent");
const topicModalSaveBtn = $("topicModalSaveBtn");
const topicModalCancelBtn = $("topicModalCancelBtn");

// Memory
const memoryTicketTemplate = $("memoryTicketTemplate");
const memoryConversationSchema = $("memoryConversationSchema");
const memoryTicketSaveBtn = $("memoryTicketSaveBtn");
const memorySchemaSaveBtn = $("memorySchemaSaveBtn");
const memoryTicketValidation = $("memoryTicketValidation");
const memorySchemaValidation = $("memorySchemaValidation");

// Env
const envForm = $("envForm");
const envSaveBtn = $("envSaveBtn");
const envSaveStatus = $("envSaveStatus");

// System
const sysHealthGrid = $("sysHealthGrid");
const sysAgentStatus = $("sysAgentStatus");
const sysKBStatus = $("sysKBStatus");
const sysReloadBtn = $("sysReloadBtn");
const sysRefreshBtn = $("sysRefreshBtn");

// Common
const toastContainer = $("toastContainer");
const confirmModal = $("confirmModal");
const confirmModalText = $("confirmModalText");
const confirmModalYes = $("confirmModalYes");
const confirmModalNo = $("confirmModalNo");

// ── Utilities ──────────────────────────────────────────────────────────────
function fmtDate(value) {
  if (!value) return "-";
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return value;
  return d.toLocaleString("tr-TR");
}

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return (bytes / Math.pow(1024, i)).toFixed(1) + " " + units[i];
}

function formatUptime(seconds) {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return d + "g " + h + "s " + m + "dk";
  if (h > 0) return h + "s " + m + "dk";
  return m + "dk";
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function showToast(message, type = "info") {
  const toast = document.createElement("div");
  toast.className = "toast toast-" + type;
  const p = document.createElement("p");
  p.textContent = message;
  toast.appendChild(p);
  toastContainer.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateX(100%)";
    toast.style.transition = "all 0.3s ease";
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

function confirmAction(text) {
  return new Promise((resolve) => {
    confirmModalText.textContent = text;
    confirmModal.style.display = "";
    state.confirmResolve = resolve;
  });
}

// ── API Helper ─────────────────────────────────────────────────────────────
async function fetchJson(url, options = {}) {
  const headers = {
    "Content-Type": "application/json",
    "Bypass-Tunnel-Reminder": "true",
    ...(options.headers || {})
  };
  if (state.token) {
    headers["x-admin-token"] = state.token;
  }

  const response = await fetch(url, { ...options, headers });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error || "HTTP " + response.status);
  }
  return payload;
}

async function apiGet(path) {
  return fetchJson("api/" + path);
}

async function apiPost(path, body) {
  return fetchJson("api/" + path, { method: "POST", body: JSON.stringify(body) });
}

async function apiPut(path, body) {
  return fetchJson("api/" + path, { method: "PUT", body: JSON.stringify(body) });
}

async function apiDelete(path) {
  return fetchJson("api/" + path, { method: "DELETE" });
}

// ── Tab Navigation ─────────────────────────────────────────────────────────
function switchTab(tabId) {
  tabBtns.forEach((btn) => btn.classList.toggle("active", btn.dataset.tab === tabId));
  tabContents.forEach((content) => content.classList.toggle("active", content.id === tabId));

  // Load data on tab switch
  if (tabId === "tabTickets") refreshDashboard();
  else if (tabId === "tabKnowledge") loadKnowledgeBase();
  else if (tabId === "tabBotConfig") loadBotConfigTab();
  else if (tabId === "tabAnalytics") loadAnalytics();
  else if (tabId === "tabSystem") loadSystemInfo();
}

function switchSubTab(subTabId) {
  subTabBtns.forEach((btn) => btn.classList.toggle("active", btn.dataset.subtab === subTabId));
  subTabContents.forEach((content) => content.classList.toggle("active", content.id === subTabId));

  if (subTabId === "subContentAgentFiles") loadAgentFiles();
  else if (subTabId === "subContentTopics") loadTopics();
  else if (subTabId === "subContentMemory") loadMemoryFiles();
  else if (subTabId === "subContentEnv") loadEnvConfig();
  else if (subTabId === "subContentChatFlow") loadChatFlowConfig();
  else if (subTabId === "subContentSiteConfig") loadSiteConfig();
  else if (subTabId === "subContentWebhooks") loadWebhooks();
  else if (subTabId === "subContentPromptVersions") loadPromptVersions();
  else if (subTabId === "subContentSunshine") loadSunshineConfig();
}

tabBtns.forEach((btn) => {
  btn.addEventListener("click", () => switchTab(btn.dataset.tab));
});

subTabBtns.forEach((btn) => {
  btn.addEventListener("click", () => switchSubTab(btn.dataset.subtab));
});

// ══════════════════════════════════════════════════════════════════════════
// TAB 1: TICKETS
// ══════════════════════════════════════════════════════════════════════════

function createSummaryCard(label, value) {
  const card = document.createElement("article");
  card.className = "summary-card";
  const labelEl = document.createElement("div");
  labelEl.className = "label";
  labelEl.textContent = label;
  const valueEl = document.createElement("div");
  valueEl.className = "value";
  valueEl.textContent = String(value);
  card.appendChild(labelEl);
  card.appendChild(valueEl);
  return card;
}

function renderSummary(summary) {
  summaryGrid.innerHTML = "";
  const byStatus = summary?.byStatus || {};
  const cards = [
    ["Toplam", summary?.total || 0],
    ["Son 24 Saat", summary?.last24h || 0],
    ["Aktarim Bekleyen", byStatus.handoff_pending || 0],
    ["Mesai Disi Kuyruk", byStatus.queued_after_hours || 0],
    ["Aktarim Basarili", byStatus.handoff_success || 0],
    ["Parent Aktarim", byStatus.handoff_parent_posted || 0],
    ["Aktarim Basarisiz", byStatus.handoff_failed || 0],
    ["Ozet Gonderilemedi", byStatus.handoff_opened_no_summary || 0]
  ];
  for (const [label, value] of cards) {
    summaryGrid.appendChild(createSummaryCard(label, value));
  }
}

function renderTicketRows(tickets) {
  if (!Array.isArray(tickets) || !tickets.length) {
    ticketsTableBody.innerHTML = '<tr><td colspan="10" class="empty">Kayit yok.</td></tr>';
    return;
  }
  ticketsTableBody.innerHTML = "";
  for (const ticket of tickets) {
    const priorityClass = ticket.priority === "high" ? "priority-high" : ticket.priority === "low" ? "priority-low" : "";
    const tr = document.createElement("tr");
    tr.innerHTML =
      '<td><input type="checkbox" class="bulk-check" data-id="' + escapeHtml(ticket.id) + '" /></td>' +
      "<td>" + escapeHtml(ticket.id || "-") + "</td>" +
      '<td><span class="status-pill ' + escapeHtml(ticket.status || "") + '">' + escapeHtml(ticket.status || "-") + "</span></td>" +
      '<td><span class="priority-badge ' + priorityClass + '">' + escapeHtml(ticket.priority || "normal") + "</span></td>" +
      "<td>" + escapeHtml(ticket.branchCode || "-") + "</td>" +
      '<td class="issue-cell">' + escapeHtml(ticket.issueSummary || "-") + "</td>" +
      "<td>" + escapeHtml(ticket.assignedTo || "-") + "</td>" +
      "<td>" + escapeHtml(ticket.source || "web") + "</td>" +
      "<td>" + fmtDate(ticket.createdAt) + "</td>" +
      '<td><button class="open-button" type="button" data-ticket-id="' + escapeHtml(ticket.id) + '">Ac</button></td>';
    ticketsTableBody.appendChild(tr);
  }
  updateBulkToolbar();
}

function renderTicketDetail(ticket) {
  const ticketActions = $("ticketActions");
  if (!ticket) {
    ticketDetail.textContent = "Detay yok.";
    if (chatHistoryEl) chatHistoryEl.textContent = "";
    if (ticketActions) ticketActions.style.display = "none";
    state.currentTicketId = null;
    return;
  }

  state.currentTicketId = ticket.id;

  const lines = [
    "ID: " + ticket.id,
    "Durum: " + ticket.status,
    "Oncelik: " + (ticket.priority || "normal"),
    "Atanan: " + (ticket.assignedTo || "-"),
    "Kaynak: " + (ticket.source || "web"),
    "CSAT: " + (ticket.csatRating ? ticket.csatRating + "/5" : "-"),
    "Sube: " + (ticket.branchCode || "-"),
    "Sorun: " + (ticket.issueSummary || "-"),
    "Firma: " + (ticket.companyName || "-"),
    "Ad Soyad: " + (ticket.fullName || "-"),
    "Telefon: " + (ticket.phone || "-"),
    "Olusturma: " + fmtDate(ticket.createdAt),
    "Guncelleme: " + fmtDate(ticket.updatedAt),
    "Aktarim denemesi: " + (ticket.handoffAttempts || 0),
    "Son aktarim: " + fmtDate(ticket.lastHandoffAt)
  ];

  if (ticket.supportSnapshot) {
    lines.push("");
    lines.push("Support Snapshot: " + JSON.stringify(ticket.supportSnapshot));
  }

  if (Array.isArray(ticket.events) && ticket.events.length) {
    lines.push("");
    lines.push("Events:");
    for (const event of ticket.events) {
      lines.push("- " + fmtDate(event.at) + " | " + (event.type || "-") + " | " + (event.status || "-") + " | " + (event.message || "-"));
    }
  }

  ticketDetail.textContent = lines.join("\n");

  // Show team actions
  if (ticketActions) {
    ticketActions.style.display = "";
    $("ticketAssignInput").value = ticket.assignedTo || "";
    $("ticketPrioritySelect").value = ticket.priority || "normal";
    // Render internal notes
    const notesList = $("ticketNotesList");
    notesList.innerHTML = "";
    if (Array.isArray(ticket.internalNotes) && ticket.internalNotes.length) {
      for (const n of ticket.internalNotes) {
        const noteDiv = document.createElement("div");
        noteDiv.className = "note-item";
        noteDiv.textContent = fmtDate(n.at) + " [" + (n.author || "admin") + "]: " + n.note;
        notesList.appendChild(noteDiv);
      }
    }
  }

  if (!chatHistoryEl) return;
  chatHistoryEl.innerHTML = "";

  if (!Array.isArray(ticket.chatHistory) || !ticket.chatHistory.length) {
    chatHistoryEl.textContent = "Sohbet gecmisi yok.";
    return;
  }

  for (const msg of ticket.chatHistory) {
    const div = document.createElement("div");
    div.className = msg.role === "user" ? "chat-msg chat-msg-user" : "chat-msg chat-msg-bot";
    const label = document.createElement("span");
    label.className = "chat-msg-label";
    label.textContent = msg.role === "user" ? "Kullanici" : "Bot";
    const content = document.createElement("span");
    content.className = "chat-msg-content";
    content.textContent = msg.content || "";
    div.appendChild(label);
    div.appendChild(content);
    chatHistoryEl.appendChild(div);
  }
}

async function loadTicketDetail(ticketId) {
  try {
    const payload = await apiGet("admin/tickets/" + encodeURIComponent(ticketId));
    renderTicketDetail(payload.ticket);
  } catch (error) {
    ticketDetail.textContent = "Detay alinamadi: " + error.message;
  }
}

async function refreshDashboard() {
  try {
    let ticketUrl = "admin/tickets?status=" + encodeURIComponent(statusFilter.value) +
      "&limit=" + encodeURIComponent(limitFilter.value);
    if (searchFilter.value.trim()) {
      ticketUrl += "&q=" + encodeURIComponent(searchFilter.value.trim());
    }
    if (sourceFilter.value) {
      ticketUrl += "&source=" + encodeURIComponent(sourceFilter.value);
    }
    const [summaryPayload, ticketsPayload, convsPayload] = await Promise.all([
      apiGet("admin/summary"),
      apiGet(ticketUrl),
      apiGet("admin/conversations").catch(() => ({ conversations: [] }))
    ]);
    renderSummary(summaryPayload.summary || {});
    renderTicketRows(ticketsPayload.tickets || []);
    renderConversations(convsPayload.conversations || []);
  } catch (error) {
    summaryGrid.innerHTML = "";
    ticketsTableBody.innerHTML = '<tr><td colspan="9" class="empty">Hata: ' + escapeHtml(error.message) + "</td></tr>";
  }
}

function renderConversations(convs) {
  const tbody = $("convsTableBody");
  const badge = $("convCount");
  if (!tbody) return;

  if (badge) badge.textContent = String(convs.length);

  if (!convs.length) {
    tbody.innerHTML = '<tr><td colspan="9" class="empty">Aktif sohbet yok.</td></tr>';
    return;
  }

  tbody.innerHTML = "";
  for (const c of convs) {
    const statusClass = c.status === "active" ? "status-active" : "status-ticketed";
    const statusLabel = c.status === "active" ? "Aktif" : "Ticket'li";
    const branchCode = c.memory?.branchCode || "-";
    const tr = document.createElement("tr");
    tr.innerHTML =
      "<td>" + escapeHtml((c.sessionId || "").slice(-8)) + "</td>" +
      '<td><span class="conv-status ' + statusClass + '">' + statusLabel + "</span></td>" +
      "<td>" + (c.messageCount || 0) + "</td>" +
      '<td class="issue-cell">' + escapeHtml((c.lastUserMessage || "-").slice(0, 80)) + "</td>" +
      "<td>" + escapeHtml(branchCode) + "</td>" +
      "<td>" + escapeHtml(c.source || "web") + "</td>" +
      "<td>" + fmtDate(c.createdAt) + "</td>" +
      "<td>" + fmtDate(c.updatedAt) + "</td>" +
      '<td><button class="open-button conv-detail-btn" type="button" data-session-id="' + escapeHtml(c.sessionId) + '">Ac</button></td>';
    tbody.appendChild(tr);
  }
}

// Conversation detail click handler
document.addEventListener("click", (event) => {
  const btn = event.target.closest("button[data-session-id]");
  if (!btn) return;
  const sessionId = btn.getAttribute("data-session-id");
  showConversationDetail(sessionId);
});

function showConversationDetail(sessionId) {
  apiGet("admin/conversations").then(payload => {
    const conv = (payload.conversations || []).find(c => c.sessionId === sessionId);
    if (!conv) return;

    const detail = $("ticketDetail");
    const chatEl = $("chatHistory");
    const actions = $("ticketActions");
    if (actions) actions.style.display = "none";
    state.currentTicketId = null;

    const lines = [
      "Oturum: " + conv.sessionId,
      "Durum: " + conv.status + (conv.ticketId ? " (Ticket: " + conv.ticketId + ")" : ""),
      "Kaynak: " + (conv.source || "web"),
      "Mesaj Sayisi: " + (conv.messageCount || 0),
      "Baslangic: " + fmtDate(conv.createdAt),
      "Son Guncelleme: " + fmtDate(conv.updatedAt),
      "",
      "Toplanan Bilgiler:",
      "  Sube Kodu: " + (conv.memory?.branchCode || "-"),
      "  Sorun: " + (conv.memory?.issueSummary || "-"),
      "  Firma: " + (conv.memory?.companyName || "-"),
      "  Ad Soyad: " + (conv.memory?.fullName || "-"),
      "  Telefon: " + (conv.memory?.phone || "-")
    ];
    if (detail) detail.textContent = lines.join("\n");

    if (!chatEl) return;
    chatEl.innerHTML = "";
    if (!Array.isArray(conv.chatHistory) || !conv.chatHistory.length) {
      chatEl.textContent = "Sohbet gecmisi yok.";
      return;
    }
    for (const msg of conv.chatHistory) {
      const div = document.createElement("div");
      div.className = msg.role === "user" ? "chat-msg chat-msg-user" : "chat-msg chat-msg-bot";
      const label = document.createElement("span");
      label.className = "chat-msg-label";
      label.textContent = msg.role === "user" ? "Kullanici" : "Bot";
      const content = document.createElement("span");
      content.className = "chat-msg-content";
      content.textContent = msg.content || "";
      div.appendChild(label);
      div.appendChild(content);
      chatEl.appendChild(div);
    }
  }).catch(() => {});
}

function setAutoRefresh(enabled) {
  state.autoRefresh = enabled;
  autoButton.dataset.active = enabled ? "1" : "0";
  autoButton.textContent = enabled ? "Oto Yenile: Acik" : "Oto Yenile: Kapali";
  if (state.autoTimer) {
    clearInterval(state.autoTimer);
    state.autoTimer = null;
  }
  if (enabled) {
    state.autoTimer = setInterval(() => { void refreshDashboard(); }, 15000);
  }
}

// Ticket event listeners
ticketsTableBody.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-ticket-id]");
  if (!button) return;
  void loadTicketDetail(button.getAttribute("data-ticket-id"));
});

refreshButton.addEventListener("click", () => { void refreshDashboard(); });
autoButton.addEventListener("click", () => { setAutoRefresh(!state.autoRefresh); });
statusFilter.addEventListener("change", () => { void refreshDashboard(); });
sourceFilter.addEventListener("change", () => { void refreshDashboard(); });
limitFilter.addEventListener("change", () => { void refreshDashboard(); });
searchFilter.addEventListener("input", () => {
  if (state.searchDebounceTimer) clearTimeout(state.searchDebounceTimer);
  state.searchDebounceTimer = setTimeout(() => { void refreshDashboard(); }, 400);
});

// ══════════════════════════════════════════════════════════════════════════
// TAB 2: KNOWLEDGE BASE
// ══════════════════════════════════════════════════════════════════════════

async function loadKnowledgeBase() {
  try {
    const payload = await apiGet("admin/knowledge");
    const records = payload.records || [];
    kbRecordCount.textContent = records.length;
    renderKBTable(records);
    loadAutoFAQs();
  } catch (error) {
    kbTableBody.innerHTML = '<tr><td colspan="4" class="empty">Hata: ' + escapeHtml(error.message) + "</td></tr>";
  }
}

// ── Auto-FAQ ─────────────────────────────────────────────────────────────
async function loadAutoFAQs() {
  const container = $("autoFaqSection");
  if (!container) return;
  try {
    const payload = await apiGet("admin/auto-faq");
    const faqs = payload.faqs || [];
    if (!faqs.length) {
      container.innerHTML = "<p class='empty'>Henuz oneri yok. 'FAQ Olustur' ile olusturabilirsiniz.</p>";
      return;
    }
    let html = '<table><thead><tr><th>Soru</th><th>Cevap</th><th>Ticket</th><th>Islemler</th></tr></thead><tbody>';
    for (const f of faqs) {
      html += "<tr><td>" + escapeHtml(f.question) + "</td><td>" + escapeHtml((f.answer || "").slice(0, 100)) + "</td><td>" + escapeHtml(f.ticketId || "-") + "</td>" +
        '<td><button class="btn btn-primary" onclick="approveAutoFaq(\'' + f.id + '\')">Onayla</button> <button class="btn btn-secondary" onclick="rejectAutoFaq(\'' + f.id + '\')">Reddet</button></td></tr>';
    }
    html += "</tbody></table>";
    container.innerHTML = html;
  } catch (_e) {
    container.innerHTML = "<p class='empty'>Yuklenemedi.</p>";
  }
}

async function approveAutoFaq(id) {
  try {
    await apiPost("admin/auto-faq/" + id + "/approve");
    showToast("FAQ onaylandi ve bilgi tabanina eklendi.", "success");
    loadKnowledgeBase();
  } catch (err) {
    showToast("Hata: " + err.message, "error");
  }
}

async function rejectAutoFaq(id) {
  try {
    await apiPost("admin/auto-faq/" + id + "/reject");
    showToast("FAQ reddedildi.", "info");
    loadAutoFAQs();
  } catch (err) {
    showToast("Hata: " + err.message, "error");
  }
}

if ($("autoFaqGenerateBtn")) {
  $("autoFaqGenerateBtn").addEventListener("click", async () => {
    $("autoFaqGenerateBtn").disabled = true;
    $("autoFaqGenerateBtn").textContent = "Olusturuluyor...";
    try {
      const result = await apiPost("admin/auto-faq/generate");
      showToast((result.generated || 0) + " FAQ onerisi olusturuldu.", "success");
      loadAutoFAQs();
    } catch (err) {
      showToast("Hata: " + err.message, "error");
    } finally {
      $("autoFaqGenerateBtn").disabled = false;
      $("autoFaqGenerateBtn").textContent = "FAQ Olustur";
    }
  });
}

function renderKBTable(records) {
  if (!records.length) {
    kbTableBody.innerHTML = '<tr><td colspan="4" class="empty">Kayit yok.</td></tr>';
    return;
  }
  kbTableBody.innerHTML = "";
  for (const rec of records) {
    const tr = document.createElement("tr");
    tr.innerHTML =
      "<td>" + rec.id + "</td>" +
      '<td class="issue-cell">' + escapeHtml((rec.question || "").slice(0, 100)) + "</td>" +
      '<td class="issue-cell">' + escapeHtml((rec.answer || "").slice(0, 120)) + "</td>" +
      '<td><button class="btn btn-sm btn-secondary kb-edit-btn" data-id="' + rec.id + '">Duzenle</button> ' +
      '<button class="btn btn-sm btn-danger kb-delete-btn" data-id="' + rec.id + '">Sil</button></td>';
    kbTableBody.appendChild(tr);
  }
}

function openKBModal(id, question, answer) {
  state.editingKBId = id;
  kbModalTitle.textContent = id ? "Kayit Duzenle (#" + id + ")" : "Yeni Kayit";
  kbModalQuestion.value = question || "";
  kbModalAnswer.value = answer || "";
  kbModal.style.display = "";
}

function closeKBModal() {
  kbModal.style.display = "none";
  state.editingKBId = null;
  kbModalQuestion.value = "";
  kbModalAnswer.value = "";
}

async function saveKBRecord() {
  const question = kbModalQuestion.value.trim();
  const answer = kbModalAnswer.value.trim();
  if (!question || !answer) {
    showToast("Soru ve cevap alanlari zorunludur.", "error");
    return;
  }

  try {
    if (state.editingKBId) {
      await apiPut("admin/knowledge/" + state.editingKBId, { question, answer });
      showToast("Kayit guncellendi.", "success");
    } else {
      await apiPost("admin/knowledge", { question, answer });
      showToast("Yeni kayit eklendi.", "success");
    }
    closeKBModal();
    await loadKnowledgeBase();
  } catch (error) {
    showToast("Hata: " + error.message, "error");
  }
}

async function deleteKBRecord(id) {
  const ok = await confirmAction("Bu kaydi silmek istediginize emin misiniz? (#" + id + ")");
  if (!ok) return;

  try {
    await apiDelete("admin/knowledge/" + id);
    showToast("Kayit silindi.", "success");
    await loadKnowledgeBase();
  } catch (error) {
    showToast("Hata: " + error.message, "error");
  }
}

async function triggerReingest() {
  kbReingestStatus.textContent = "Yukleniyor...";
  kbReingestBtn.disabled = true;
  try {
    const payload = await apiPost("admin/knowledge/reingest", {});
    kbReingestStatus.textContent = "Tamamlandi: " + (payload.recordCount || 0) + " kayit";
    showToast("Bilgi tabani yeniden yuklendi.", "success");
    setTimeout(() => { kbReingestStatus.textContent = ""; }, 5000);
  } catch (error) {
    kbReingestStatus.textContent = "Hata!";
    showToast("Reingest hatasi: " + error.message, "error");
  } finally {
    kbReingestBtn.disabled = false;
  }
}

// KB event listeners
kbAddBtn.addEventListener("click", () => openKBModal(null, "", ""));
kbModalCancelBtn.addEventListener("click", closeKBModal);
kbModalSaveBtn.addEventListener("click", () => { void saveKBRecord(); });
kbReingestBtn.addEventListener("click", () => { void triggerReingest(); });

kbTableBody.addEventListener("click", async (event) => {
  const editBtn = event.target.closest(".kb-edit-btn");
  if (editBtn) {
    const id = Number(editBtn.dataset.id);
    try {
      const payload = await apiGet("admin/knowledge");
      const rec = (payload.records || []).find((r) => r.id === id);
      if (rec) openKBModal(id, rec.question, rec.answer);
    } catch (err) {
      showToast("Kayit alinamadi: " + err.message, "error");
    }
    return;
  }

  const deleteBtn = event.target.closest(".kb-delete-btn");
  if (deleteBtn) {
    void deleteKBRecord(Number(deleteBtn.dataset.id));
  }
});

// ══════════════════════════════════════════════════════════════════════════
// TAB 3: BOT CONFIG
// ══════════════════════════════════════════════════════════════════════════

function loadBotConfigTab() {
  // Load whichever sub-tab is active
  const activeSubTab = document.querySelector(".sub-tab-btn.active");
  if (activeSubTab) switchSubTab(activeSubTab.dataset.subtab);
}

// ── Agent Files ────────────────────────────────────────────────────────────
async function loadAgentFiles() {
  try {
    const payload = await apiGet("admin/agent/files");
    const files = payload.files || [];
    agentFileList.innerHTML = "";
    for (const file of files) {
      const li = document.createElement("li");
      li.textContent = file;
      li.dataset.filename = file;
      if (state.currentAgentFile === file) li.classList.add("active");
      li.addEventListener("click", () => loadAgentFileContent(file));
      agentFileList.appendChild(li);
    }
  } catch (error) {
    agentFileList.innerHTML = "<li>Hata: " + escapeHtml(error.message) + "</li>";
  }
}

async function loadAgentFileContent(filename) {
  try {
    const payload = await apiGet("admin/agent/files/" + encodeURIComponent(filename));
    state.currentAgentFile = filename;
    state.originalAgentContent = payload.content || "";
    agentEditorFilename.textContent = filename;
    agentEditorTextarea.value = payload.content || "";
    agentEditorTextarea.disabled = false;
    agentEditorSaveBtn.disabled = false;
    agentEditorRevertBtn.disabled = false;

    // Update active state in list
    agentFileList.querySelectorAll("li").forEach((li) => {
      li.classList.toggle("active", li.dataset.filename === filename);
    });
  } catch (error) {
    showToast("Dosya okunamadi: " + error.message, "error");
  }
}

async function saveAgentFile() {
  if (!state.currentAgentFile) return;
  try {
    await apiPut("admin/agent/files/" + encodeURIComponent(state.currentAgentFile), {
      content: agentEditorTextarea.value
    });
    state.originalAgentContent = agentEditorTextarea.value;
    showToast(state.currentAgentFile + " kaydedildi.", "success");
  } catch (error) {
    showToast("Kaydetme hatasi: " + error.message, "error");
  }
}

function revertAgentFile() {
  agentEditorTextarea.value = state.originalAgentContent;
  showToast("Degisiklikler geri alindi.", "info");
}

agentEditorSaveBtn.addEventListener("click", () => { void saveAgentFile(); });
agentEditorRevertBtn.addEventListener("click", revertAgentFile);

// ── Topics ─────────────────────────────────────────────────────────────────
async function loadTopics() {
  try {
    const payload = await apiGet("admin/agent/topics");
    const topics = payload.topics || [];
    renderTopicsTable(topics);
  } catch (error) {
    topicsTableBody.innerHTML = '<tr><td colspan="6" class="empty">Hata: ' + escapeHtml(error.message) + "</td></tr>";
  }
}

function renderTopicsTable(topics) {
  if (!topics.length) {
    topicsTableBody.innerHTML = '<tr><td colspan="6" class="empty">Konu yok.</td></tr>';
    return;
  }
  topicsTableBody.innerHTML = "";
  for (const t of topics) {
    const tr = document.createElement("tr");
    tr.innerHTML =
      "<td>" + escapeHtml(t.id) + "</td>" +
      "<td>" + escapeHtml(t.title) + "</td>" +
      '<td class="issue-cell">' + escapeHtml((t.keywords || []).join(", ").slice(0, 80)) + "</td>" +
      '<td><span class="status-dot ' + (t.requiresEscalation ? "active" : "inactive") + '"></span>' + (t.requiresEscalation ? "Evet" : "Hayir") + "</td>" +
      '<td><span class="status-dot ' + (t.canResolveDirectly ? "active" : "inactive") + '"></span>' + (t.canResolveDirectly ? "Evet" : "Hayir") + "</td>" +
      '<td><button class="btn btn-sm btn-secondary topic-edit-btn" data-id="' + escapeHtml(t.id) + '">Duzenle</button> ' +
      '<button class="btn btn-sm btn-danger topic-delete-btn" data-id="' + escapeHtml(t.id) + '">Sil</button></td>';
    topicsTableBody.appendChild(tr);
  }
}

async function openTopicModal(topicId) {
  state.editingTopicId = topicId;
  if (topicId) {
    try {
      const payload = await apiGet("admin/agent/topics/" + encodeURIComponent(topicId));
      const t = payload.topic || {};
      topicModalId.value = t.id || "";
      topicModalId.disabled = true;
      topicModalTitle.value = t.title || "";
      topicModalKeywords.value = (t.keywords || []).join(", ");
      topicModalRequiresEscalation.checked = Boolean(t.requiresEscalation);
      topicModalCanResolveDirectly.checked = Boolean(t.canResolveDirectly);
      topicModalRequiredInfo.value = (t.requiredInfo || []).join(", ");
      topicModalContent.value = payload.content || "";
    } catch (error) {
      showToast("Konu alinamadi: " + error.message, "error");
      return;
    }
  } else {
    topicModalId.value = "";
    topicModalId.disabled = false;
    topicModalTitle.value = "";
    topicModalKeywords.value = "";
    topicModalRequiresEscalation.checked = false;
    topicModalCanResolveDirectly.checked = false;
    topicModalRequiredInfo.value = "";
    topicModalContent.value = "";
  }
  topicModal.style.display = "";
}

function closeTopicModal() {
  topicModal.style.display = "none";
  state.editingTopicId = null;
}

async function saveTopic() {
  const id = topicModalId.value.trim();
  const title = topicModalTitle.value.trim();
  if (!id || !title) {
    showToast("ID ve Baslik zorunludur.", "error");
    return;
  }

  const body = {
    id,
    title,
    keywords: topicModalKeywords.value.split(",").map((k) => k.trim()).filter(Boolean),
    requiresEscalation: topicModalRequiresEscalation.checked,
    canResolveDirectly: topicModalCanResolveDirectly.checked,
    requiredInfo: topicModalRequiredInfo.value.split(",").map((k) => k.trim()).filter(Boolean),
    content: topicModalContent.value
  };

  try {
    if (state.editingTopicId) {
      await apiPut("admin/agent/topics/" + encodeURIComponent(state.editingTopicId), body);
      showToast("Konu guncellendi.", "success");
    } else {
      await apiPost("admin/agent/topics", body);
      showToast("Yeni konu olusturuldu.", "success");
    }
    closeTopicModal();
    await loadTopics();
  } catch (error) {
    showToast("Hata: " + error.message, "error");
  }
}

async function deleteTopic(topicId) {
  const ok = await confirmAction("'" + topicId + "' konusunu silmek istediginize emin misiniz?");
  if (!ok) return;

  try {
    await apiDelete("admin/agent/topics/" + encodeURIComponent(topicId));
    showToast("Konu silindi.", "success");
    await loadTopics();
  } catch (error) {
    showToast("Hata: " + error.message, "error");
  }
}

topicAddBtn.addEventListener("click", () => openTopicModal(null));
topicModalCancelBtn.addEventListener("click", closeTopicModal);
topicModalSaveBtn.addEventListener("click", () => { void saveTopic(); });

topicsTableBody.addEventListener("click", (event) => {
  const editBtn = event.target.closest(".topic-edit-btn");
  if (editBtn) {
    void openTopicModal(editBtn.dataset.id);
    return;
  }
  const deleteBtn = event.target.closest(".topic-delete-btn");
  if (deleteBtn) {
    void deleteTopic(deleteBtn.dataset.id);
  }
});

// ── Memory Templates ───────────────────────────────────────────────────────
async function loadMemoryFiles() {
  try {
    const payload = await apiGet("admin/agent/memory");
    const files = payload.files || {};
    memoryTicketTemplate.value = JSON.stringify(files["ticket-template.json"] || {}, null, 2);
    memoryConversationSchema.value = JSON.stringify(files["conversation-schema.json"] || {}, null, 2);
    validateJsonField(memoryTicketTemplate, memoryTicketValidation);
    validateJsonField(memoryConversationSchema, memorySchemaValidation);
  } catch (error) {
    showToast("Bellek dosyalari alinamadi: " + error.message, "error");
  }
}

function validateJsonField(textarea, badge) {
  try {
    JSON.parse(textarea.value);
    badge.textContent = "Gecerli JSON";
    badge.className = "validation-badge valid";
    return true;
  } catch (err) {
    badge.textContent = "Gecersiz JSON";
    badge.className = "validation-badge invalid";
    return false;
  }
}

async function saveMemoryFile(filename, textarea, badge) {
  if (!validateJsonField(textarea, badge)) {
    showToast("Gecersiz JSON formati.", "error");
    return;
  }
  try {
    await apiPut("admin/agent/memory/" + encodeURIComponent(filename), {
      content: textarea.value
    });
    showToast(filename + " kaydedildi.", "success");
  } catch (error) {
    showToast("Kaydetme hatasi: " + error.message, "error");
  }
}

memoryTicketTemplate.addEventListener("input", () => validateJsonField(memoryTicketTemplate, memoryTicketValidation));
memoryConversationSchema.addEventListener("input", () => validateJsonField(memoryConversationSchema, memorySchemaValidation));
memoryTicketSaveBtn.addEventListener("click", () => { void saveMemoryFile("ticket-template.json", memoryTicketTemplate, memoryTicketValidation); });
memorySchemaSaveBtn.addEventListener("click", () => { void saveMemoryFile("conversation-schema.json", memoryConversationSchema, memorySchemaValidation); });

// ── Environment Variables ──────────────────────────────────────────────────
const ENV_GROUPS = {
  "LLM Provider": ["LLM_PROVIDER", "LLM_API_KEY", "LLM_MODEL", "LLM_BASE_URL", "LLM_FALLBACK_MODEL", "LLM_MAX_OUTPUT_TOKENS", "LLM_REQUEST_TIMEOUT_MS", "ENABLE_THINKING"],
  "Embedding Provider": ["EMBEDDING_PROVIDER", "EMBEDDING_MODEL", "EMBEDDING_API_KEY", "EMBEDDING_BASE_URL", "EMBEDDING_DIMENSIONS"],
  "Legacy Gemini": ["GOOGLE_API_KEY", "GOOGLE_MODEL", "GOOGLE_MAX_OUTPUT_TOKENS", "GOOGLE_THINKING_BUDGET", "GOOGLE_REQUEST_TIMEOUT_MS", "GOOGLE_FALLBACK_MODEL"],
  "Destek Saatleri": ["SUPPORT_HOURS_ENABLED", "SUPPORT_TIMEZONE", "SUPPORT_OPEN_HOUR", "SUPPORT_CLOSE_HOUR", "SUPPORT_OPEN_DAYS"],
  "Zendesk": ["ZENDESK_ENABLED", "ZENDESK_SNIPPET_KEY", "ZENDESK_DEFAULT_TAGS"],
  "Rate Limiting": ["RATE_LIMIT_ENABLED", "RATE_LIMIT_MAX", "RATE_LIMIT_WINDOW_MS"],
  "Telegram": ["TELEGRAM_ENABLED", "TELEGRAM_BOT_TOKEN", "TELEGRAM_POLLING_INTERVAL_MS"],
  "Sunshine Conversations": ["ZENDESK_SC_ENABLED", "ZENDESK_SC_APP_ID", "ZENDESK_SC_KEY_ID", "ZENDESK_SC_KEY_SECRET", "ZENDESK_SC_WEBHOOK_SECRET", "ZENDESK_SC_SUBDOMAIN"],
  "Diger": ["PORT", "ADMIN_TOKEN", "DETERMINISTIC_COLLECTION_MODE", "BOT_NAME", "COMPANY_NAME"]
};

let envSensitiveKeys = [];

async function loadEnvConfig() {
  try {
    const payload = await apiGet("admin/env");
    const env = payload.env || {};
    envSensitiveKeys = payload.sensitiveKeys || [];
    renderEnvForm(env);
  } catch (error) {
    envForm.innerHTML = '<p class="empty">Hata: ' + escapeHtml(error.message) + "</p>";
  }
}

function renderEnvForm(env) {
  envForm.innerHTML = "";
  const assignedKeys = new Set();

  for (const [groupName, keys] of Object.entries(ENV_GROUPS)) {
    const group = document.createElement("div");
    group.className = "env-group";
    const title = document.createElement("h3");
    title.textContent = groupName;
    group.appendChild(title);

    for (const key of keys) {
      assignedKeys.add(key);
      const value = env[key] !== undefined ? env[key] : "";
      group.appendChild(createEnvField(key, value));
    }

    envForm.appendChild(group);
  }

  // Unassigned keys
  const unassigned = Object.keys(env).filter((k) => !assignedKeys.has(k));
  if (unassigned.length) {
    const group = document.createElement("div");
    group.className = "env-group";
    const title = document.createElement("h3");
    title.textContent = "Diger Degiskenler";
    group.appendChild(title);
    for (const key of unassigned) {
      group.appendChild(createEnvField(key, env[key]));
    }
    envForm.appendChild(group);
  }
}

const ENV_HINTS = {
  LLM_PROVIDER: "gemini, openai veya ollama",
  LLM_API_KEY: "Provider API anahtari",
  LLM_MODEL: "orn: gemini-2.5-flash, gpt-4o, llama3",
  LLM_BASE_URL: "Ollama icin: http://localhost:11434",
  LLM_FALLBACK_MODEL: "Birincil model hatada kullanilacak model",
  LLM_MAX_OUTPUT_TOKENS: "Maks cikti token (varsayilan: 1024)",
  LLM_REQUEST_TIMEOUT_MS: "Istek zaman asimi ms (varsayilan: 15000)",
  EMBEDDING_PROVIDER: "gemini, openai veya ollama",
  EMBEDDING_MODEL: "orn: gemini-embedding-001, text-embedding-3-small",
  EMBEDDING_API_KEY: "Embedding API anahtari (bossa LLM key kullanilir)",
  EMBEDDING_BASE_URL: "Ollama icin: http://localhost:11434",
  EMBEDDING_DIMENSIONS: "Embedding boyutu (0 = varsayilan)",
  ENABLE_THINKING: "false (varsayilan), auto veya true"
};

function createEnvField(key, value) {
  const div = document.createElement("div");
  const isSensitive = envSensitiveKeys.includes(key);
  div.className = "env-field" + (isSensitive ? " masked" : "");

  const label = document.createElement("label");
  label.textContent = key;

  const input = document.createElement("input");
  input.type = isSensitive ? "password" : "text";
  input.name = key;
  input.value = value || "";
  input.placeholder = ENV_HINTS[key] || key;

  div.appendChild(label);
  div.appendChild(input);
  return div;
}

async function saveEnvConfig() {
  const inputs = envForm.querySelectorAll("input[name]");
  const updates = {};
  inputs.forEach((input) => {
    updates[input.name] = input.value;
  });

  envSaveStatus.textContent = "Kaydediliyor...";
  envSaveBtn.disabled = true;
  try {
    const payload = await apiPut("admin/env", { updates });
    envSaveStatus.textContent = "Kaydedildi";
    showToast(payload.message || "Env guncellendi.", "success");
    setTimeout(() => { envSaveStatus.textContent = ""; }, 3000);
  } catch (error) {
    envSaveStatus.textContent = "Hata!";
    showToast("Env kaydetme hatasi: " + error.message, "error");
  } finally {
    envSaveBtn.disabled = false;
  }
}

envSaveBtn.addEventListener("click", () => { void saveEnvConfig(); });

// ══════════════════════════════════════════════════════════════════════════
// CHAT FLOW CONFIG
// ══════════════════════════════════════════════════════════════════════════

let chatFlowDefaults = {};

async function loadChatFlowConfig() {
  try {
    const payload = await apiGet("admin/chat-flow");
    chatFlowDefaults = payload.defaults || {};
    renderChatFlowConfig(payload.config || {});
  } catch (error) {
    showToast("Sohbet akis ayarlari yuklenemedi: " + error.message, "error");
  }
}

function renderChatFlowConfig(config) {
  // Welcome
  const cfWelcome = $("cfWelcomeMessage");
  if (cfWelcome) cfWelcome.value = config.welcomeMessage || "";

  // Timing
  setupRange("cfAggregationMs", "cfAggregationMsVal", config.messageAggregationWindowMs || 4000, (v) => v + " ms");
  setupRange("cfBotDelayMs", "cfBotDelayMsVal", config.botResponseDelayMs || 2000, (v) => v + " ms");
  setupCheckbox("cfTypingEnabled", config.typingIndicatorEnabled !== false);

  // Inactivity
  const inactivityMin = Math.round((config.inactivityTimeoutMs || 600000) / 60000);
  setupRange("cfInactivityMs", "cfInactivityMsVal", inactivityMin, (v) => v + " dk");
  setupCheckbox("cfNudgeEnabled", config.nudgeEnabled !== false);

  const cfNudge75 = $("cfNudge75");
  if (cfNudge75) cfNudge75.value = config.nudgeAt75Message || "";
  const cfNudge90 = $("cfNudge90");
  if (cfNudge90) cfNudge90.value = config.nudgeAt90Message || "";
  const cfInactClose = $("cfInactivityClose");
  if (cfInactClose) cfInactClose.value = config.inactivityCloseMessage || "";

  // Detection
  setupCheckbox("cfGibberishEnabled", config.gibberishDetectionEnabled !== false);
  const cfGibMsg = $("cfGibberishMsg");
  if (cfGibMsg) cfGibMsg.value = config.gibberishMessage || "";
  setupRange("cfMaxRetries", "cfMaxRetriesVal", config.maxClarificationRetries || 3, (v) => v + " tekrar");

  // Closing
  setupCheckbox("cfClosingEnabled", config.closingFlowEnabled !== false);
  const cfAnythingElse = $("cfAnythingElse");
  if (cfAnythingElse) cfAnythingElse.value = config.anythingElseMessage || "";
  const cfFarewell = $("cfFarewell");
  if (cfFarewell) cfFarewell.value = config.farewellMessage || "";
  setupCheckbox("cfCsatEnabled", config.csatEnabled !== false);
  const cfCsatMsg = $("cfCsatMsg");
  if (cfCsatMsg) cfCsatMsg.value = config.csatMessage || "";
}

function setupRange(inputId, valId, value, format) {
  const input = $(inputId);
  const val = $(valId);
  if (!input || !val) return;
  input.value = value;
  val.textContent = format(value);
  input.oninput = () => { val.textContent = format(Number(input.value)); };
}

function setupCheckbox(inputId, checked) {
  const input = $(inputId);
  if (input) input.checked = checked;
}

async function saveChatFlowConfig() {
  const config = {
    welcomeMessage: ($("cfWelcomeMessage") || {}).value || "",
    messageAggregationWindowMs: Number($("cfAggregationMs")?.value || 4000),
    botResponseDelayMs: Number($("cfBotDelayMs")?.value || 2000),
    typingIndicatorEnabled: $("cfTypingEnabled")?.checked !== false,
    inactivityTimeoutMs: Number($("cfInactivityMs")?.value || 10) * 60000,
    nudgeEnabled: $("cfNudgeEnabled")?.checked !== false,
    nudgeAt75Message: ($("cfNudge75") || {}).value || "",
    nudgeAt90Message: ($("cfNudge90") || {}).value || "",
    inactivityCloseMessage: ($("cfInactivityClose") || {}).value || "",
    gibberishDetectionEnabled: $("cfGibberishEnabled")?.checked !== false,
    gibberishMessage: ($("cfGibberishMsg") || {}).value || "",
    maxClarificationRetries: Number($("cfMaxRetries")?.value || 3),
    closingFlowEnabled: $("cfClosingEnabled")?.checked !== false,
    anythingElseMessage: ($("cfAnythingElse") || {}).value || "",
    farewellMessage: ($("cfFarewell") || {}).value || "",
    csatEnabled: $("cfCsatEnabled")?.checked !== false,
    csatMessage: ($("cfCsatMsg") || {}).value || ""
  };

  const saveBtn = $("cfSaveBtn");
  const status = $("cfSaveStatus");
  if (saveBtn) saveBtn.disabled = true;
  if (status) status.textContent = "Kaydediliyor...";

  try {
    await apiPut("admin/chat-flow", { config });
    showToast("Sohbet akis ayarlari kaydedildi.", "success");
    if (status) status.textContent = "Kaydedildi";
    setTimeout(() => { if (status) status.textContent = ""; }, 3000);
  } catch (error) {
    showToast("Kaydetme hatasi: " + error.message, "error");
    if (status) status.textContent = "Hata!";
  } finally {
    if (saveBtn) saveBtn.disabled = false;
  }
}

async function resetChatFlowConfig() {
  const confirmed = await confirmAction("Tum sohbet akis ayarlarini varsayilana dondurmek istediginize emin misiniz?");
  if (!confirmed) return;

  try {
    await apiPut("admin/chat-flow", { config: chatFlowDefaults });
    showToast("Varsayilan ayarlar yuklendi.", "success");
    loadChatFlowConfig();
  } catch (error) {
    showToast("Sifirlama hatasi: " + error.message, "error");
  }
}

// Event listeners
const cfSaveBtn = $("cfSaveBtn");
const cfResetBtn = $("cfResetBtn");
if (cfSaveBtn) cfSaveBtn.addEventListener("click", () => { void saveChatFlowConfig(); });
if (cfResetBtn) cfResetBtn.addEventListener("click", () => { void resetChatFlowConfig(); });

// ══════════════════════════════════════════════════════════════════════════
// SITE CONFIG
// ══════════════════════════════════════════════════════════════════════════

let siteConfigDefaults = {};

async function loadSiteConfig() {
  try {
    const payload = await apiGet("admin/site-config");
    siteConfigDefaults = payload.defaults || {};
    renderSiteConfig(payload.config || {});
  } catch (error) {
    showToast("Site ayarlari yuklenemedi: " + error.message, "error");
  }
}

function renderSiteConfig(config) {
  const fields = {
    scPageTitle: "pageTitle",
    scHeroTitle: "heroTitle",
    scHeroDescription: "heroDescription",
    scHeroButtonText: "heroButtonText",
    scHeroHint: "heroHint",
    scHeaderTitle: "headerTitle",
    scInputPlaceholder: "inputPlaceholder",
    scSendButtonText: "sendButtonText"
  };

  for (const [id, key] of Object.entries(fields)) {
    const el = $(id);
    if (el) el.value = config[key] || "";
  }

  // Colors
  const themeColor = $("scThemeColor");
  const themeHex = $("scThemeColorHex");
  if (themeColor) {
    themeColor.value = config.themeColor || "#2563EB";
    if (themeHex) themeHex.textContent = themeColor.value;
    themeColor.oninput = () => { if (themeHex) themeHex.textContent = themeColor.value; };
  }

  const primaryColor = $("scPrimaryColor");
  const primaryHex = $("scPrimaryColorHex");
  if (primaryColor) {
    primaryColor.value = config.primaryColor || "#2563EB";
    if (primaryHex) primaryHex.textContent = primaryColor.value;
    primaryColor.oninput = () => { if (primaryHex) primaryHex.textContent = primaryColor.value; };
  }

  // Logo preview
  const preview = $("scLogoPreview");
  const logoName = $("scLogoName");
  if (preview && config.logoUrl) {
    preview.src = config.logoUrl;
    if (logoName) logoName.textContent = config.logoUrl;
  } else if (logoName) {
    logoName.textContent = "Varsayilan logo";
  }
}

async function saveSiteConfigAdmin() {
  const config = {
    pageTitle: ($("scPageTitle") || {}).value || "",
    heroTitle: ($("scHeroTitle") || {}).value || "",
    heroDescription: ($("scHeroDescription") || {}).value || "",
    heroButtonText: ($("scHeroButtonText") || {}).value || "",
    heroHint: ($("scHeroHint") || {}).value || "",
    headerTitle: ($("scHeaderTitle") || {}).value || "",
    inputPlaceholder: ($("scInputPlaceholder") || {}).value || "",
    sendButtonText: ($("scSendButtonText") || {}).value || "",
    themeColor: ($("scThemeColor") || {}).value || "#2563EB",
    primaryColor: ($("scPrimaryColor") || {}).value || ""
  };

  const saveBtn = $("scSaveBtn");
  const status = $("scSaveStatus");
  if (saveBtn) saveBtn.disabled = true;
  if (status) status.textContent = "Kaydediliyor...";

  try {
    await apiPut("admin/site-config", { config });
    showToast("Site ayarlari kaydedildi.", "success");
    if (status) status.textContent = "Kaydedildi";
    setTimeout(() => { if (status) status.textContent = ""; }, 3000);
  } catch (error) {
    showToast("Kaydetme hatasi: " + error.message, "error");
    if (status) status.textContent = "Hata!";
  } finally {
    if (saveBtn) saveBtn.disabled = false;
  }
}

async function resetSiteConfigAdmin() {
  const confirmed = await confirmAction("Tum site ayarlarini varsayilana dondurmek istediginize emin misiniz?");
  if (!confirmed) return;

  try {
    await apiPut("admin/site-config", { config: siteConfigDefaults });
    showToast("Varsayilan ayarlar yuklendi.", "success");
    loadSiteConfig();
  } catch (error) {
    showToast("Sifirlama hatasi: " + error.message, "error");
  }
}

async function uploadSiteLogo() {
  const input = $("scLogoInput");
  if (!input || !input.files || !input.files.length) return;

  const file = input.files[0];
  if (file.size > 2 * 1024 * 1024) {
    showToast("Logo dosyasi 2MB'dan buyuk olamaz.", "error");
    return;
  }

  const status = $("scLogoStatus");
  if (status) status.textContent = "Yukleniyor...";

  try {
    const headers = { "Content-Type": file.type, "Bypass-Tunnel-Reminder": "true" };
    if (state.token) headers["x-admin-token"] = state.token;

    const response = await fetch("api/admin/site-logo", {
      method: "POST",
      headers,
      body: file
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload?.error || "Yukleme hatasi");

    showToast("Logo yuklendi.", "success");
    if (status) status.textContent = "Yuklendi";
    setTimeout(() => { if (status) status.textContent = ""; }, 3000);

    // Update preview
    const preview = $("scLogoPreview");
    const logoName = $("scLogoName");
    if (preview && payload.logoUrl) preview.src = payload.logoUrl + "?t=" + Date.now();
    if (logoName && payload.logoUrl) logoName.textContent = payload.logoUrl;
  } catch (error) {
    showToast("Logo yukleme hatasi: " + error.message, "error");
    if (status) status.textContent = "Hata!";
  }

  input.value = "";
}

// Event listeners
const scSaveBtn = $("scSaveBtn");
const scResetBtn = $("scResetBtn");
const scLogoInput = $("scLogoInput");
if (scSaveBtn) scSaveBtn.addEventListener("click", () => { void saveSiteConfigAdmin(); });
if (scResetBtn) scResetBtn.addEventListener("click", () => { void resetSiteConfigAdmin(); });
if (scLogoInput) scLogoInput.addEventListener("change", () => { void uploadSiteLogo(); });

// ══════════════════════════════════════════════════════════════════════════
// TAB 4: SYSTEM
// ══════════════════════════════════════════════════════════════════════════

async function loadSystemInfo() {
  try {
    const payload = await apiGet("admin/system");
    renderSystemHealth(payload);
    renderAgentStatus(payload.agentStatus || []);
    renderKBSystemStatus(payload.knowledgeBase || {});
    loadAuditLog();
    loadSLAData();
  } catch (error) {
    sysHealthGrid.innerHTML = '<div class="health-card"><h3>Hata</h3><div class="value">' + escapeHtml(error.message) + "</div></div>";
  }
}

function renderSystemHealth(data) {
  sysHealthGrid.innerHTML = "";

  // LLM Health card (ozel renklendirme)
  const llm = data.llmHealth || {};
  const llmOk = llm.ok === true;
  const hasWarning = llmOk && llm.recentErrors > 0;
  const llmValue = llmOk
    ? "Aktif (" + llm.latencyMs + "ms)"
    : (llm.error || "Kontrol edilmedi");
  const llmSub = llm.checkedAt
    ? "Son kontrol: " + new Date(llm.checkedAt).toLocaleTimeString("tr-TR")
    : "";
  const llmCard = document.createElement("div");
  // Renk: hata=kirmizi, uyari(hatalar var ama ping ok)=sari, ok=yesil
  const llmClass = !llm.checkedAt ? "" : (!llmOk ? "health-error" : (hasWarning ? "health-warning" : "health-ok"));
  llmCard.className = "health-card " + llmClass;
  llmCard.innerHTML = "<h3>LLM API</h3>" +
    '<div class="value">' + escapeHtml(String(llmValue)) + "</div>" +
    (llmSub ? '<div class="label">' + escapeHtml(llmSub) + "</div>" : "") +
    (llm.provider ? '<div class="label">' + escapeHtml(llm.provider) + "</div>" : "") +
    (hasWarning ? '<div class="label" style="color:#f59e0b;font-weight:600">' + escapeHtml(llm.warning) + "</div>" : "") +
    (llm.lastError && hasWarning ? '<div class="label" style="color:#f59e0b">' + escapeHtml(llm.lastError) + "</div>" : "");
  sysHealthGrid.appendChild(llmCard);

  const cards = [
    ["Uptime", formatUptime(data.uptime || 0)],
    ["Node.js", data.nodeVersion || "-"],
    ["Bellek (RSS)", formatBytes(data.memory?.rss || 0)],
    ["Heap Kullanimi", formatBytes(data.memory?.heapUsed || 0) + " / " + formatBytes(data.memory?.heapTotal || 0)],
    ["Model", data.model || "-"],
    ["Konu Sayisi", data.topicsCount || 0],
    ["KB Kayit", (data.knowledgeBase?.recordCount || 0) + " kayit"],
    ["KB Durum", data.knowledgeBase?.loaded ? "Aktif" : "Pasif"]
  ];

  for (const [label, value] of cards) {
    const card = document.createElement("div");
    card.className = "health-card";
    card.innerHTML = "<h3>" + escapeHtml(label) + '</h3><div class="value">' + escapeHtml(String(value)) + "</div>";
    sysHealthGrid.appendChild(card);
  }
}

function renderAgentStatus(agentStatus) {
  sysAgentStatus.innerHTML = "";
  for (const item of agentStatus) {
    const div = document.createElement("div");
    div.className = "status-item";
    div.innerHTML = '<span class="status-dot ' + (item.loaded ? "active" : "inactive") + '"></span>' + escapeHtml(item.file);
    sysAgentStatus.appendChild(div);
  }
}

function renderKBSystemStatus(kb) {
  sysKBStatus.innerHTML = "";
  const div = document.createElement("div");
  div.className = "status-item";
  div.innerHTML = '<span class="status-dot ' + (kb.loaded ? "active" : "inactive") + '"></span>' +
    "LanceDB: " + (kb.loaded ? "Aktif" : "Pasif") + " (" + (kb.recordCount || 0) + " kayit)";
  sysKBStatus.appendChild(div);
}

async function reloadAgentConfig() {
  sysReloadBtn.disabled = true;
  try {
    const payload = await apiPost("admin/agent/reload", {});
    showToast(payload.message || "Agent config yeniden yuklendi.", "success");
    await loadSystemInfo();
  } catch (error) {
    showToast("Reload hatasi: " + error.message, "error");
  } finally {
    sysReloadBtn.disabled = false;
  }
}

sysRefreshBtn.addEventListener("click", () => { void loadSystemInfo(); });
sysReloadBtn.addEventListener("click", () => { void reloadAgentConfig(); });

// ══════════════════════════════════════════════════════════════════════════
// COMMON: Confirm Modal, Token, Init
// ══════════════════════════════════════════════════════════════════════════

confirmModalYes.addEventListener("click", () => {
  confirmModal.style.display = "none";
  if (state.confirmResolve) {
    state.confirmResolve(true);
    state.confirmResolve = null;
  }
});

confirmModalNo.addEventListener("click", () => {
  confirmModal.style.display = "none";
  if (state.confirmResolve) {
    state.confirmResolve(false);
    state.confirmResolve = null;
  }
});

// Close modals on overlay click
const webhookModal = $("webhookModal");
[kbModal, topicModal, confirmModal, webhookModal].forEach((modal) => {
  modal.addEventListener("click", (event) => {
    if (event.target === modal) {
      modal.style.display = "none";
      if (modal === confirmModal && state.confirmResolve) {
        state.confirmResolve(false);
        state.confirmResolve = null;
      }
    }
  });
});

// Admin token
adminTokenInput.value = state.token;
adminTokenInput.addEventListener("change", () => {
  state.token = adminTokenInput.value.trim();
  localStorage.setItem("qragy_admin_token", state.token);
  void refreshDashboard();
});

// ══════════════════════════════════════════════════════════════════════════
// TEAM FEATURES: Assign, Priority, Notes
// ══════════════════════════════════════════════════════════════════════════

$("ticketAssignBtn").addEventListener("click", async () => {
  if (!state.currentTicketId) return;
  try {
    await apiPut("admin/tickets/" + encodeURIComponent(state.currentTicketId) + "/assign", {
      assignedTo: $("ticketAssignInput").value.trim()
    });
    showToast("Ticket atandi.", "success");
    void loadTicketDetail(state.currentTicketId);
  } catch (err) { showToast("Hata: " + err.message, "error"); }
});

$("ticketPriorityBtn").addEventListener("click", async () => {
  if (!state.currentTicketId) return;
  try {
    await apiPut("admin/tickets/" + encodeURIComponent(state.currentTicketId) + "/priority", {
      priority: $("ticketPrioritySelect").value
    });
    showToast("Oncelik degistirildi.", "success");
    void loadTicketDetail(state.currentTicketId);
  } catch (err) { showToast("Hata: " + err.message, "error"); }
});

$("ticketNoteBtn").addEventListener("click", async () => {
  if (!state.currentTicketId) return;
  const noteInput = $("ticketNoteInput");
  const note = noteInput.value.trim();
  if (!note) return;
  try {
    await apiPost("admin/tickets/" + encodeURIComponent(state.currentTicketId) + "/notes", { note });
    noteInput.value = "";
    showToast("Not eklendi.", "success");
    void loadTicketDetail(state.currentTicketId);
  } catch (err) { showToast("Hata: " + err.message, "error"); }
});

// ══════════════════════════════════════════════════════════════════════════
// KB: FILE UPLOAD
// ══════════════════════════════════════════════════════════════════════════

$("kbFileUpload").addEventListener("change", async (event) => {
  const file = event.target.files[0];
  if (!file) return;
  const uploadStatus = $("kbUploadStatus");
  uploadStatus.textContent = "Yukleniyor...";

  const formData = new FormData();
  formData.append("file", file);

  try {
    const headers = { "Bypass-Tunnel-Reminder": "true" };
    if (state.token) headers["x-admin-token"] = state.token;
    const resp = await fetch("api/admin/knowledge/upload", { method: "POST", headers, body: formData });
    const payload = await resp.json();
    if (!resp.ok) throw new Error(payload.error || "Upload hatasi");
    uploadStatus.textContent = "Tamamlandi: " + (payload.chunksAdded || 0) + " parca eklendi";
    showToast("Dosya yuklendi ve islendi.", "success");
    setTimeout(() => { uploadStatus.textContent = ""; }, 5000);
    await loadKnowledgeBase();
  } catch (err) {
    uploadStatus.textContent = "Hata!";
    showToast("Upload hatasi: " + err.message, "error");
  }
  event.target.value = "";
});

// ══════════════════════════════════════════════════════════════════════════
// WEBHOOKS
// ══════════════════════════════════════════════════════════════════════════

async function loadWebhooks() {
  try {
    const payload = await apiGet("admin/webhooks");
    renderWebhooksTable(payload.webhooks || []);
  } catch (err) {
    $("webhooksTableBody").innerHTML = '<tr><td colspan="4" class="empty">Hata: ' + escapeHtml(err.message) + "</td></tr>";
  }
}

function renderWebhooksTable(hooks) {
  const tbody = $("webhooksTableBody");
  if (!hooks.length) {
    tbody.innerHTML = '<tr><td colspan="4" class="empty">Webhook yok.</td></tr>';
    return;
  }
  tbody.innerHTML = "";
  for (const h of hooks) {
    const tr = document.createElement("tr");
    tr.innerHTML =
      '<td class="issue-cell">' + escapeHtml(h.url || "-") + "</td>" +
      "<td>" + escapeHtml((h.events || []).join(", ")) + "</td>" +
      '<td><span class="status-dot ' + (h.active ? "active" : "inactive") + '"></span>' + (h.active ? "Aktif" : "Pasif") + "</td>" +
      '<td>' +
        '<button class="btn btn-sm btn-secondary wh-toggle-btn" data-id="' + escapeHtml(h.id) + '" data-active="' + (h.active ? "1" : "0") + '">' + (h.active ? "Durdur" : "Etkinlestir") + '</button> ' +
        '<button class="btn btn-sm btn-primary wh-test-btn" data-id="' + escapeHtml(h.id) + '">Test</button> ' +
        '<button class="btn btn-sm btn-danger wh-delete-btn" data-id="' + escapeHtml(h.id) + '">Sil</button>' +
      '</td>';
    tbody.appendChild(tr);
  }
}

$("webhookAddBtn").addEventListener("click", () => {
  $("webhookModalUrl").value = "";
  $("webhookModalEvents").value = "*";
  $("webhookModalSecret").value = "";
  $("webhookModalTitle").textContent = "Yeni Webhook";
  state.editingWebhookId = null;
  webhookModal.style.display = "";
});

$("webhookModalCancelBtn").addEventListener("click", () => { webhookModal.style.display = "none"; });

$("webhookModalSaveBtn").addEventListener("click", async () => {
  const url = $("webhookModalUrl").value.trim();
  if (!url) { showToast("URL zorunludur.", "error"); return; }
  const events = $("webhookModalEvents").value.split(",").map(e => e.trim()).filter(Boolean);
  const secret = $("webhookModalSecret").value.trim();
  try {
    if (state.editingWebhookId) {
      await apiPut("admin/webhooks/" + state.editingWebhookId, { url, events, secret });
    } else {
      await apiPost("admin/webhooks", { url, events, secret });
    }
    webhookModal.style.display = "none";
    showToast("Webhook kaydedildi.", "success");
    await loadWebhooks();
  } catch (err) { showToast("Hata: " + err.message, "error"); }
});

$("webhooksTableBody").addEventListener("click", async (event) => {
  const toggleBtn = event.target.closest(".wh-toggle-btn");
  if (toggleBtn) {
    const isActive = toggleBtn.dataset.active === "1";
    try {
      await apiPut("admin/webhooks/" + toggleBtn.dataset.id, { active: !isActive });
      await loadWebhooks();
    } catch (err) { showToast("Hata: " + err.message, "error"); }
    return;
  }
  const testBtn = event.target.closest(".wh-test-btn");
  if (testBtn) {
    try {
      const payload = await apiPost("admin/webhooks/" + testBtn.dataset.id + "/test", {});
      showToast(payload.ok ? "Test basarili (HTTP " + payload.status + ")" : "Test basarisiz: " + payload.error, payload.ok ? "success" : "error");
    } catch (err) { showToast("Test hatasi: " + err.message, "error"); }
    return;
  }
  const deleteBtn = event.target.closest(".wh-delete-btn");
  if (deleteBtn) {
    const ok = await confirmAction("Bu webhook'u silmek istediginize emin misiniz?");
    if (!ok) return;
    try {
      await apiDelete("admin/webhooks/" + deleteBtn.dataset.id);
      showToast("Webhook silindi.", "success");
      await loadWebhooks();
    } catch (err) { showToast("Hata: " + err.message, "error"); }
  }
});

// ══════════════════════════════════════════════════════════════════════════
// PROMPT VERSIONS
// ══════════════════════════════════════════════════════════════════════════

async function loadPromptVersions() {
  try {
    const payload = await apiGet("admin/prompt-versions");
    renderPromptVersions(payload.versions || []);
  } catch (err) {
    $("promptVersionsTableBody").innerHTML = '<tr><td colspan="4" class="empty">Hata: ' + escapeHtml(err.message) + "</td></tr>";
  }
}

function renderPromptVersions(versions) {
  const tbody = $("promptVersionsTableBody");
  if (!versions.length) {
    tbody.innerHTML = '<tr><td colspan="4" class="empty">Henuz versiyon yok.</td></tr>';
    return;
  }
  tbody.innerHTML = "";
  // Show newest first
  const sorted = [...versions].reverse();
  for (const v of sorted) {
    const tr = document.createElement("tr");
    tr.innerHTML =
      "<td>" + escapeHtml(v.filename || "-") + "</td>" +
      "<td>" + fmtDate(v.savedAt) + "</td>" +
      "<td>" + (v.content ? v.content.length : 0) + " karakter</td>" +
      '<td><button class="btn btn-sm btn-secondary pv-rollback-btn" data-id="' + escapeHtml(v.id) + '">Geri Al</button></td>';
    tbody.appendChild(tr);
  }
}

$("promptVersionsTableBody").addEventListener("click", async (event) => {
  const btn = event.target.closest(".pv-rollback-btn");
  if (!btn) return;
  const ok = await confirmAction("Bu versiyona geri donmek istediginize emin misiniz?");
  if (!ok) return;
  try {
    const payload = await apiPost("admin/prompt-versions/" + btn.dataset.id + "/rollback", {});
    showToast(payload.message || "Geri alindi.", "success");
    await loadPromptVersions();
  } catch (err) { showToast("Hata: " + err.message, "error"); }
});

// ══════════════════════════════════════════════════════════════════════════
// ANALYTICS
// ══════════════════════════════════════════════════════════════════════════

async function loadAnalytics() {
  const range = $("analyticsRange").value;
  try {
    const payload = await apiGet("admin/analytics?range=" + range);
    renderAnalyticsSummary(payload.summary || {});
    renderAnalyticsChart(payload.daily || []);
    renderTopTopics(payload.topTopics || []);
    renderContentGaps();
  } catch (err) {
    $("analyticsSummary").innerHTML = '<article class="summary-card"><div class="label">Hata</div><div class="value">' + escapeHtml(err.message) + "</div></article>";
  }
}

function renderAnalyticsSummary(summary) {
  const grid = $("analyticsSummary");
  grid.innerHTML = "";
  const sentiments = summary.sentimentCounts || {};
  const sentimentText = Object.entries(sentiments).map(([k, v]) => k + ": " + v).join(", ") || "-";
  const cards = [
    ["Toplam Sohbet", summary.totalChats || 0],
    ["AI Cagri", summary.aiCalls || 0],
    ["Ort. Yanit Suresi", (summary.avgResponseMs || 0) + "ms"],
    ["Eskalasyon Orani", "%" + (summary.escalationRate || 0)],
    ["Deflection Rate", "%" + (summary.deflectionRate || 0)],
    ["CSAT Ortalamasi", summary.csatAverage ? summary.csatAverage + "/5" : "-"],
    ["Model Fallback", summary.fallbackCount || 0],
    ["Feedback", (summary.feedbackUp || 0) + " / " + (summary.feedbackDown || 0)],
    ["Duygu Dagilimi", sentimentText]
  ];
  for (const [label, value] of cards) {
    grid.appendChild(createSummaryCard(label, value));
  }
}

function renderAnalyticsChart(daily) {
  const container = $("analyticsChart");
  container.innerHTML = "";
  if (!daily.length) {
    container.innerHTML = "<p class='empty'>Veri yok.</p>";
    return;
  }

  const maxChats = Math.max(...daily.map(d => d.totalChats || 0), 1);
  const chartHeight = 200;
  const barWidth = Math.max(20, Math.min(60, Math.floor(800 / daily.length) - 4));
  const svgWidth = daily.length * (barWidth + 4) + 40;

  let svg = '<svg width="' + svgWidth + '" height="' + (chartHeight + 40) + '" style="overflow-x:auto">';
  // Grid lines
  for (let i = 0; i <= 4; i++) {
    const y = chartHeight - (i / 4) * chartHeight;
    svg += '<line x1="30" y1="' + y + '" x2="' + svgWidth + '" y2="' + y + '" stroke="#ced9e2" stroke-dasharray="4"/>';
    svg += '<text x="0" y="' + (y + 4) + '" font-size="11" fill="#5c6f7f">' + Math.round((i / 4) * maxChats) + '</text>';
  }

  daily.forEach((d, i) => {
    const x = 35 + i * (barWidth + 4);
    const height = ((d.totalChats || 0) / maxChats) * chartHeight;
    const y = chartHeight - height;
    svg += '<rect x="' + x + '" y="' + y + '" width="' + barWidth + '" height="' + height + '" fill="var(--primary)" rx="3"/>';
    svg += '<text x="' + (x + barWidth / 2) + '" y="' + (chartHeight + 16) + '" font-size="10" fill="#5c6f7f" text-anchor="middle">' + d.date.slice(5) + '</text>';
    svg += '<text x="' + (x + barWidth / 2) + '" y="' + (y - 4) + '" font-size="10" fill="var(--text)" text-anchor="middle">' + (d.totalChats || 0) + '</text>';
  });

  svg += '</svg>';
  container.innerHTML = svg;
}

function renderTopTopics(topics) {
  const tbody = $("topTopicsTableBody");
  if (!topics.length) {
    tbody.innerHTML = '<tr><td colspan="3" class="empty">Konu verisi yok.</td></tr>';
    return;
  }
  tbody.innerHTML = "";
  topics.forEach((t, i) => {
    const tr = document.createElement("tr");
    tr.innerHTML = "<td>" + (i + 1) + "</td><td>" + escapeHtml(t.topicId || "-") + "</td><td>" + (t.count || 0) + "</td>";
    tbody.appendChild(tr);
  });
}

async function renderContentGaps() {
  const container = $("contentGapsSection");
  if (!container) return;
  try {
    const payload = await apiGet("admin/content-gaps");
    const gaps = payload.gaps || [];
    if (!gaps.length) {
      container.innerHTML = "<p class='empty'>Cevaplanamayan soru tespit edilmedi.</p>";
      return;
    }
    let html = '<table><thead><tr><th>Soru</th><th>Tekrar</th><th>Son Gorulme</th></tr></thead><tbody>';
    for (const g of gaps.slice(0, 30)) {
      html += "<tr><td>" + escapeHtml(g.query) + "</td><td>" + g.count + "</td><td>" + fmtDate(g.lastSeen) + "</td></tr>";
    }
    html += "</tbody></table>";
    container.innerHTML = html;
  } catch (_e) {
    container.innerHTML = "<p class='empty'>Yuklenemedi.</p>";
  }
}

$("analyticsRange").addEventListener("change", () => { void loadAnalytics(); });

// ══════════════════════════════════════════════════════════════════════════
// BULK ACTIONS
// ══════════════════════════════════════════════════════════════════════════

function getSelectedTicketIds() {
  return Array.from(document.querySelectorAll(".bulk-check:checked")).map(cb => cb.dataset.id);
}

function updateBulkToolbar() {
  const ids = getSelectedTicketIds();
  const toolbar = $("bulkToolbar");
  if (toolbar) {
    toolbar.hidden = ids.length === 0;
    const countEl = $("bulkSelectedCount");
    if (countEl) countEl.textContent = ids.length + " secili";
  }
}

// Delegate checkbox change events
if (ticketsTableBody) {
  ticketsTableBody.addEventListener("change", (e) => {
    if (e.target.classList.contains("bulk-check")) updateBulkToolbar();
  });
}

async function executeBulkAction(action, value) {
  const ids = getSelectedTicketIds();
  if (!ids.length) return;
  try {
    await apiPost("admin/tickets/bulk", { ticketIds: ids, action, value });
    showToast(ids.length + " ticket guncellendi.", "success");
    refreshDashboard();
  } catch (err) {
    showToast("Hata: " + err.message, "error");
  }
}

if ($("bulkCloseBtn")) $("bulkCloseBtn").addEventListener("click", () => executeBulkAction("close"));
if ($("bulkPriorityBtn")) $("bulkPriorityBtn").addEventListener("click", () => {
  const val = $("bulkPrioritySelect")?.value;
  if (val) executeBulkAction("priority", val);
});
if ($("bulkAssignBtn")) $("bulkAssignBtn").addEventListener("click", () => {
  const val = $("bulkAssignInput")?.value?.trim();
  if (val) executeBulkAction("assign", val);
});

// ══════════════════════════════════════════════════════════════════════════
// EXPORT
// ══════════════════════════════════════════════════════════════════════════

if ($("exportTicketsBtn")) {
  $("exportTicketsBtn").addEventListener("click", () => {
    const status = statusFilter?.value || "";
    const url = "api/admin/tickets/export?format=csv&status=" + encodeURIComponent(status) + "&token=" + encodeURIComponent(state.token);
    window.open(url, "_blank");
  });
}

// ══════════════════════════════════════════════════════════════════════════
// AUDIT LOG
// ══════════════════════════════════════════════════════════════════════════

async function loadAuditLog() {
  const container = $("auditLogSection");
  if (!container) return;
  try {
    const payload = await apiGet("admin/audit-log");
    const entries = payload.entries || [];
    if (!entries.length) {
      container.innerHTML = "<p class='empty'>Henuz kayit yok.</p>";
      return;
    }
    let html = '<table><thead><tr><th>Tarih</th><th>Islem</th><th>Detay</th><th>IP</th></tr></thead><tbody>';
    for (const e of entries.slice(0, 50)) {
      html += "<tr><td>" + fmtDate(e.timestamp) + "</td><td>" + escapeHtml(e.action) + "</td><td>" + escapeHtml(e.details) + "</td><td>" + escapeHtml(e.adminIp || "-") + "</td></tr>";
    }
    html += "</tbody></table>";
    container.innerHTML = html;
  } catch (_e) {
    container.innerHTML = "<p class='empty'>Yuklenemedi.</p>";
  }
}

// ══════════════════════════════════════════════════════════════════════════
// SLA TRACKING
// ══════════════════════════════════════════════════════════════════════════

async function loadSLAData() {
  const summaryEl = $("slaSummary");
  const breachesEl = $("slaBreaches");
  if (!summaryEl) return;
  try {
    const payload = await apiGet("admin/sla");
    const s = payload.summary || {};
    summaryEl.innerHTML = "";
    const cards = [
      ["Aktif Ticket", s.activeTickets || 0],
      ["Ilk Yanit Ihlali", s.firstResponseBreaches || 0],
      ["Cozum Ihlali", s.resolutionBreaches || 0],
      ["SLA Uyum", "%" + (s.slaComplianceRate || 100)],
      ["Ort. Cozum", (s.avgResolutionMin || 0) + " dk"]
    ];
    for (const [label, value] of cards) {
      summaryEl.appendChild(createSummaryCard(label, value));
    }

    // Breached tickets
    const breaches = payload.breachedTickets || [];
    if (breaches.length && breachesEl) {
      let html = '<table><thead><tr><th>Ticket</th><th>Sube</th><th>Sorun</th><th>Olusturulma</th><th>Ihlal</th></tr></thead><tbody>';
      for (const b of breaches) {
        const type = [];
        if (b.firstResponseBreach) type.push("Ilk Yanit");
        if (b.resolutionBreach) type.push("Cozum");
        html += "<tr><td>" + escapeHtml(b.id) + "</td><td>" + escapeHtml(b.branchCode || "-") + "</td><td>" + escapeHtml(b.issueSummary || "-") + "</td><td>" + fmtDate(b.createdAt) + "</td><td style='color:#ef4444;font-weight:600'>" + type.join(", ") + "</td></tr>";
      }
      html += "</tbody></table>";
      breachesEl.innerHTML = html;
    } else if (breachesEl) {
      breachesEl.innerHTML = "<p class='empty'>SLA ihlali yok.</p>";
    }
  } catch (_e) {
    summaryEl.innerHTML = "<p class='empty'>SLA verisi yuklenemedi.</p>";
  }
}

// ══════════════════════════════════════════════════════════════════════════
// SUNSHINE CONVERSATIONS CONFIG
// ══════════════════════════════════════════════════════════════════════════

async function loadSunshineConfig() {
  try {
    const payload = await apiGet("admin/sunshine-config");
    renderSunshineConfig(payload.config || {});
  } catch (error) {
    showToast("Sunshine config yuklenemedi: " + error.message, "error");
  }
}

function renderSunshineConfig(config) {
  const fields = {
    sunSubdomain: "subdomain",
    sunAppId: "appId",
    sunKeyId: "keyId",
    sunKeySecret: "keySecret",
    sunWebhookSecret: "webhookSecret",
    sunFarewellMessage: "farewellMessage"
  };

  for (const [id, key] of Object.entries(fields)) {
    const el = $(id);
    if (el) el.value = config[key] || "";
  }

  const enabledEl = $("sunEnabled");
  if (enabledEl) enabledEl.value = config.enabled ? "true" : "false";

  // Show webhook URL
  const urlEl = $("sunWebhookUrl");
  if (urlEl) {
    urlEl.textContent = window.location.origin + "/api/sunshine/webhook";
  }
}

async function saveSunshineConfig() {
  const config = {
    enabled: ($("sunEnabled") || {}).value === "true",
    subdomain: ($("sunSubdomain") || {}).value || "",
    appId: ($("sunAppId") || {}).value || "",
    keyId: ($("sunKeyId") || {}).value || "",
    keySecret: ($("sunKeySecret") || {}).value || "",
    webhookSecret: ($("sunWebhookSecret") || {}).value || "",
    farewellMessage: ($("sunFarewellMessage") || {}).value || ""
  };

  const status = $("sunSaveStatus");
  const btn = $("sunSaveBtn");
  if (status) status.textContent = "Kaydediliyor...";
  if (btn) btn.disabled = true;

  try {
    await apiPut("admin/sunshine-config", { config });
    if (status) status.textContent = "Kaydedildi";
    showToast("Sunshine ayarlari kaydedildi.", "success");
    setTimeout(() => { if (status) status.textContent = ""; }, 3000);
  } catch (error) {
    if (status) status.textContent = "Hata!";
    showToast("Kaydetme hatasi: " + error.message, "error");
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function testSunshineConnection() {
  const resultEl = $("sunTestResult");
  const btn = $("sunTestBtn");
  if (!resultEl) return;

  resultEl.style.display = "block";
  resultEl.style.background = "var(--bg)";
  resultEl.style.color = "var(--text)";
  resultEl.textContent = "Test ediliyor...";
  if (btn) btn.disabled = true;

  try {
    const payload = await apiPost("admin/sunshine-config/test", {});
    if (payload.ok) {
      resultEl.style.background = "#d4edda";
      resultEl.style.color = "#155724";
      resultEl.textContent = payload.message;
    } else {
      resultEl.style.background = "#f8d7da";
      resultEl.style.color = "#721c24";
      resultEl.textContent = payload.error || "Bilinmeyen hata";
    }
  } catch (error) {
    resultEl.style.background = "#f8d7da";
    resultEl.style.color = "#721c24";
    resultEl.textContent = "Test hatasi: " + error.message;
  } finally {
    if (btn) btn.disabled = false;
  }
}

// Sunshine event listeners
if ($("sunSaveBtn")) $("sunSaveBtn").addEventListener("click", () => { void saveSunshineConfig(); });
if ($("sunTestBtn")) $("sunTestBtn").addEventListener("click", () => { void testSunshineConnection(); });
if ($("sunCopyUrlBtn")) {
  $("sunCopyUrlBtn").addEventListener("click", () => {
    const url = ($("sunWebhookUrl") || {}).textContent || "";
    if (url && navigator.clipboard) {
      navigator.clipboard.writeText(url).then(() => showToast("Kopyalandi!", "success"));
    }
  });
}

// ── Initialization ─────────────────────────────────────────────────────────
setAutoRefresh(true);
void refreshDashboard();

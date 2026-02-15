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
  confirmResolve: null
};

// ── DOM References ─────────────────────────────────────────────────────────
const $ = (id) => document.getElementById(id);

// Header
const adminTokenInput = $("adminToken");

// Tabs
const tabBtns = document.querySelectorAll(".tab-btn");
const tabContents = document.querySelectorAll(".tab-content");

// Tab 1: Tickets
const statusFilter = $("statusFilter");
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
  else if (tabId === "tabSystem") loadSystemInfo();
}

function switchSubTab(subTabId) {
  subTabBtns.forEach((btn) => btn.classList.toggle("active", btn.dataset.subtab === subTabId));
  subTabContents.forEach((content) => content.classList.toggle("active", content.id === subTabId));

  if (subTabId === "subContentAgentFiles") loadAgentFiles();
  else if (subTabId === "subContentTopics") loadTopics();
  else if (subTabId === "subContentMemory") loadMemoryFiles();
  else if (subTabId === "subContentEnv") loadEnvConfig();
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
    ticketsTableBody.innerHTML = '<tr><td colspan="8" class="empty">Kayit yok.</td></tr>';
    return;
  }
  ticketsTableBody.innerHTML = "";
  for (const ticket of tickets) {
    const tr = document.createElement("tr");
    tr.innerHTML =
      "<td>" + escapeHtml(ticket.id || "-") + "</td>" +
      '<td><span class="status-pill ' + escapeHtml(ticket.status || "") + '">' + escapeHtml(ticket.status || "-") + "</span></td>" +
      "<td>" + escapeHtml(ticket.branchCode || "-") + "</td>" +
      '<td class="issue-cell">' + escapeHtml(ticket.issueSummary || "-") + "</td>" +
      "<td>" + fmtDate(ticket.createdAt) + "</td>" +
      "<td>" + fmtDate(ticket.updatedAt) + "</td>" +
      "<td>" + (ticket.handoffAttempts || 0) + "</td>" +
      '<td><button class="open-button" type="button" data-ticket-id="' + escapeHtml(ticket.id) + '">Ac</button></td>';
    ticketsTableBody.appendChild(tr);
  }
}

function renderTicketDetail(ticket) {
  if (!ticket) {
    ticketDetail.textContent = "Detay yok.";
    if (chatHistoryEl) chatHistoryEl.textContent = "";
    return;
  }

  const lines = [
    "ID: " + ticket.id,
    "Durum: " + ticket.status,
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
    const [summaryPayload, ticketsPayload] = await Promise.all([
      apiGet("admin/summary"),
      apiGet("admin/tickets?status=" + encodeURIComponent(statusFilter.value) + "&limit=" + encodeURIComponent(limitFilter.value))
    ]);
    renderSummary(summaryPayload.summary || {});
    renderTicketRows(ticketsPayload.tickets || []);
  } catch (error) {
    summaryGrid.innerHTML = "";
    ticketsTableBody.innerHTML = '<tr><td colspan="8" class="empty">Hata: ' + escapeHtml(error.message) + "</td></tr>";
  }
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
limitFilter.addEventListener("change", () => { void refreshDashboard(); });

// ══════════════════════════════════════════════════════════════════════════
// TAB 2: KNOWLEDGE BASE
// ══════════════════════════════════════════════════════════════════════════

async function loadKnowledgeBase() {
  try {
    const payload = await apiGet("admin/knowledge");
    const records = payload.records || [];
    kbRecordCount.textContent = records.length;
    renderKBTable(records);
  } catch (error) {
    kbTableBody.innerHTML = '<tr><td colspan="4" class="empty">Hata: ' + escapeHtml(error.message) + "</td></tr>";
  }
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
  "Model Ayarlari": ["GOOGLE_API_KEY", "GOOGLE_MODEL", "GOOGLE_MAX_OUTPUT_TOKENS", "GOOGLE_THINKING_BUDGET", "GOOGLE_REQUEST_TIMEOUT_MS"],
  "Destek Saatleri": ["SUPPORT_HOURS_ENABLED", "SUPPORT_TIMEZONE", "SUPPORT_OPEN_HOUR", "SUPPORT_CLOSE_HOUR", "SUPPORT_OPEN_DAYS"],
  "Zendesk": ["ZENDESK_ENABLED", "ZENDESK_SNIPPET_KEY", "ZENDESK_DEFAULT_TAGS"],
  "Diger": ["PORT", "ADMIN_TOKEN", "DETERMINISTIC_COLLECTION_MODE"]
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
  input.placeholder = key;

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
// TAB 4: SYSTEM
// ══════════════════════════════════════════════════════════════════════════

async function loadSystemInfo() {
  try {
    const payload = await apiGet("admin/system");
    renderSystemHealth(payload);
    renderAgentStatus(payload.agentStatus || []);
    renderKBSystemStatus(payload.knowledgeBase || {});
  } catch (error) {
    sysHealthGrid.innerHTML = '<div class="health-card"><h3>Hata</h3><div class="value">' + escapeHtml(error.message) + "</div></div>";
  }
}

function renderSystemHealth(data) {
  sysHealthGrid.innerHTML = "";
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
[kbModal, topicModal, confirmModal].forEach((modal) => {
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

// ── Initialization ─────────────────────────────────────────────────────────
setAutoRefresh(true);
void refreshDashboard();

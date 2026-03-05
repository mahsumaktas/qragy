<script>
  import { onMount } from "svelte";
  import { api } from "../../lib/api.js";
  import { showToast } from "../../lib/toast.svelte.js";
  import { t } from "../../lib/i18n.svelte.js";
  import { fmtDate, truncate } from "../../lib/format.js";
  import { getToken } from "../../lib/auth.svelte.js";
  import { translatePriority, translateSource, translateStatus } from "../../lib/labels.js";
  import LoadingSpinner from "../../components/ui/LoadingSpinner.svelte";
  import Badge from "../../components/ui/Badge.svelte";
  import Button from "../../components/ui/Button.svelte";
  import ChatBubble from "../../components/chat/ChatBubble.svelte";

  let loading = $state(false);
  let tickets = $state([]);
  let total = $state(0);
  let searchQuery = $state("");
  let statusFilter = $state("");
  let sourceFilter = $state("");
  let limitFilter = $state("100");
  let selectedTicket = $state(null);
  let debounceTimer;

  let STATUSES = $derived([
    { value: "", label: t("search.all") },
    { value: "handoff_pending", label: t("search.handoffPending") },
    { value: "queued_after_hours", label: t("search.afterHours") },
    { value: "handoff_success", label: t("search.successful") },
    { value: "handoff_failed", label: t("search.failed") },
    { value: "handoff_parent_posted", label: t("search.parentHandoff") },
    { value: "handoff_opened_no_summary", label: t("search.noSummary") },
  ]);

  const statusColors = {
    handoff_pending: "yellow",
    queued_after_hours: "purple",
    handoff_success: "green",
    handoff_failed: "red",
    handoff_parent_posted: "blue",
    handoff_opened_no_summary: "gray",
  };

  onMount(() => loadTickets());

  async function loadTickets() {
    loading = true;
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set("status", statusFilter);
      if (limitFilter) params.set("limit", limitFilter);
      if (searchQuery.trim()) params.set("q", searchQuery.trim());
      if (sourceFilter) params.set("source", sourceFilter);
      const qs = params.toString();
      const res = await api.get("admin/tickets" + (qs ? "?" + qs : ""));
      tickets = res.tickets || [];
      total = res.total || 0;
    } catch (e) {
      showToast(t("search.searchError", { msg: e.message }), "error");
    } finally {
      loading = false;
    }
  }

  function handleSearch() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(loadTickets, 400);
  }

  async function openTicket(ticketId) {
    try {
      const res = await api.get("admin/tickets/" + encodeURIComponent(ticketId));
      selectedTicket = res.ticket || res;
    } catch (e) {
      showToast(t("search.loadError", { msg: e.message }), "error");
    }
  }

  // ── Ticket Actions ─────────────────────────────────────────
  let assignInput = $state("");
  let priorityInput = $state("");
  let noteInput = $state("");

  async function reloadTicket(id) {
    try {
      const res = await api.get("admin/tickets/" + encodeURIComponent(id));
      selectedTicket = res.ticket || res;
    } catch (_) { /* silent */ }
  }

  async function assignTicket() {
    if (!assignInput.trim()) return;
    try {
      await api.put("admin/tickets/" + encodeURIComponent(selectedTicket.id) + "/assign", { assignedTo: assignInput.trim() });
      showToast(t("search.assigned", { name: assignInput.trim() }), "success");
      assignInput = "";
      await reloadTicket(selectedTicket.id);
    } catch (e) {
      showToast(t("search.assignError", { msg: e.message }), "error");
    }
  }

  async function changePriority() {
    if (!priorityInput) return;
    try {
      await api.put("admin/tickets/" + encodeURIComponent(selectedTicket.id) + "/priority", { priority: priorityInput });
      showToast(t("search.priorityChanged", { val: priorityInput }), "success");
      priorityInput = "";
      await reloadTicket(selectedTicket.id);
    } catch (e) {
      showToast(t("search.priorityError", { msg: e.message }), "error");
    }
  }

  async function addNote() {
    if (!noteInput.trim()) return;
    try {
      await api.post("admin/tickets/" + encodeURIComponent(selectedTicket.id) + "/notes", { note: noteInput.trim() });
      showToast(t("search.noteAdded"), "success");
      noteInput = "";
      await reloadTicket(selectedTicket.id);
    } catch (e) {
      showToast(t("search.noteError", { msg: e.message }), "error");
    }
  }

  function exportCsv() {
    const params = new URLSearchParams({ format: "csv", token: getToken() });
    if (statusFilter) params.set("status", statusFilter);
    window.open("../api/admin/tickets/export?" + params.toString(), "_blank");
  }
</script>

<div class="page-header">
  <div>
    <h1>{t("search.title")}</h1>
    <p>{t("search.subtitle", { n: total })}</p>
  </div>
  <div class="header-actions">
    <Button onclick={exportCsv} variant="ghost" size="sm">{t("search.downloadCsv")}</Button>
  </div>
</div>

<div class="filters">
  <input
    class="input search-input"
    type="text"
    placeholder={t("search.placeholder")}
    bind:value={searchQuery}
    oninput={handleSearch}
  />
  <select class="select" bind:value={statusFilter} onchange={loadTickets}>
    {#each STATUSES as s}
      <option value={s.value}>{s.label}</option>
    {/each}
  </select>
  <select class="select" bind:value={sourceFilter} onchange={loadTickets}>
    <option value="">{t("search.allSources")}</option>
    <option value="web">{t("search.web")}</option>
    <option value="whatsapp">{t("search.whatsapp")}</option>
    <option value="zendesk">{t("search.zendeskSource")}</option>
  </select>
  <select class="select" bind:value={limitFilter} onchange={loadTickets}>
    <option value="50">50</option>
    <option value="100">100</option>
    <option value="200">200</option>
    <option value="500">500</option>
  </select>
</div>

{#if loading}
  <LoadingSpinner message={t("search.searching")} />
{:else if selectedTicket}
  <div class="detail-view">
    <Button onclick={() => (selectedTicket = null)} variant="ghost" size="sm">{t("common.back")}</Button>
    <div class="detail-header">
      <h2>{selectedTicket.id}</h2>
      <Badge variant={statusColors[selectedTicket.status] || "gray"}>{translateStatus(selectedTicket.status)}</Badge>
    </div>
    <div class="ticket-actions">
      <div class="action-group">
        <label for="ticket-assign-input">{t("search.assign")}</label>
        <div class="action-row">
          <input id="ticket-assign-input" class="input action-input" type="text" placeholder={t("search.agentName")} bind:value={assignInput} />
          <Button onclick={assignTicket} variant="primary" size="sm">{t("search.assign")}</Button>
        </div>
      </div>
      <div class="action-group">
        <label for="ticket-priority-input">{t("search.priority")}</label>
        <div class="action-row">
          <select id="ticket-priority-input" class="select" bind:value={priorityInput}>
            <option value="">{t("search.selectPriority")}</option>
            <option value="low">{t("search.low")}</option>
            <option value="normal">{t("search.normal")}</option>
            <option value="high">{t("search.high")}</option>
          </select>
          <Button onclick={changePriority} variant="primary" size="sm">{t("search.change")}</Button>
        </div>
      </div>
      <div class="action-group">
        <label for="ticket-note-input">{t("search.addNote")}</label>
        <div class="action-row">
          <textarea id="ticket-note-input" class="input action-textarea" placeholder={t("search.notePlaceholder")} bind:value={noteInput} rows="2"></textarea>
          <Button onclick={addNote} variant="primary" size="sm">{t("common.add")}</Button>
        </div>
      </div>
    </div>
    <div class="detail-grid">
      <div class="info-card">
        <h3>{t("search.details")}</h3>
        <div class="info-row"><span>{t("search.branchCode")}</span><span>{selectedTicket.branchCode || "-"}</span></div>
        <div class="info-row"><span>{t("search.company")}</span><span>{selectedTicket.companyName || "-"}</span></div>
        <div class="info-row"><span>{t("search.fullName")}</span><span>{selectedTicket.fullName || "-"}</span></div>
        <div class="info-row"><span>{t("search.phone")}</span><span>{selectedTicket.phone || "-"}</span></div>
        <div class="info-row"><span>{t("search.source")}</span><span>{selectedTicket.source ? translateSource(selectedTicket.source) : "-"}</span></div>
        <div class="info-row"><span>{t("search.priority")}</span><span>{translatePriority(selectedTicket.priority)}</span></div>
        <div class="info-row"><span>{t("search.assignedTo")}</span><span>{selectedTicket.assignedTo || "-"}</span></div>
        <div class="info-row"><span>{t("search.created")}</span><span>{fmtDate(selectedTicket.createdAt)}</span></div>
        <div class="info-row"><span>{t("search.summary")}</span><span>{selectedTicket.issueSummary || "-"}</span></div>
      </div>
      <div class="chat-card">
        <h3>{t("search.chatHistory")}</h3>
        {#each selectedTicket.chatHistory || [] as msg}
          <ChatBubble sender={msg.role === "user" ? "user" : "bot"} message={msg.content || ""} />
        {:else}
          <p class="no-msg">{t("common.noMessages")}</p>
        {/each}
      </div>
    </div>
    {#if selectedTicket.internalNotes?.length}
      <div class="info-card">
        <h3>{t("search.notes")}</h3>
        {#each selectedTicket.internalNotes as note}
          <div class="note-item">
            <span class="note-meta">{note.author} &middot; {fmtDate(note.at)}</span>
            <p>{note.note}</p>
          </div>
        {/each}
      </div>
    {/if}
  </div>
{:else}
  <div class="card">
    <table>
      <thead>
        <tr>
          <th>{t("search.id")}</th>
          <th>{t("search.statusCol")}</th>
          <th>{t("search.priorityCol")}</th>
          <th>{t("search.branch")}</th>
          <th>{t("search.summaryCol")}</th>
          <th>{t("search.sourceCol")}</th>
          <th>{t("search.date")}</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {#each tickets as tk}
          <tr>
            <td class="mono">{tk.id}</td>
            <td><Badge variant={statusColors[tk.status] || "gray"}>{translateStatus(tk.status)}</Badge></td>
            <td>
              <span class="priority" class:high={tk.priority === "high"} class:low={tk.priority === "low"}>
                {translatePriority(tk.priority)}
              </span>
            </td>
            <td>{tk.branchCode || "-"}</td>
            <td>{truncate(tk.issueSummary || "", 40)}</td>
            <td>{translateSource(tk.source)}</td>
            <td>{fmtDate(tk.createdAt)}</td>
            <td><Button onclick={() => openTicket(tk.id)} variant="ghost" size="sm">{t("common.open")}</Button></td>
          </tr>
        {:else}
          <tr><td colspan="8" class="empty-row">{t("search.noResults")}</td></tr>
        {/each}
      </tbody>
    </table>
  </div>
{/if}

<style>
  .page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
  .page-header h1 { font-size: 22px; font-weight: 700; }
  .page-header p { font-size: 13px; color: var(--text-muted); margin-top: 2px; }
  .header-actions { display: flex; gap: 8px; }

  .filters {
    display: flex; gap: 10px; margin-bottom: 16px; flex-wrap: wrap;
  }
  .search-input { flex: 1; min-width: 200px; }
  .input {
    padding: 8px 12px; border: 1px solid var(--border); border-radius: var(--radius-sm);
    font-size: 13px; color: var(--text); font-family: inherit; background: var(--bg-card); outline: none;
  }
  .input:focus { border-color: var(--accent); box-shadow: 0 0 0 3px rgba(37,99,235,.1); }
  .select {
    padding: 8px 12px; border: 1px solid var(--border); border-radius: var(--radius-sm);
    font-size: 13px; color: var(--text); font-family: inherit; background: var(--bg-card); cursor: pointer;
  }

  .card { background: var(--bg-card); border-radius: var(--radius); box-shadow: var(--shadow); border: 1px solid var(--border-light); overflow: hidden; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th { text-align: left; padding: 10px 12px; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: .5px; color: var(--text-muted); border-bottom: 1px solid var(--border); background: var(--bg); }
  td { padding: 10px 12px; border-bottom: 1px solid var(--border-light); color: var(--text-secondary); }
  tr:hover td { background: var(--bg-hover); }
  td:first-child { color: var(--text); font-weight: 500; }
  .empty-row { text-align: center; color: var(--text-muted); padding: 32px; }
  .mono { font-family: "JetBrains Mono", monospace; font-size: 12px; }

  .priority { font-size: 11px; font-weight: 600; }
  .priority.high { color: var(--error); }
  .priority.low { color: var(--text-muted); }

  .detail-view { display: flex; flex-direction: column; gap: 16px; }
  .detail-header { display: flex; align-items: center; gap: 10px; }
  .detail-header h2 { font-size: 18px; font-weight: 700; }
  .detail-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
  .info-card, .chat-card { background: var(--bg-card); border-radius: var(--radius); padding: 16px; box-shadow: var(--shadow); border: 1px solid var(--border-light); }
  .info-card h3, .chat-card h3 { font-size: 13px; font-weight: 600; margin-bottom: 10px; }
  .info-row { display: flex; justify-content: space-between; padding: 4px 0; font-size: 12px; border-bottom: 1px solid var(--border-light); }
  .info-row span:first-child { color: var(--text-muted); }
  .no-msg { text-align: center; color: var(--text-muted); font-size: 13px; padding: 20px; }
  .note-item { padding: 8px 0; border-bottom: 1px solid var(--border-light); }
  .note-meta { font-size: 11px; color: var(--text-muted); }
  .note-item p { font-size: 13px; margin-top: 4px; }

  .ticket-actions { display: flex; gap: 16px; flex-wrap: wrap; padding: 12px 16px; background: var(--bg-card); border-radius: var(--radius); border: 1px solid var(--border-light); box-shadow: var(--shadow); }
  .action-group { display: flex; flex-direction: column; gap: 4px; min-width: 180px; flex: 1; }
  .action-group label { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: .5px; color: var(--text-muted); }
  .action-row { display: flex; gap: 6px; align-items: flex-start; }
  .action-input { flex: 1; min-width: 0; }
  .action-textarea { flex: 1; min-width: 0; resize: vertical; font-family: inherit; font-size: 13px; }
</style>

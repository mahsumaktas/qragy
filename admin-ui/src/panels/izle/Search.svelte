<script>
  import { onMount } from "svelte";
  import { api } from "../../lib/api.js";
  import { showToast } from "../../lib/toast.svelte.js";
  import { fmtDate, truncate } from "../../lib/format.js";
  import { getToken } from "../../lib/auth.svelte.js";
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

  const STATUSES = [
    { value: "", label: "All" },
    { value: "handoff_pending", label: "Handoff Pending" },
    { value: "queued_after_hours", label: "After Hours" },
    { value: "handoff_success", label: "Successful" },
    { value: "handoff_failed", label: "Failed" },
    { value: "handoff_parent_posted", label: "Parent Handoff" },
    { value: "handoff_opened_no_summary", label: "No Summary" },
  ];

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
      showToast("Search error: " + e.message, "error");
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
      showToast("Failed to load ticket: " + e.message, "error");
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
      showToast("Assigned: " + assignInput.trim(), "success");
      assignInput = "";
      await reloadTicket(selectedTicket.id);
    } catch (e) {
      showToast("Assignment error: " + e.message, "error");
    }
  }

  async function changePriority() {
    if (!priorityInput) return;
    try {
      await api.put("admin/tickets/" + encodeURIComponent(selectedTicket.id) + "/priority", { priority: priorityInput });
      showToast("Priority changed: " + priorityInput, "success");
      priorityInput = "";
      await reloadTicket(selectedTicket.id);
    } catch (e) {
      showToast("Priority error: " + e.message, "error");
    }
  }

  async function addNote() {
    if (!noteInput.trim()) return;
    try {
      await api.post("admin/tickets/" + encodeURIComponent(selectedTicket.id) + "/notes", { note: noteInput.trim() });
      showToast("Note added", "success");
      noteInput = "";
      await reloadTicket(selectedTicket.id);
    } catch (e) {
      showToast("Note error: " + e.message, "error");
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
    <h1>Search</h1>
    <p>Search and filter tickets ({total} results)</p>
  </div>
  <div class="header-actions">
    <Button onclick={exportCsv} variant="ghost" size="sm">Download CSV</Button>
  </div>
</div>

<div class="filters">
  <input
    class="input search-input"
    type="text"
    placeholder="Search ID, name, summary, phone..."
    bind:value={searchQuery}
    oninput={handleSearch}
  />
  <select class="select" bind:value={statusFilter} onchange={loadTickets}>
    {#each STATUSES as s}
      <option value={s.value}>{s.label}</option>
    {/each}
  </select>
  <select class="select" bind:value={sourceFilter} onchange={loadTickets}>
    <option value="">All Sources</option>
    <option value="web">Web</option>
    <option value="whatsapp">WhatsApp</option>
    <option value="zendesk">Zendesk</option>
  </select>
  <select class="select" bind:value={limitFilter} onchange={loadTickets}>
    <option value="50">50</option>
    <option value="100">100</option>
    <option value="200">200</option>
    <option value="500">500</option>
  </select>
</div>

{#if loading}
  <LoadingSpinner message="Searching..." />
{:else if selectedTicket}
  <div class="detail-view">
    <Button onclick={() => (selectedTicket = null)} variant="ghost" size="sm">← Back to List</Button>
    <div class="detail-header">
      <h2>{selectedTicket.id}</h2>
      <Badge variant={statusColors[selectedTicket.status] || "gray"}>{selectedTicket.status?.replace(/_/g, " ")}</Badge>
    </div>
    <div class="ticket-actions">
      <div class="action-group">
        <label>Assign</label>
        <div class="action-row">
          <input class="input action-input" type="text" placeholder="Agent name" bind:value={assignInput} />
          <Button onclick={assignTicket} variant="primary" size="sm">Assign</Button>
        </div>
      </div>
      <div class="action-group">
        <label>Priority</label>
        <div class="action-row">
          <select class="select" bind:value={priorityInput}>
            <option value="">Select...</option>
            <option value="low">Low</option>
            <option value="normal">Normal</option>
            <option value="high">High</option>
          </select>
          <Button onclick={changePriority} variant="primary" size="sm">Change</Button>
        </div>
      </div>
      <div class="action-group">
        <label>Add Note</label>
        <div class="action-row">
          <textarea class="input action-textarea" placeholder="Internal note..." bind:value={noteInput} rows="2"></textarea>
          <Button onclick={addNote} variant="primary" size="sm">Add</Button>
        </div>
      </div>
    </div>
    <div class="detail-grid">
      <div class="info-card">
        <h3>Details</h3>
        <div class="info-row"><span>Branch Code</span><span>{selectedTicket.branchCode || "-"}</span></div>
        <div class="info-row"><span>Company</span><span>{selectedTicket.companyName || "-"}</span></div>
        <div class="info-row"><span>Full Name</span><span>{selectedTicket.fullName || "-"}</span></div>
        <div class="info-row"><span>Phone</span><span>{selectedTicket.phone || "-"}</span></div>
        <div class="info-row"><span>Source</span><span>{selectedTicket.source || "-"}</span></div>
        <div class="info-row"><span>Priority</span><span>{selectedTicket.priority || "normal"}</span></div>
        <div class="info-row"><span>Assigned To</span><span>{selectedTicket.assignedTo || "-"}</span></div>
        <div class="info-row"><span>Created</span><span>{fmtDate(selectedTicket.createdAt)}</span></div>
        <div class="info-row"><span>Summary</span><span>{selectedTicket.issueSummary || "-"}</span></div>
      </div>
      <div class="chat-card">
        <h3>Chat History</h3>
        {#each selectedTicket.chatHistory || [] as msg}
          <ChatBubble sender={msg.role === "user" ? "user" : "bot"} message={msg.content || ""} />
        {:else}
          <p class="no-msg">No messages</p>
        {/each}
      </div>
    </div>
    {#if selectedTicket.internalNotes?.length}
      <div class="info-card">
        <h3>Notes</h3>
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
          <th>ID</th>
          <th>Status</th>
          <th>Priority</th>
          <th>Branch</th>
          <th>Summary</th>
          <th>Source</th>
          <th>Date</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {#each tickets as t}
          <tr>
            <td class="mono">{t.id}</td>
            <td><Badge variant={statusColors[t.status] || "gray"}>{t.status?.replace(/_/g, " ")}</Badge></td>
            <td>
              <span class="priority" class:high={t.priority === "high"} class:low={t.priority === "low"}>
                {t.priority || "normal"}
              </span>
            </td>
            <td>{t.branchCode || "-"}</td>
            <td>{truncate(t.issueSummary || "", 40)}</td>
            <td>{t.source || "web"}</td>
            <td>{fmtDate(t.createdAt)}</td>
            <td><Button onclick={() => openTicket(t.id)} variant="ghost" size="sm">Open</Button></td>
          </tr>
        {:else}
          <tr><td colspan="8" class="empty-row">No results found</td></tr>
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

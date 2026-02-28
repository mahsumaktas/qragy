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
    { value: "", label: "Tumu" },
    { value: "handoff_pending", label: "Aktarim Bekleyen" },
    { value: "queued_after_hours", label: "Mesai Disi" },
    { value: "handoff_success", label: "Basarili" },
    { value: "handoff_failed", label: "Basarisiz" },
    { value: "handoff_parent_posted", label: "Parent Aktarim" },
    { value: "handoff_opened_no_summary", label: "Ozetsiz" },
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
      showToast("Arama hatasi: " + e.message, "error");
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
      showToast("Ticket yuklenemedi: " + e.message, "error");
    }
  }

  function exportCsv() {
    const params = new URLSearchParams({ format: "csv", token: getToken() });
    if (statusFilter) params.set("status", statusFilter);
    window.open("api/admin/tickets/export?" + params.toString(), "_blank");
  }
</script>

<div class="page-header">
  <div>
    <h1>Arama</h1>
    <p>Ticket ara ve filtrele ({total} sonuc)</p>
  </div>
  <div class="header-actions">
    <Button onclick={exportCsv} variant="ghost" size="sm">CSV Indir</Button>
  </div>
</div>

<div class="filters">
  <input
    class="input search-input"
    type="text"
    placeholder="ID, isim, ozet, telefon ara..."
    bind:value={searchQuery}
    oninput={handleSearch}
  />
  <select class="select" bind:value={statusFilter} onchange={loadTickets}>
    {#each STATUSES as s}
      <option value={s.value}>{s.label}</option>
    {/each}
  </select>
  <select class="select" bind:value={sourceFilter} onchange={loadTickets}>
    <option value="">Tum Kaynaklar</option>
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
  <LoadingSpinner message="Aranıyor..." />
{:else if selectedTicket}
  <div class="detail-view">
    <Button onclick={() => (selectedTicket = null)} variant="ghost" size="sm">← Listeye Don</Button>
    <div class="detail-header">
      <h2>{selectedTicket.id}</h2>
      <Badge variant={statusColors[selectedTicket.status] || "gray"}>{selectedTicket.status?.replace(/_/g, " ")}</Badge>
    </div>
    <div class="detail-grid">
      <div class="info-card">
        <h3>Bilgiler</h3>
        <div class="info-row"><span>Sube Kodu</span><span>{selectedTicket.branchCode || "-"}</span></div>
        <div class="info-row"><span>Firma</span><span>{selectedTicket.companyName || "-"}</span></div>
        <div class="info-row"><span>Ad Soyad</span><span>{selectedTicket.fullName || "-"}</span></div>
        <div class="info-row"><span>Telefon</span><span>{selectedTicket.phone || "-"}</span></div>
        <div class="info-row"><span>Kaynak</span><span>{selectedTicket.source || "-"}</span></div>
        <div class="info-row"><span>Oncelik</span><span>{selectedTicket.priority || "normal"}</span></div>
        <div class="info-row"><span>Atanan</span><span>{selectedTicket.assignedTo || "-"}</span></div>
        <div class="info-row"><span>Olusturma</span><span>{fmtDate(selectedTicket.createdAt)}</span></div>
        <div class="info-row"><span>Ozet</span><span>{selectedTicket.issueSummary || "-"}</span></div>
      </div>
      <div class="chat-card">
        <h3>Sohbet Gecmisi</h3>
        {#each selectedTicket.chatHistory || [] as msg}
          <ChatBubble sender={msg.role === "user" ? "user" : "bot"} message={msg.content || ""} />
        {:else}
          <p class="no-msg">Mesaj yok</p>
        {/each}
      </div>
    </div>
    {#if selectedTicket.internalNotes?.length}
      <div class="info-card">
        <h3>Notlar</h3>
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
          <th>Durum</th>
          <th>Oncelik</th>
          <th>Sube</th>
          <th>Ozet</th>
          <th>Kaynak</th>
          <th>Tarih</th>
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
            <td><Button onclick={() => openTicket(t.id)} variant="ghost" size="sm">Ac</Button></td>
          </tr>
        {:else}
          <tr><td colspan="8" class="empty-row">Sonuc bulunamadi</td></tr>
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
</style>

<script>
  import { onMount } from "svelte";
  import { api } from "../../lib/api.js";
  import { showToast } from "../../lib/toast.svelte.js";
  import { showConfirm } from "../../lib/confirm.svelte.js";
  import Button from "../../components/ui/Button.svelte";
  import Modal from "../../components/ui/Modal.svelte";
  import Badge from "../../components/ui/Badge.svelte";
  import Toggle from "../../components/ui/Toggle.svelte";
  import LoadingSpinner from "../../components/ui/LoadingSpinner.svelte";

  let loading = $state(true);
  let webhooks = $state([]);
  let editOpen = $state(false);
  let editHook = $state({ url: "", events: [], secret: "" });
  let editId = $state(null);

  const EVENT_OPTIONS = ["ticket.created", "ticket.updated", "ticket.closed", "conversation.started", "conversation.closed", "escalation.requested"];

  onMount(() => loadWebhooks());

  async function loadWebhooks() {
    loading = true;
    try {
      const res = await api.get("admin/webhooks");
      webhooks = res.webhooks || res || [];
    } catch (e) {
      showToast("Webhooks yuklenemedi: " + e.message, "error");
    } finally {
      loading = false;
    }
  }

  function openNew() {
    editId = null;
    editHook = { url: "", events: [], secret: "" };
    editOpen = true;
  }

  function openEdit(w) {
    editId = w.id || w._id;
    editHook = { url: w.url, events: [...(w.events || [])], secret: w.secret || "" };
    editOpen = true;
  }

  async function save() {
    if (!editHook.url.trim()) return;
    try {
      if (editId) {
        await api.put("admin/webhooks/" + editId, editHook);
      } else {
        await api.post("admin/webhooks", editHook);
      }
      showToast("Kaydedildi", "success");
      editOpen = false;
      await loadWebhooks();
    } catch (e) {
      showToast("Hata: " + e.message, "error");
    }
  }

  async function deleteHook(id) {
    const ok = await showConfirm({ title: "Sil", message: "Bu webhook silinecek.", confirmText: "Sil", danger: true });
    if (!ok) return;
    try {
      await api.delete("admin/webhooks/" + id);
      showToast("Silindi", "success");
      await loadWebhooks();
    } catch (e) {
      showToast("Hata: " + e.message, "error");
    }
  }

  async function testHook(id) {
    try {
      await api.post("admin/webhooks/" + id + "/test", {});
      showToast("Test gonderildi", "success");
    } catch (e) {
      showToast("Test hatasi: " + e.message, "error");
    }
  }

  async function toggleActive(w) {
    try {
      await api.put("admin/webhooks/" + (w.id || w._id), { active: !w.active });
      await loadWebhooks();
    } catch (e) {
      showToast("Hata: " + e.message, "error");
    }
  }

  function toggleEvent(ev) {
    if (editHook.events.includes(ev)) {
      editHook.events = editHook.events.filter((e) => e !== ev);
    } else {
      editHook.events = [...editHook.events, ev];
    }
  }
</script>

<div class="page-header">
  <div><h1>Webhooks</h1><p>{webhooks.length} webhook</p></div>
  <Button onclick={openNew} variant="primary" size="sm">+ Yeni Webhook</Button>
</div>

{#if loading}
  <LoadingSpinner message="Yukleniyor..." />
{:else}
  <div class="card">
    <table>
      <thead><tr><th>URL</th><th>Eventler</th><th>Durum</th><th></th></tr></thead>
      <tbody>
        {#each webhooks as w}
          <tr>
            <td class="mono">{w.url}</td>
            <td>{(w.events || []).join(", ")}</td>
            <td><Badge variant={w.active !== false ? "green" : "gray"}>{w.active !== false ? "aktif" : "pasif"}</Badge></td>
            <td class="actions">
              <Button onclick={() => testHook(w.id || w._id)} variant="ghost" size="sm">Test</Button>
              <Button onclick={() => openEdit(w)} variant="ghost" size="sm">Duzenle</Button>
              <Button onclick={() => deleteHook(w.id || w._id)} variant="ghost" size="sm">Sil</Button>
            </td>
          </tr>
        {:else}
          <tr><td colspan="4" class="empty-row">Webhook yok</td></tr>
        {/each}
      </tbody>
    </table>
  </div>
{/if}

<Modal bind:open={editOpen} title={editId ? "Webhook Duzenle" : "Yeni Webhook"}>
  <div class="form-group"><span class="lbl">URL</span><input class="input" bind:value={editHook.url} placeholder="https://..." /></div>
  <div class="form-group"><span class="lbl">Secret</span><input class="input" bind:value={editHook.secret} placeholder="Opsiyonel" /></div>
  <div class="form-group">
    <span class="lbl">Eventler</span>
    <div class="event-checks">
      {#each EVENT_OPTIONS as ev}
        <!-- svelte-ignore a11y_label_has_associated_control -->
        <label class="check-item">
          <input type="checkbox" checked={editHook.events.includes(ev)} onchange={() => toggleEvent(ev)} />
          {ev}
        </label>
      {/each}
    </div>
  </div>
  <div class="modal-actions">
    <Button onclick={() => (editOpen = false)} variant="secondary">Iptal</Button>
    <Button onclick={save} variant="primary">Kaydet</Button>
  </div>
</Modal>

<style>
  .page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
  .page-header h1 { font-size: 22px; font-weight: 700; }
  .page-header p { font-size: 13px; color: var(--text-muted); margin-top: 2px; }
  .card { background: var(--bg-card); border-radius: var(--radius); box-shadow: var(--shadow); border: 1px solid var(--border-light); overflow: hidden; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th { text-align: left; padding: 10px 12px; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: .5px; color: var(--text-muted); border-bottom: 1px solid var(--border); background: var(--bg); }
  td { padding: 10px 12px; border-bottom: 1px solid var(--border-light); color: var(--text-secondary); }
  .mono { font-family: "JetBrains Mono", monospace; font-size: 12px; }
  .actions { display: flex; gap: 4px; }
  .empty-row { text-align: center; color: var(--text-muted); padding: 32px; }
  .form-group { margin-bottom: 14px; display: flex; flex-direction: column; gap: 4px; }
  .lbl { font-size: 12px; font-weight: 600; color: var(--text-secondary); }
  .input { width: 100%; padding: 8px 12px; border: 1px solid var(--border); border-radius: var(--radius-sm); font-size: 13px; font-family: inherit; color: var(--text); outline: none; }
  .event-checks { display: flex; flex-wrap: wrap; gap: 8px; }
  .check-item { display: flex; align-items: center; gap: 4px; font-size: 12px; cursor: pointer; }
  .modal-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 16px; }
</style>

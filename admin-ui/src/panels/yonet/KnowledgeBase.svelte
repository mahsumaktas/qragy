<script>
  import { onMount } from "svelte";
  import { api } from "../../lib/api.js";
  import { showToast } from "../../lib/toast.svelte.js";
  import { showConfirm } from "../../lib/confirm.svelte.js";
  import { fmtDate, truncate } from "../../lib/format.js";
  import Button from "../../components/ui/Button.svelte";
  import Modal from "../../components/ui/Modal.svelte";
  import FileUpload from "../../components/ui/FileUpload.svelte";
  import LoadingSpinner from "../../components/ui/LoadingSpinner.svelte";

  let loading = $state(true);
  let items = $state([]);
  let addOpen = $state(false);
  let uploadOpen = $state(false);
  let newQuestion = $state("");
  let newAnswer = $state("");
  let importUrl = $state("");

  onMount(() => loadKB());

  async function loadKB() {
    loading = true;
    try {
      const res = await api.get("admin/knowledge");
      items = res.items || res.knowledge || res || [];
      if (!Array.isArray(items)) items = [];
    } catch (e) {
      showToast("Bilgi tabani yuklenemedi: " + e.message, "error");
    } finally {
      loading = false;
    }
  }

  async function addEntry() {
    if (!newQuestion.trim() || !newAnswer.trim()) return;
    try {
      await api.post("admin/knowledge", { question: newQuestion.trim(), answer: newAnswer.trim() });
      showToast("Eklendi", "success");
      newQuestion = "";
      newAnswer = "";
      addOpen = false;
      await loadKB();
    } catch (e) {
      showToast("Hata: " + e.message, "error");
    }
  }

  async function deleteEntry(id) {
    const ok = await showConfirm({ title: "Sil", message: "Bu kayit silinecek. Emin misiniz?", confirmText: "Sil", danger: true });
    if (!ok) return;
    try {
      await api.delete("admin/knowledge/" + id);
      showToast("Silindi", "success");
      await loadKB();
    } catch (e) {
      showToast("Hata: " + e.message, "error");
    }
  }

  async function handleUpload(files) {
    const formData = new FormData();
    for (const f of files) formData.append("files", f);
    try {
      await api.uploadForm("admin/knowledge/upload-batch", formData);
      showToast(files.length + " dosya yuklendi", "success");
      uploadOpen = false;
      await loadKB();
    } catch (e) {
      showToast("Yukleme hatasi: " + e.message, "error");
    }
  }

  async function handleImportUrl() {
    if (!importUrl.trim()) return;
    try {
      await api.post("admin/knowledge/import-url", { url: importUrl.trim() });
      showToast("URL import edildi", "success");
      importUrl = "";
      await loadKB();
    } catch (e) {
      showToast("Import hatasi: " + e.message, "error");
    }
  }

  async function reingest() {
    try {
      await api.post("admin/knowledge/reingest", {});
      showToast("Reingest basladi", "success");
    } catch (e) {
      showToast("Hata: " + e.message, "error");
    }
  }
</script>

<div class="page-header">
  <div>
    <h1>Bilgi Tabani</h1>
    <p>{items.length} kayit</p>
  </div>
  <div class="header-actions">
    <Button onclick={reingest} variant="ghost" size="sm">Reingest</Button>
    <Button onclick={() => (uploadOpen = true)} variant="secondary" size="sm">Dosya Yukle</Button>
    <Button onclick={() => (addOpen = true)} variant="primary" size="sm">+ Ekle</Button>
  </div>
</div>

{#if loading}
  <LoadingSpinner message="Yukleniyor..." />
{:else}
  <div class="card">
    <table>
      <thead>
        <tr>
          <th>Soru</th>
          <th>Cevap</th>
          <th>Tarih</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {#each items as item}
          <tr>
            <td>{truncate(item.question || item.title || "", 60)}</td>
            <td>{truncate(item.answer || item.content || "", 80)}</td>
            <td>{fmtDate(item.createdAt)}</td>
            <td><Button onclick={() => deleteEntry(item.id || item._id)} variant="ghost" size="sm">Sil</Button></td>
          </tr>
        {:else}
          <tr><td colspan="4" class="empty-row">Bilgi tabani bos</td></tr>
        {/each}
      </tbody>
    </table>
  </div>
{/if}

<!-- Add Entry Modal -->
<Modal bind:open={addOpen} title="Yeni Kayit">
  <div class="form-group">
    <label>Soru
      <input class="input" bind:value={newQuestion} placeholder="Soru..." />
    </label>
  </div>
  <div class="form-group">
    <label>Cevap
      <textarea class="textarea" bind:value={newAnswer} rows="4" placeholder="Cevap..."></textarea>
    </label>
  </div>
  <div class="form-group">
    <label>URL Import
      <div class="url-row">
        <input class="input" bind:value={importUrl} placeholder="https://..." />
        <Button onclick={handleImportUrl} variant="secondary" size="sm">Import</Button>
      </div>
    </label>
  </div>
  <div class="modal-actions">
    <Button onclick={() => (addOpen = false)} variant="secondary">Iptal</Button>
    <Button onclick={addEntry} variant="primary">Kaydet</Button>
  </div>
</Modal>

<!-- Upload Modal -->
<Modal bind:open={uploadOpen} title="Dosya Yukle">
  <FileUpload accept=".pdf,.docx,.xlsx,.csv,.txt" multiple onfiles={handleUpload} label="PDF, DOCX, XLSX, CSV veya TXT dosya yukleyin" />
</Modal>

<style>
  .page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
  .page-header h1 { font-size: 22px; font-weight: 700; }
  .page-header p { font-size: 13px; color: var(--text-muted); margin-top: 2px; }
  .header-actions { display: flex; gap: 8px; }

  .card { background: var(--bg-card); border-radius: var(--radius); box-shadow: var(--shadow); border: 1px solid var(--border-light); overflow: hidden; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th { text-align: left; padding: 10px 12px; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: .5px; color: var(--text-muted); border-bottom: 1px solid var(--border); background: var(--bg); }
  td { padding: 10px 12px; border-bottom: 1px solid var(--border-light); color: var(--text-secondary); }
  tr:hover td { background: var(--bg-hover); }
  .empty-row { text-align: center; color: var(--text-muted); padding: 32px; }

  .form-group { margin-bottom: 14px; }
  .form-group label { display: block; font-size: 12px; font-weight: 600; color: var(--text-secondary); margin-bottom: 4px; }
  .input { width: 100%; padding: 8px 12px; border: 1px solid var(--border); border-radius: var(--radius-sm); font-size: 13px; font-family: inherit; color: var(--text); }
  .input:focus { border-color: var(--accent); outline: none; }
  .textarea { width: 100%; padding: 8px 12px; border: 1px solid var(--border); border-radius: var(--radius-sm); font-size: 13px; font-family: inherit; color: var(--text); resize: vertical; }
  .url-row { display: flex; gap: 8px; }
  .modal-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 16px; }
</style>

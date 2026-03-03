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
  let editOpen = $state(false);
  let editId = $state(null);
  let editQuestion = $state("");
  let editAnswer = $state("");
  let newQuestion = $state("");
  let newAnswer = $state("");
  let importUrl = $state("");

  onMount(() => loadKB());

  async function loadKB() {
    loading = true;
    try {
      const res = await api.get("admin/knowledge");
      const data = res.payload?.records || res.items || res.knowledge || res || [];
      items = Array.isArray(data) ? data : [];
    } catch (e) {
      showToast("Failed to load knowledge base: " + e.message, "error");
    } finally {
      loading = false;
    }
  }

  async function addEntry() {
    if (!newQuestion.trim() || !newAnswer.trim()) return;
    try {
      await api.post("admin/knowledge", { question: newQuestion.trim(), answer: newAnswer.trim() });
      showToast("Added", "success");
      newQuestion = "";
      newAnswer = "";
      addOpen = false;
      await loadKB();
    } catch (e) {
      showToast("Error: " + e.message, "error");
    }
  }

  function openEditEntry(item) {
    editId = item.id || item._id;
    editQuestion = item.question || item.title || "";
    editAnswer = item.answer || item.content || "";
    editOpen = true;
  }

  async function updateEntry() {
    if (!editQuestion.trim() || !editAnswer.trim()) return;
    try {
      await api.put("admin/knowledge/" + editId, { question: editQuestion.trim(), answer: editAnswer.trim() });
      showToast("Updated", "success");
      editOpen = false;
      editId = null;
      editQuestion = "";
      editAnswer = "";
      await loadKB();
    } catch (e) {
      showToast("Error: " + e.message, "error");
    }
  }

  async function deleteEntry(id) {
    const ok = await showConfirm({ title: "Delete", message: "This entry will be deleted. Are you sure?", confirmText: "Delete", danger: true });
    if (!ok) return;
    try {
      await api.delete("admin/knowledge/" + id);
      showToast("Deleted", "success");
      await loadKB();
    } catch (e) {
      showToast("Error: " + e.message, "error");
    }
  }

  async function handleUpload(files) {
    const formData = new FormData();
    for (const f of files) formData.append("files", f);
    try {
      await api.uploadForm("admin/knowledge/upload-batch", formData);
      showToast(files.length + " files uploaded", "success");
      uploadOpen = false;
      await loadKB();
    } catch (e) {
      showToast("Upload error: " + e.message, "error");
    }
  }

  async function handleImportUrl() {
    if (!importUrl.trim()) return;
    try {
      await api.post("admin/knowledge/import-url", { url: importUrl.trim() });
      showToast("URL imported", "success");
      importUrl = "";
      await loadKB();
    } catch (e) {
      showToast("Import error: " + e.message, "error");
    }
  }

  async function reingest() {
    try {
      await api.post("admin/knowledge/reingest", {});
      showToast("Reingest started", "success");
    } catch (e) {
      showToast("Error: " + e.message, "error");
    }
  }
</script>

<div class="page-header">
  <div>
    <h1>Knowledge Base</h1>
    <p>{items.length} entries</p>
  </div>
  <div class="header-actions">
    <Button onclick={reingest} variant="ghost" size="sm">Reingest</Button>
    <Button onclick={() => (uploadOpen = true)} variant="secondary" size="sm">Upload File</Button>
    <Button onclick={() => (addOpen = true)} variant="primary" size="sm">+ Add</Button>
  </div>
</div>

{#if loading}
  <LoadingSpinner message="Loading..." />
{:else}
  <div class="card">
    <table>
      <thead>
        <tr>
          <th>Question</th>
          <th>Answer</th>
          <th>Date</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {#each items as item}
          <tr>
            <td>{truncate(item.question || item.title || "", 60)}</td>
            <td>{truncate(item.answer || item.content || "", 80)}</td>
            <td>{fmtDate(item.createdAt)}</td>
            <td class="actions">
              <Button onclick={() => openEditEntry(item)} variant="ghost" size="sm">Edit</Button>
              <Button onclick={() => deleteEntry(item.id || item._id)} variant="ghost" size="sm">Delete</Button>
            </td>
          </tr>
        {:else}
          <tr><td colspan="4" class="empty-row">Knowledge base is empty</td></tr>
        {/each}
      </tbody>
    </table>
  </div>
{/if}

<!-- Add Entry Modal -->
<Modal bind:open={addOpen} title="New Entry">
  <div class="form-group">
    <label>Question
      <input class="input" bind:value={newQuestion} placeholder="Question..." />
    </label>
  </div>
  <div class="form-group">
    <label>Answer
      <textarea class="textarea" bind:value={newAnswer} rows="4" placeholder="Answer..."></textarea>
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
    <Button onclick={() => (addOpen = false)} variant="secondary">Cancel</Button>
    <Button onclick={addEntry} variant="primary">Save</Button>
  </div>
</Modal>

<!-- Edit Entry Modal -->
<Modal bind:open={editOpen} title="Edit Entry">
  <div class="form-group">
    <label>Question
      <input class="input" bind:value={editQuestion} placeholder="Question..." />
    </label>
  </div>
  <div class="form-group">
    <label>Answer
      <textarea class="textarea" bind:value={editAnswer} rows="4" placeholder="Answer..."></textarea>
    </label>
  </div>
  <div class="modal-actions">
    <Button onclick={() => (editOpen = false)} variant="secondary">Cancel</Button>
    <Button onclick={updateEntry} variant="primary">Save</Button>
  </div>
</Modal>

<!-- Upload Modal -->
<Modal bind:open={uploadOpen} title="Upload File">
  <FileUpload accept=".pdf,.docx,.xlsx,.csv,.txt" multiple onfiles={handleUpload} label="Upload PDF, DOCX, XLSX, CSV or TXT files" />
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
  .actions { display: flex; gap: 4px; }
  .empty-row { text-align: center; color: var(--text-muted); padding: 32px; }

  .form-group { margin-bottom: 14px; }
  .form-group label { display: block; font-size: 12px; font-weight: 600; color: var(--text-secondary); margin-bottom: 4px; }
  .input { width: 100%; padding: 8px 12px; border: 1px solid var(--border); border-radius: var(--radius-sm); font-size: 13px; font-family: inherit; color: var(--text); }
  .input:focus { border-color: var(--accent); outline: none; }
  .textarea { width: 100%; padding: 8px 12px; border: 1px solid var(--border); border-radius: var(--radius-sm); font-size: 13px; font-family: inherit; color: var(--text); resize: vertical; }
  .url-row { display: flex; gap: 8px; }
  .modal-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 16px; }
</style>

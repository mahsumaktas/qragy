<script>
  import { onMount } from "svelte";
  import { api } from "../../lib/api.js";
  import { showToast } from "../../lib/toast.svelte.js";
  import { showConfirm } from "../../lib/confirm.svelte.js";
  import { fmtDate, truncate } from "../../lib/format.js";
  import { t } from "../../lib/i18n.svelte.js";
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
      const data = res.records || res.payload?.records || res.items || res.knowledge || [];
      items = Array.isArray(data) ? data : [];
    } catch (e) {
      showToast(t("kb.loadError", { msg: e.message }), "error");
    } finally {
      loading = false;
    }
  }

  async function addEntry() {
    if (!newQuestion.trim() || !newAnswer.trim()) return;
    try {
      await api.post("admin/knowledge", { question: newQuestion.trim(), answer: newAnswer.trim() });
      showToast(t("kb.added"), "success");
      newQuestion = "";
      newAnswer = "";
      addOpen = false;
      await loadKB();
    } catch (e) {
      showToast(t("common.error", { msg: e.message }), "error");
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
      showToast(t("kb.updated"), "success");
      editOpen = false;
      editId = null;
      editQuestion = "";
      editAnswer = "";
      await loadKB();
    } catch (e) {
      showToast(t("common.error", { msg: e.message }), "error");
    }
  }

  async function deleteEntry(id) {
    const ok = await showConfirm({ title: t("kb.deleteTitle"), message: t("kb.deleteMsg"), confirmText: t("common.delete"), danger: true });
    if (!ok) return;
    try {
      await api.delete("admin/knowledge/" + id);
      showToast(t("kb.deleted"), "success");
      await loadKB();
    } catch (e) {
      showToast(t("common.error", { msg: e.message }), "error");
    }
  }

  async function handleUpload(files) {
    const formData = new FormData();
    for (const f of files) formData.append("files", f);
    try {
      await api.uploadForm("admin/knowledge/upload-batch", formData);
      showToast(t("kb.filesUploaded", { n: files.length }), "success");
      uploadOpen = false;
      await loadKB();
    } catch (e) {
      showToast(t("kb.uploadError", { msg: e.message }), "error");
    }
  }

  async function handleImportUrl() {
    if (!importUrl.trim()) return;
    try {
      await api.post("admin/knowledge/import-url", { url: importUrl.trim() });
      showToast(t("kb.urlImported"), "success");
      importUrl = "";
      await loadKB();
    } catch (e) {
      showToast(t("kb.importError", { msg: e.message }), "error");
    }
  }

  async function reingest() {
    try {
      await api.post("admin/knowledge/reingest", {});
      showToast(t("kb.reingestStarted"), "success");
    } catch (e) {
      showToast(t("common.error", { msg: e.message }), "error");
    }
  }
</script>

<div class="page-header">
  <div>
    <h1>{t("kb.title")}</h1>
    <p>{t("kb.entries", { n: items.length })}</p>
  </div>
  <div class="header-actions">
    <Button onclick={reingest} variant="ghost" size="sm">{t("kb.reingest")}</Button>
    <Button onclick={() => (uploadOpen = true)} variant="secondary" size="sm">{t("kb.uploadFile")}</Button>
    <Button onclick={() => (addOpen = true)} variant="primary" size="sm">{t("kb.addEntry")}</Button>
  </div>
</div>

{#if loading}
  <LoadingSpinner message={t("common.loading")} />
{:else}
  <div class="card">
    <table>
      <thead>
        <tr>
          <th>{t("kb.question")}</th>
          <th>{t("kb.answer")}</th>
          <th>{t("kb.date")}</th>
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
              <Button onclick={() => openEditEntry(item)} variant="ghost" size="sm">{t("common.edit")}</Button>
              <Button onclick={() => deleteEntry(item.id || item._id)} variant="ghost" size="sm">{t("common.delete")}</Button>
            </td>
          </tr>
        {:else}
          <tr><td colspan="4" class="empty-row">{t("kb.empty")}</td></tr>
        {/each}
      </tbody>
    </table>
  </div>
{/if}

<!-- Add Entry Modal -->
<Modal bind:open={addOpen} title={t("kb.newEntry")}>
  <div class="form-group">
    <label>{t("kb.question")}
      <input class="input" bind:value={newQuestion} placeholder={t("kb.questionPlaceholder")} />
    </label>
  </div>
  <div class="form-group">
    <label>{t("kb.answer")}
      <textarea class="textarea" bind:value={newAnswer} rows="4" placeholder={t("kb.answerPlaceholder")}></textarea>
    </label>
  </div>
  <div class="form-group">
    <label>{t("kb.urlImport")}
      <div class="url-row">
        <input class="input" bind:value={importUrl} placeholder="https://..." />
        <Button onclick={handleImportUrl} variant="secondary" size="sm">{t("common.import")}</Button>
      </div>
    </label>
  </div>
  <div class="modal-actions">
    <Button onclick={() => (addOpen = false)} variant="secondary">{t("common.cancel")}</Button>
    <Button onclick={addEntry} variant="primary">{t("common.save")}</Button>
  </div>
</Modal>

<!-- Edit Entry Modal -->
<Modal bind:open={editOpen} title={t("kb.editEntry")}>
  <div class="form-group">
    <label>{t("kb.question")}
      <input class="input" bind:value={editQuestion} placeholder={t("kb.questionPlaceholder")} />
    </label>
  </div>
  <div class="form-group">
    <label>{t("kb.answer")}
      <textarea class="textarea" bind:value={editAnswer} rows="4" placeholder={t("kb.answerPlaceholder")}></textarea>
    </label>
  </div>
  <div class="modal-actions">
    <Button onclick={() => (editOpen = false)} variant="secondary">{t("common.cancel")}</Button>
    <Button onclick={updateEntry} variant="primary">{t("common.save")}</Button>
  </div>
</Modal>

<!-- Upload Modal -->
<Modal bind:open={uploadOpen} title={t("kb.uploadFile")}>
  <FileUpload accept=".pdf,.docx,.xlsx,.csv,.txt" multiple onfiles={handleUpload} label={t("kb.uploadHint")} />
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

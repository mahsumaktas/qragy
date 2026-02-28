<script>
  import { onMount } from "svelte";
  import { api } from "../../lib/api.js";
  import { showToast } from "../../lib/toast.svelte.js";
  import Button from "../../components/ui/Button.svelte";
  import LoadingSpinner from "../../components/ui/LoadingSpinner.svelte";

  let loading = $state(true);
  let files = $state([]);
  let selectedFile = $state(null);
  let fileContent = $state("");
  let saving = $state(false);

  onMount(async () => {
    try {
      const res = await api.get("admin/agent/files");
      files = res.files || res || [];
    } catch (e) {
      showToast("Agent dosyalari yuklenemedi: " + e.message, "error");
    } finally {
      loading = false;
    }
  });

  async function selectFile(filename) {
    selectedFile = filename;
    try {
      const res = await api.get("admin/agent/files/" + encodeURIComponent(filename));
      fileContent = res.content || "";
    } catch (e) {
      showToast("Dosya okunamadi: " + e.message, "error");
      fileContent = "";
    }
  }

  async function saveFile() {
    if (!selectedFile) return;
    saving = true;
    try {
      await api.put("admin/agent/files/" + encodeURIComponent(selectedFile), { content: fileContent });
      showToast(selectedFile + " kaydedildi", "success");
    } catch (e) {
      showToast("Hata: " + e.message, "error");
    } finally {
      saving = false;
    }
  }

  async function reloadAgent() {
    try {
      await api.post("admin/agent/reload", {});
      showToast("Agent dosyalari yeniden yuklendi", "success");
    } catch (e) {
      showToast("Hata: " + e.message, "error");
    }
  }
</script>

<div class="page-header">
  <div><h1>Agent Dosyalari</h1><p>Bot yapilndirma dosyalari</p></div>
  <div class="actions">
    <Button onclick={reloadAgent} variant="secondary" size="sm">Agent'i Yenile</Button>
    <Button onclick={saveFile} variant="primary" size="sm" disabled={!selectedFile || saving}>{saving ? "Kaydediliyor..." : "Kaydet"}</Button>
  </div>
</div>

{#if loading}
  <LoadingSpinner message="Yukleniyor..." />
{:else}
  <div class="split-layout">
    <div class="file-list">
      {#each files as f}
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div class="file-item" class:active={selectedFile === (f.name || f)} onclick={() => selectFile(f.name || f)}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
          <span>{f.name || f}</span>
        </div>
      {:else}
        <div class="empty-list">Dosya yok</div>
      {/each}
    </div>
    <div class="editor-panel">
      {#if selectedFile}
        <div class="editor-header">
          <span class="mono">{selectedFile}</span>
        </div>
        <textarea class="mono-editor" bind:value={fileContent} spellcheck="false"></textarea>
      {:else}
        <div class="no-file">Bir dosya secin</div>
      {/if}
    </div>
  </div>
{/if}

<style>
  .page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
  .page-header h1 { font-size: 22px; font-weight: 700; }
  .page-header p { font-size: 13px; color: var(--text-muted); margin-top: 2px; }
  .actions { display: flex; gap: 8px; }

  .split-layout {
    display: grid;
    grid-template-columns: 220px 1fr;
    height: calc(100vh - 140px);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    overflow: hidden;
    background: var(--bg-card);
  }
  .file-list { border-right: 1px solid var(--border); overflow-y: auto; padding: 8px; }
  .file-item {
    display: flex; align-items: center; gap: 8px; padding: 8px 10px;
    border-radius: var(--radius-sm); cursor: pointer; font-size: 13px; color: var(--text-secondary); transition: all .1s;
  }
  .file-item:hover { background: var(--bg-hover); }
  .file-item.active { background: var(--accent-light); color: var(--accent); }
  .empty-list { padding: 20px; text-align: center; color: var(--text-muted); font-size: 13px; }

  .editor-panel { display: flex; flex-direction: column; overflow: hidden; }
  .editor-header { padding: 8px 16px; border-bottom: 1px solid var(--border-light); font-size: 12px; flex-shrink: 0; }
  .mono { font-family: "JetBrains Mono", monospace; }
  .mono-editor {
    flex: 1; width: 100%; padding: 16px; border: none;
    font-family: "JetBrains Mono", monospace; font-size: 12px; line-height: 1.6;
    color: var(--text); background: var(--bg); resize: none; outline: none; tab-size: 2;
  }
  .no-file { display: flex; align-items: center; justify-content: center; height: 100%; color: var(--text-muted); font-size: 13px; }
</style>

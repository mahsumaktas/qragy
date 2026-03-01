<script>
  import { onMount } from "svelte";
  import { api } from "../../lib/api.js";
  import { showToast } from "../../lib/toast.svelte.js";
  import Button from "../../components/ui/Button.svelte";
  import LoadingSpinner from "../../components/ui/LoadingSpinner.svelte";

  let loading = $state(true);
  let files = $state([]);
  let selectedFile = $state(null);
  let content = $state("");
  let jsonValid = $state(null);

  function checkJson(text) {
    if (!text.trim()) { jsonValid = null; return; }
    try { JSON.parse(text); jsonValid = true; } catch { jsonValid = false; }
  }

  onMount(async () => {
    try {
      const res = await api.get("admin/agent/memory");
      const raw = res.files || res || [];
      // Backend hash map donebilir: {"ticket-template.json": {...}} veya array: ["file1", "file2"]
      if (Array.isArray(raw)) {
        files = raw;
      } else if (typeof raw === "object" && raw !== null) {
        files = Object.entries(raw).map(([name, data]) => ({ name, data }));
      } else {
        files = [];
      }
    } catch (e) {
      showToast("Bellek sablonlari yuklenemedi: " + e.message, "error");
    } finally {
      loading = false;
    }
  });

  async function selectFile(fileObj) {
    const filename = fileObj.name || fileObj;
    selectedFile = filename;
    // Eger hash map'ten gelen data varsa, direkt kullan (gereksiz API call yapma)
    if (fileObj.data !== undefined) {
      content = typeof fileObj.data === "string" ? fileObj.data : JSON.stringify(fileObj.data, null, 2);
      checkJson(content);
      return;
    }
    try {
      const res = await api.get("admin/agent/memory/" + encodeURIComponent(filename));
      content = typeof res.content === "string" ? res.content : JSON.stringify(res.content || res, null, 2);
      checkJson(content);
    } catch (e) {
      showToast("Dosya okunamadi: " + e.message, "error");
      content = "";
      jsonValid = null;
    }
  }

  async function save() {
    if (!selectedFile) return;
    try {
      await api.put("admin/agent/memory/" + encodeURIComponent(selectedFile), { content });
      showToast(selectedFile + " kaydedildi", "success");
    } catch (e) {
      showToast("Hata: " + e.message, "error");
    }
  }
</script>

<div class="page-header">
  <div><h1>Bellek Sablonlari</h1><p>Hafiza dosya sablonlari</p></div>
  <Button onclick={save} variant="primary" size="sm" disabled={!selectedFile}>Kaydet</Button>
</div>

{#if loading}
  <LoadingSpinner message="Yukleniyor..." />
{:else}
  <div class="split-layout">
    <div class="file-list">
      {#each files as f}
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div class="file-item" class:active={selectedFile === (f.name || f)} onclick={() => selectFile(f)}>
          {f.name || f}
        </div>
      {:else}
        <div class="empty-list">Dosya yok</div>
      {/each}
    </div>
    <div class="editor-panel">
      {#if selectedFile}
        <div class="editor-toolbar">
          <span class="editor-filename">{selectedFile}</span>
          {#if jsonValid === true}
            <span class="json-badge valid">JSON Gecerli</span>
          {:else if jsonValid === false}
            <span class="json-badge invalid">JSON Hatali</span>
          {/if}
        </div>
        <textarea class="mono-editor" bind:value={content} spellcheck="false" oninput={() => checkJson(content)}></textarea>
      {:else}
        <div class="no-file">Bir sablon secin</div>
      {/if}
    </div>
  </div>
{/if}

<style>
  .page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
  .page-header h1 { font-size: 22px; font-weight: 700; }
  .page-header p { font-size: 13px; color: var(--text-muted); margin-top: 2px; }
  .split-layout { display: grid; grid-template-columns: 220px 1fr; height: calc(100vh - 140px); border: 1px solid var(--border); border-radius: var(--radius); overflow: hidden; background: var(--bg-card); }
  .file-list { border-right: 1px solid var(--border); overflow-y: auto; padding: 8px; }
  .file-item { padding: 8px 10px; border-radius: var(--radius-sm); cursor: pointer; font-size: 13px; color: var(--text-secondary); transition: all .1s; }
  .file-item:hover { background: var(--bg-hover); }
  .file-item.active { background: var(--accent-light); color: var(--accent); }
  .empty-list { padding: 20px; text-align: center; color: var(--text-muted); font-size: 13px; }
  .editor-panel { display: flex; flex-direction: column; overflow: hidden; }
  .editor-toolbar { display: flex; justify-content: space-between; align-items: center; padding: 6px 16px; border-bottom: 1px solid var(--border-light); background: var(--bg-card); }
  .editor-filename { font-size: 12px; font-weight: 600; color: var(--text-muted); font-family: "JetBrains Mono", monospace; }
  .json-badge { font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 9999px; }
  .json-badge.valid { background: rgba(34,197,94,.12); color: #16a34a; }
  .json-badge.invalid { background: rgba(239,68,68,.12); color: #dc2626; }
  .mono-editor { flex: 1; width: 100%; padding: 16px; border: none; font-family: "JetBrains Mono", monospace; font-size: 12px; line-height: 1.6; color: var(--text); background: var(--bg); resize: none; outline: none; }
  .no-file { display: flex; align-items: center; justify-content: center; height: 100%; color: var(--text-muted); font-size: 13px; }
</style>

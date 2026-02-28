<script>
  import { onMount } from "svelte";
  import { api } from "../../lib/api.js";
  import { showToast } from "../../lib/toast.svelte.js";
  import { fmtDate } from "../../lib/format.js";
  import Button from "../../components/ui/Button.svelte";
  import Badge from "../../components/ui/Badge.svelte";
  import LoadingSpinner from "../../components/ui/LoadingSpinner.svelte";

  let loading = $state(true);
  let versions = $state([]);
  let selectedVersion = $state(null);

  onMount(() => loadVersions());

  async function loadVersions() {
    loading = true;
    try {
      const res = await api.get("admin/prompt-versions");
      versions = res.versions || res || [];
    } catch (e) {
      showToast("Prompt versiyonlari yuklenemedi: " + e.message, "error");
    } finally {
      loading = false;
    }
  }
</script>

<div class="page-header">
  <div><h1>Prompt Gecmisi</h1><p>Prompt versiyon gecmisi</p></div>
  <Button onclick={loadVersions} variant="ghost" size="sm">Yenile</Button>
</div>

{#if loading}
  <LoadingSpinner message="Yukleniyor..." />
{:else if selectedVersion}
  <div class="detail">
    <Button onclick={() => (selectedVersion = null)} variant="ghost" size="sm">← Geri</Button>
    <div class="version-card">
      <h2>{selectedVersion.filename || selectedVersion.file}</h2>
      <p class="meta">Versiyon: {selectedVersion.version} &middot; {fmtDate(selectedVersion.createdAt)}</p>
      <pre class="content-pre">{selectedVersion.content || ""}</pre>
    </div>
  </div>
{:else}
  <div class="card">
    <table>
      <thead><tr><th>Dosya</th><th>Versiyon</th><th>Tarih</th><th></th></tr></thead>
      <tbody>
        {#each versions as v}
          <tr>
            <td>{v.filename || v.file}</td>
            <td><Badge variant="blue">v{v.version}</Badge></td>
            <td>{fmtDate(v.createdAt)}</td>
            <td><Button onclick={() => (selectedVersion = v)} variant="ghost" size="sm">Goruntule</Button></td>
          </tr>
        {:else}
          <tr><td colspan="4" class="empty-row">Versiyon yok</td></tr>
        {/each}
      </tbody>
    </table>
  </div>
{/if}

<style>
  .page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
  .page-header h1 { font-size: 22px; font-weight: 700; }
  .page-header p { font-size: 13px; color: var(--text-muted); margin-top: 2px; }
  .card { background: var(--bg-card); border-radius: var(--radius); box-shadow: var(--shadow); border: 1px solid var(--border-light); overflow: hidden; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th { text-align: left; padding: 10px 12px; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: .5px; color: var(--text-muted); border-bottom: 1px solid var(--border); background: var(--bg); }
  td { padding: 10px 12px; border-bottom: 1px solid var(--border-light); color: var(--text-secondary); }
  .empty-row { text-align: center; color: var(--text-muted); padding: 32px; }
  .detail { display: flex; flex-direction: column; gap: 16px; }
  .version-card { background: var(--bg-card); border-radius: var(--radius); padding: 20px; box-shadow: var(--shadow); border: 1px solid var(--border-light); }
  .version-card h2 { font-size: 16px; font-weight: 600; }
  .meta { font-size: 12px; color: var(--text-muted); margin: 4px 0 12px; }
  .content-pre { font-family: "JetBrains Mono", monospace; font-size: 12px; line-height: 1.6; padding: 12px; background: var(--bg); border-radius: var(--radius-sm); overflow-x: auto; white-space: pre-wrap; }
</style>

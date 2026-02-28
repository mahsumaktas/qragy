<script>
  import { onMount } from "svelte";
  import { api } from "../../lib/api.js";
  import { showToast } from "../../lib/toast.svelte.js";
  import { truncate } from "../../lib/format.js";
  import Button from "../../components/ui/Button.svelte";
  import LoadingSpinner from "../../components/ui/LoadingSpinner.svelte";

  let loading = $state(true);
  let gaps = $state([]);

  onMount(() => loadGaps());

  async function loadGaps() {
    loading = true;
    try {
      const res = await api.get("admin/content-gaps");
      gaps = res.gaps || res || [];
    } catch (e) {
      showToast("Content gaps yuklenemedi: " + e.message, "error");
    } finally {
      loading = false;
    }
  }
</script>

<div class="page-header">
  <div><h1>Content Gaps</h1><p>Cevaplanamayan sorular</p></div>
  <Button onclick={loadGaps} variant="ghost" size="sm">Yenile</Button>
</div>

{#if loading}
  <LoadingSpinner message="Yukleniyor..." />
{:else}
  <div class="card">
    <table>
      <thead><tr><th>Soru</th><th>Sayi</th><th>Son Gorulme</th></tr></thead>
      <tbody>
        {#each gaps as g}
          <tr>
            <td>{truncate(g.question || g.query || "", 80)}</td>
            <td>{g.count || g.frequency || 0}</td>
            <td>{g.lastSeen || "-"}</td>
          </tr>
        {:else}
          <tr><td colspan="3" class="empty-row">Content gap yok</td></tr>
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
</style>

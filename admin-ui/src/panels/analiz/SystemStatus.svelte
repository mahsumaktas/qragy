<script>
  import { onMount } from "svelte";
  import { api } from "../../lib/api.js";
  import { showToast } from "../../lib/toast.svelte.js";
  import { fmtDate } from "../../lib/format.js";
  import Badge from "../../components/ui/Badge.svelte";
  import Button from "../../components/ui/Button.svelte";
  import LoadingSpinner from "../../components/ui/LoadingSpinner.svelte";

  let loading = $state(true);
  let system = $state(null);
  let sla = $state(null);
  let auditLog = $state([]);

  onMount(() => load());

  async function load() {
    loading = true;
    try {
      const [sys, sl, audit] = await Promise.all([
        api.get("admin/system"),
        api.get("admin/sla").catch(() => null),
        api.get("admin/audit-log").catch(() => ({ log: [] })),
      ]);
      system = sys;
      sla = sl;
      auditLog = audit.log || audit || [];
    } catch (e) {
      showToast("Sistem durumu yuklenemedi: " + e.message, "error");
    } finally {
      loading = false;
    }
  }

  async function forceCheck() {
    try {
      system = await api.get("admin/system?forceCheck=1");
      showToast("Kontrol tamamlandi", "success");
    } catch (e) {
      showToast("Hata: " + e.message, "error");
    }
  }
</script>

<div class="page-header">
  <div><h1>Sistem Durumu</h1><p>Sistem sagligi ve denetim</p></div>
  <Button onclick={forceCheck} variant="secondary" size="sm">Kontrol Et</Button>
</div>

{#if loading}
  <LoadingSpinner message="Yukleniyor..." />
{:else}
  <div class="status-grid">
    {#if system}
      <div class="card">
        <h2>Sistem</h2>
        <div class="info-rows">
          <div class="info-row"><span>Durum</span><Badge variant={system.status === "ok" || system.healthy ? "green" : "red"}>{system.status || (system.healthy ? "saglikli" : "sorunlu")}</Badge></div>
          <div class="info-row"><span>Uptime</span><span>{system.uptime || "-"}</span></div>
          <div class="info-row"><span>Node</span><span>{system.nodeVersion || "-"}</span></div>
          <div class="info-row"><span>Bellek</span><span>{system.memoryUsage || "-"}</span></div>
          <div class="info-row"><span>LLM</span><Badge variant={system.llmStatus === "ok" ? "green" : "yellow"}>{system.llmStatus || system.llm || "-"}</Badge></div>
          <div class="info-row"><span>Embedding</span><Badge variant={system.embeddingStatus === "ok" ? "green" : "yellow"}>{system.embeddingStatus || "-"}</Badge></div>
        </div>
      </div>
    {/if}

    {#if sla}
      <div class="card">
        <h2>SLA</h2>
        <div class="info-rows">
          <div class="info-row"><span>Ort. Yanit Suresi</span><span>{sla.avgResponseMs ? (sla.avgResponseMs / 1000).toFixed(1) + "s" : "-"}</span></div>
          <div class="info-row"><span>Uptime</span><span>{sla.uptimePercent ? sla.uptimePercent + "%" : "-"}</span></div>
          <div class="info-row"><span>Basari Orani</span><span>{sla.successRate ? sla.successRate + "%" : "-"}</span></div>
        </div>
      </div>
    {/if}
  </div>

  {#if auditLog.length}
    <div class="card audit-card">
      <h2>Denetim Kaydi</h2>
      <table>
        <thead><tr><th>Zaman</th><th>Islem</th><th>Detay</th></tr></thead>
        <tbody>
          {#each auditLog.slice(0, 50) as entry}
            <tr>
              <td>{fmtDate(entry.at || entry.timestamp)}</td>
              <td><Badge variant="blue">{entry.action || entry.type}</Badge></td>
              <td>{entry.detail || entry.message || "-"}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
{/if}

<style>
  .page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
  .page-header h1 { font-size: 22px; font-weight: 700; }
  .page-header p { font-size: 13px; color: var(--text-muted); margin-top: 2px; }
  .status-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px; }
  .card { background: var(--bg-card); border-radius: var(--radius); padding: 20px; box-shadow: var(--shadow); border: 1px solid var(--border-light); }
  .card h2 { font-size: 15px; font-weight: 600; margin-bottom: 12px; }
  .info-rows { display: flex; flex-direction: column; gap: 8px; }
  .info-row { display: flex; justify-content: space-between; align-items: center; font-size: 13px; }
  .info-row span:first-child { color: var(--text-secondary); }
  .audit-card { overflow: hidden; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th { text-align: left; padding: 10px 12px; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: .5px; color: var(--text-muted); border-bottom: 1px solid var(--border); background: var(--bg); }
  td { padding: 10px 12px; border-bottom: 1px solid var(--border-light); color: var(--text-secondary); }
</style>

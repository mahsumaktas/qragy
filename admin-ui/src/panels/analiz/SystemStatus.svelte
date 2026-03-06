<script>
  import { onMount } from "svelte";
  import { t } from "../../lib/i18n.svelte.js";
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
  let reloading = $state(false);

  let loadedAgentCount = $derived(
    (system?.agentStatus || []).filter((item) => item.loaded).length
  );

  let llmVariant = $derived(
    system?.llmHealth?.ok
      ? system?.llmHealth?.warning ? "yellow" : "green"
      : "red"
  );

  function fmtUptime(sec) {
    if (!sec) return "-";
    const d = Math.floor(sec / 86400);
    const h = Math.floor((sec % 86400) / 3600);
    const m = Math.floor((sec % 3600) / 60);
    if (d > 0) return `${d}d ${h}h`;
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
  }

  function fmtMemory(bytes) {
    if (!bytes) return "-";
    return (bytes / 1024 / 1024).toFixed(1) + " MB";
  }

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
      auditLog = audit.entries || audit.log || (Array.isArray(audit) ? audit : []);
    } catch (e) {
      showToast(t("systemStatus.loadError", { msg: e.message }), "error");
    } finally {
      loading = false;
    }
  }

  async function forceCheck() {
    try {
      system = await api.get("admin/system?forceCheck=1");
      showToast(t("systemStatus.checkCompleted"), "success");
    } catch (e) {
      showToast(t("common.error", { msg: e.message }), "error");
    }
  }

  async function reloadAgent() {
    reloading = true;
    try {
      await api.post("admin/agent/reload", {});
      showToast(t("systemStatus.agentReloaded"), "success");
      await load();
    } catch (e) {
      showToast(t("common.error", { msg: e.message }), "error");
    } finally {
      reloading = false;
    }
  }
</script>

<div class="page-header">
  <div><h1>{t("systemStatus.title")}</h1><p>{t("systemStatus.subtitle")}</p></div>
  <div class="header-actions">
    <Button onclick={reloadAgent} variant="ghost" size="sm" disabled={reloading}>
      {reloading ? t("common.saving") : t("systemStatus.reloadAgent")}
    </Button>
    <Button onclick={forceCheck} variant="secondary" size="sm">{t("systemStatus.check")}</Button>
  </div>
</div>

{#if loading}
  <LoadingSpinner message={t("common.loading")} />
{:else}
  <div class="status-grid">
    {#if system}
      <div class="card">
        <h2>{t("systemStatus.system")}</h2>
        <div class="info-rows">
          <div class="info-row"><span>{t("systemStatus.status")}</span><Badge variant={system.ok || system.status === "ok" || system.healthy ? "green" : "red"}>{system.status || (system.ok || system.healthy ? t("systemStatus.healthy") : t("systemStatus.unhealthy"))}</Badge></div>
          <div class="info-row"><span>{t("systemStatus.uptime")}</span><span>{fmtUptime(system.uptime)}</span></div>
          <div class="info-row"><span>{t("systemStatus.node")}</span><span>{system.nodeVersion || "-"}</span></div>
          <div class="info-row"><span>{t("systemStatus.memory")}</span><span>{fmtMemory(system.memory?.rss)}</span></div>
          <div class="info-row"><span>{t("systemStatus.llm")}</span><Badge variant={llmVariant}>{system.llmHealth?.ok ? "OK" : system.llmHealth?.error || "-"} ({system.model || "-"})</Badge></div>
          <div class="info-row"><span>{t("systemStatus.embedding")}</span><Badge variant={system.knowledgeBase?.loaded ? "green" : "yellow"}>{system.knowledgeBase?.loaded ? `OK (${system.knowledgeBase.recordCount} records)` : "-"}</Badge></div>
        </div>
      </div>
    {/if}

    {#if sla}
      <div class="card">
        <h2>{t("systemStatus.sla")}</h2>
        <div class="info-rows">
          <div class="info-row"><span>{t("systemStatus.avgResponseTime")}</span><span>{sla.avgResponseMs ? (sla.avgResponseMs / 1000).toFixed(1) + "s" : "-"}</span></div>
          <div class="info-row"><span>{t("systemStatus.uptime")}</span><span>{sla.uptimePercent ? sla.uptimePercent + "%" : "-"}</span></div>
          <div class="info-row"><span>{t("systemStatus.successRate")}</span><span>{sla.successRate ? sla.successRate + "%" : "-"}</span></div>
        </div>
      </div>
    {/if}
  </div>

  {#if system}
    <div class="detail-grid">
      <div class="card">
        <h2>{t("systemStatus.runtimeDetails")}</h2>
        <div class="info-rows">
          <div class="info-row"><span>{t("systemStatus.heap")}</span><span>{fmtMemory(system.memory?.heapUsed)} / {fmtMemory(system.memory?.heapTotal)}</span></div>
          <div class="info-row"><span>{t("systemStatus.model")}</span><span>{system.model || "-"}</span></div>
          <div class="info-row"><span>{t("systemStatus.topics")}</span><span>{system.topicsCount ?? 0}</span></div>
          <div class="info-row"><span>{t("systemStatus.provider")}</span><span>{system.llmHealth?.provider || "-"}</span></div>
          <div class="info-row"><span>{t("systemStatus.latency")}</span><span>{system.llmHealth?.latencyMs ? `${system.llmHealth.latencyMs} ms` : "-"}</span></div>
          <div class="info-row"><span>{t("systemStatus.lastCheck")}</span><span>{system.llmHealth?.checkedAt ? fmtDate(system.llmHealth.checkedAt) : "-"}</span></div>
        </div>
        {#if system.llmHealth?.warning}
          <p class="system-note warn">{system.llmHealth.warning}</p>
        {:else if system.llmHealth?.error}
          <p class="system-note error">{system.llmHealth.error}</p>
        {/if}
      </div>

      <div class="card">
        <h2>{t("systemStatus.knowledgeBase")}</h2>
        <div class="info-rows">
          <div class="info-row"><span>{t("systemStatus.status")}</span><Badge variant={system.knowledgeBase?.loaded ? "green" : "red"}>{system.knowledgeBase?.loaded ? t("systemStatus.active") : t("systemStatus.inactive")}</Badge></div>
          <div class="info-row"><span>{t("systemStatus.recordCount")}</span><span>{system.knowledgeBase?.recordCount ?? 0}</span></div>
          <div class="info-row"><span>{t("systemStatus.vectorStore")}</span><span>LanceDB</span></div>
          <div class="info-row"><span>{t("systemStatus.topics")}</span><span>{system.topicsCount ?? 0}</span></div>
        </div>
      </div>

      <div class="card">
        <h2>{t("systemStatus.agentFiles")}</h2>
        <div class="info-row compact"><span>{t("systemStatus.loadedFiles")}</span><strong>{loadedAgentCount}/{system.agentStatus?.length || 0}</strong></div>
        <div class="status-list">
          {#each system.agentStatus || [] as item}
            <div class="status-item">
              <span class:status-dot={true} class:ok={item.loaded}></span>
              <span class="status-file">{item.file}</span>
              <Badge variant={item.loaded ? "green" : "red"}>{item.loaded ? t("systemStatus.active") : t("systemStatus.inactive")}</Badge>
            </div>
          {/each}
        </div>
      </div>
    </div>
  {/if}

  {#if auditLog.length}
    <div class="card audit-card">
      <h2>{t("systemStatus.auditLog")}</h2>
      <table>
        <thead><tr><th>{t("systemStatus.time")}</th><th>{t("systemStatus.action")}</th><th>{t("systemStatus.detail")}</th></tr></thead>
        <tbody>
          {#each auditLog.slice(0, 50) as entry}
            <tr>
              <td>{fmtDate(entry.at || entry.timestamp)}</td>
              <td><Badge variant="blue">{entry.action || entry.type}</Badge></td>
              <td>{entry.details || entry.detail || entry.message || "-"}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
{/if}

<style>
  .page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; gap: 16px; }
  .page-header h1 { font-size: 22px; font-weight: 700; }
  .page-header p { font-size: 13px; color: var(--text-muted); margin-top: 2px; }
  .header-actions { display: flex; gap: 8px; flex-wrap: wrap; }
  .status-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px; }
  .detail-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; margin-bottom: 16px; }
  .card { background: var(--bg-card); border-radius: var(--radius); padding: 20px; box-shadow: var(--shadow); border: 1px solid var(--border-light); }
  .card h2 { font-size: 15px; font-weight: 600; margin-bottom: 12px; }
  .info-rows { display: flex; flex-direction: column; gap: 8px; }
  .info-row { display: flex; justify-content: space-between; align-items: center; font-size: 13px; }
  .info-row.compact { margin-bottom: 10px; }
  .info-row span:first-child { color: var(--text-secondary); }
  .status-list { display: grid; gap: 8px; }
  .status-item { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: 10px; padding: 9px 10px; border-radius: 12px; background: var(--bg); border: 1px solid var(--border-light); }
  .status-dot { width: 10px; height: 10px; border-radius: 999px; background: #ef4444; box-shadow: 0 0 0 4px rgba(239, 68, 68, 0.12); }
  .status-dot.ok { background: #10b981; box-shadow: 0 0 0 4px rgba(16, 185, 129, 0.12); }
  .status-file { font-family: "JetBrains Mono", monospace; font-size: 12px; color: var(--text); word-break: break-word; }
  .system-note { margin-top: 12px; padding: 10px 12px; border-radius: 12px; font-size: 12px; line-height: 1.5; }
  .system-note.warn { background: #fffbeb; border: 1px solid #fcd34d; color: #92400e; }
  .system-note.error { background: #fef2f2; border: 1px solid #fca5a5; color: #991b1b; }
  .audit-card { overflow: hidden; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th { text-align: left; padding: 10px 12px; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: .5px; color: var(--text-muted); border-bottom: 1px solid var(--border); background: var(--bg); }
  td { padding: 10px 12px; border-bottom: 1px solid var(--border-light); color: var(--text-secondary); }
  @media (max-width: 1100px) {
    .detail-grid { grid-template-columns: 1fr; }
  }
  @media (max-width: 840px) {
    .status-grid { grid-template-columns: 1fr; }
  }
</style>

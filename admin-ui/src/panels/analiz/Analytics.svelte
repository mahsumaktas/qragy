<script>
  import { onMount } from "svelte";
  import { api } from "../../lib/api.js";
  import { showToast } from "../../lib/toast.svelte.js";
  import { getToken } from "../../lib/auth.svelte.js";
  import KpiCard from "../../components/ui/KpiCard.svelte";
  import BarChart from "../../components/ui/BarChart.svelte";
  import Button from "../../components/ui/Button.svelte";
  import Tabs from "../../components/ui/Tabs.svelte";
  import LoadingSpinner from "../../components/ui/LoadingSpinner.svelte";

  let loading = $state(true);
  let range = $state("7");
  let data = $state(null);

  const ranges = [
    { id: "7", label: "7 Days" },
    { id: "30", label: "30 Days" },
    { id: "90", label: "90 Days" },
  ];

  onMount(() => load());

  async function load() {
    loading = true;
    try {
      data = await api.get("admin/analytics?range=" + range);
    } catch (e) {
      showToast("Failed to load analytics: " + e.message, "error");
    } finally {
      loading = false;
    }
  }

  function handleRange(id) {
    range = id;
    load();
  }

  function exportData() {
    window.open("../api/admin/analytics/export?range=" + range + "&token=" + encodeURIComponent(getToken()), "_blank");
  }

  let topTopics = $derived(
    (data?.topTopics || data?.topics || []).slice(0, 10).map((t) => ({
      label: t.topicId || t.topic || t.name || "?",
      value: t.count || t.total || 0,
    }))
  );
</script>

<div class="page-header">
  <div><h1>Analytics</h1><p>Performance analysis</p></div>
  <Button onclick={exportData} variant="ghost" size="sm">Export</Button>
</div>

<Tabs tabs={ranges} bind:active={range} onchange={handleRange} />

{#if loading}
  <LoadingSpinner message="Loading..." />
{:else if data}
  <div class="kpi-grid">
    <KpiCard label="Total Chats" value={data.totalChats ?? data.chats ?? 0} />
    <KpiCard label="Escalations" value={data.totalEscalations ?? data.escalations ?? 0} />
    <KpiCard label="Avg. CSAT" value={(data.avgCsat ?? data.csatAvg ?? 0).toFixed(1) + "/5"} />
    <KpiCard label="Resolution Rate" value={(data.resolutionRate ?? 0) + "%"} />
  </div>

  {#if topTopics.length}
    <div class="card">
      <h2>Popular Topics</h2>
      <BarChart items={topTopics} />
    </div>
  {/if}
{/if}

<style>
  .page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
  .page-header h1 { font-size: 22px; font-weight: 700; }
  .page-header p { font-size: 13px; color: var(--text-muted); margin-top: 2px; }
  .kpi-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 20px; }
  .card { background: var(--bg-card); border-radius: var(--radius); padding: 20px; box-shadow: var(--shadow); border: 1px solid var(--border-light); }
  .card h2 { font-size: 15px; font-weight: 600; margin-bottom: 16px; }

  @media (max-width: 1024px) { .kpi-grid { grid-template-columns: repeat(2, 1fr); } }
  @media (max-width: 768px) { .kpi-grid { grid-template-columns: 1fr; } }
</style>

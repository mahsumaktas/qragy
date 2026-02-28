<script>
  import { onMount } from "svelte";
  import { api } from "../../lib/api.js";
  import { showToast } from "../../lib/toast.svelte.js";
  import KpiCard from "../../components/ui/KpiCard.svelte";
  import BarChart from "../../components/ui/BarChart.svelte";
  import LoadingSpinner from "../../components/ui/LoadingSpinner.svelte";

  let loading = $state(true);
  let stats = $state(null);
  let summary = $state(null);
  let error = $state(null);

  onMount(async () => {
    try {
      const [s, sum] = await Promise.all([
        api.get("admin/dashboard-stats").catch(() => null),
        api.get("admin/summary").catch(() => null),
      ]);
      stats = s;
      summary = sum;
    } catch (e) {
      error = e.message;
      showToast("Dashboard yuklenemedi: " + e.message, "error");
    } finally {
      loading = false;
    }
  });

  let topTopics = $derived(
    (stats?.thisWeek?.topTopics || []).slice(0, 8).map((t) => ({
      label: t.topicId || t.topic || "?",
      value: t.count || 0,
    }))
  );

  function trendArrow(val) {
    if (!val) return "";
    return val > 0 ? "+" + val + "%" : val + "%";
  }
</script>

<div class="page-header">
  <div>
    <h1>Dashboard</h1>
    <p>Sistem genel bakis</p>
  </div>
</div>

{#if loading}
  <LoadingSpinner message="Yukleniyor..." />
{:else if error}
  <div class="error-state">Hata: {error}</div>
{:else}
  <div class="kpi-grid">
    <KpiCard
      label="Bugun Sohbet"
      value={stats?.today?.chats ?? 0}
      sub="Cozum: %{stats?.today?.resolutionRate ?? 0}"
    />
    <KpiCard
      label="Haftalik Sohbet"
      value={stats?.thisWeek?.chats ?? 0}
      sub={trendArrow(stats?.trends?.weeklyChats)}
      trend={stats?.trends?.weeklyChats > 0 ? "up" : stats?.trends?.weeklyChats < 0 ? "down" : ""}
    />
    <KpiCard
      label="Haftalik CSAT"
      value={(stats?.thisWeek?.csatAvg ?? 0).toFixed(1) + "/5"}
      sub={trendArrow(stats?.trends?.weeklyCsat)}
      trend={stats?.trends?.weeklyCsat > 0 ? "up" : stats?.trends?.weeklyCsat < 0 ? "down" : ""}
    />
    <KpiCard
      label="Aylik Cozum"
      value="%{stats?.thisMonth?.resolutionRate ?? 0}"
      sub={trendArrow(stats?.trends?.monthlyChats)}
    />
  </div>

  {#if summary?.summary}
    <div class="grid-2">
      <div class="card">
        <h2>Ticket Durumu</h2>
        <div class="status-grid">
          <div class="status-item">
            <span class="status-label">Toplam</span>
            <span class="status-val">{summary.summary.total ?? 0}</span>
          </div>
          <div class="status-item">
            <span class="status-label">Son 24s</span>
            <span class="status-val">{summary.summary.last24h ?? 0}</span>
          </div>
          {#each Object.entries(summary.summary.byStatus || {}) as [key, val]}
            <div class="status-item">
              <span class="status-label">{key.replace(/_/g, " ")}</span>
              <span class="status-val">{val}</span>
            </div>
          {/each}
        </div>
      </div>

      {#if topTopics.length}
        <div class="card">
          <h2>Haftalik Populer Konular</h2>
          <BarChart items={topTopics} />
        </div>
      {/if}
    </div>
  {/if}
{/if}

<style>
  .page-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 24px;
  }
  .page-header h1 { font-size: 22px; font-weight: 700; line-height: 1.2; }
  .page-header p { font-size: 13px; color: var(--text-muted); margin-top: 2px; }

  .kpi-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 16px;
    margin-bottom: 20px;
  }

  .grid-2 {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
  }

  .card {
    background: var(--bg-card);
    border-radius: var(--radius);
    padding: 20px;
    box-shadow: var(--shadow);
    border: 1px solid var(--border-light);
  }
  .card h2 { font-size: 15px; font-weight: 600; margin-bottom: 16px; }

  .status-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }
  .status-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 6px 10px;
    background: var(--bg);
    border-radius: var(--radius-sm);
    font-size: 12px;
  }
  .status-label { color: var(--text-secondary); }
  .status-val { font-weight: 600; }

  .error-state {
    text-align: center;
    padding: 60px 20px;
    color: var(--error);
  }

  @media (max-width: 1024px) {
    .kpi-grid { grid-template-columns: repeat(2, 1fr); }
  }
  @media (max-width: 768px) {
    .kpi-grid { grid-template-columns: 1fr; }
    .grid-2 { grid-template-columns: 1fr; }
    .status-grid { grid-template-columns: 1fr; }
  }
</style>

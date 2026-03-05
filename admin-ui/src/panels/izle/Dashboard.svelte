<script>
  import { onMount } from "svelte";
  import { api } from "../../lib/api.js";
  import { showToast } from "../../lib/toast.svelte.js";
  import { t } from "../../lib/i18n.svelte.js";
  import { NAV_GROUPS } from "../../lib/constants.js";
  import { navigate } from "../../lib/router.svelte.js";
  import { translateStatus } from "../../lib/labels.js";
  import KpiCard from "../../components/ui/KpiCard.svelte";
  import BarChart from "../../components/ui/BarChart.svelte";
  import LoadingSpinner from "../../components/ui/LoadingSpinner.svelte";
  import Badge from "../../components/ui/Badge.svelte";
  import Button from "../../components/ui/Button.svelte";

  let loading = $state(true);
  let stats = $state(null);
  let summary = $state(null);
  let system = $state(null);
  let error = $state(null);

  onMount(async () => {
    try {
      const [statsRes, summaryRes, systemRes] = await Promise.all([
        api.get("admin/dashboard-stats").catch(() => null),
        api.get("admin/summary").catch(() => null),
        api.get("admin/system").catch(() => null),
      ]);
      stats = statsRes;
      summary = summaryRes;
      system = systemRes;
    } catch (e) {
      error = e.message;
      showToast(t("dashboard.loadError", { msg: e.message }), "error");
    } finally {
      loading = false;
    }
  });

  let topTopics = $derived(
    (stats?.thisWeek?.topTopics || []).slice(0, 8).map((topic) => ({
      label: topic.topicId || topic.topic || "?",
      value: topic.count || 0,
    }))
  );

  let statusRows = $derived(
    Object.entries(summary?.summary?.byStatus || {})
      .map(([key, value]) => ({ key, label: translateStatus(key), value }))
      .sort((left, right) => right.value - left.value)
  );

  let workspaceGroups = $derived(
    NAV_GROUPS.map((group) => ({
      ...group,
      previewItems: group.items.slice(0, 4),
    }))
  );

  let loadedAgentFiles = $derived(
    (system?.agentStatus || []).filter((file) => file.loaded).length
  );

  let llmBadgeVariant = $derived(
    system?.llmHealth?.ok
      ? system?.llmHealth?.warning ? "yellow" : "green"
      : "red"
  );

  let llmBadgeLabel = $derived(
    system?.llmHealth?.ok
      ? system?.llmHealth?.warning ? t("dashboard.healthWarning") : t("dashboard.healthHealthy")
      : t("dashboard.healthIssue")
  );

  function trendArrow(value) {
    if (value == null || Number.isNaN(value)) return "";
    return value > 0 ? `+${value}%` : `${value}%`;
  }

  function formatPercent(value) {
    return `${Math.round(Number(value) || 0)}%`;
  }

  function formatUptime(seconds) {
    const total = Math.max(0, Math.floor(Number(seconds) || 0));
    const days = Math.floor(total / 86400);
    const hours = Math.floor((total % 86400) / 3600);
    const mins = Math.floor((total % 3600) / 60);

    if (days) return t("dashboard.uptimeDays", { days, hours });
    if (hours) return t("dashboard.uptimeHours", { hours, mins });
    return t("dashboard.uptimeMinutes", { mins });
  }

  function goTo(id) {
    navigate(id);
  }
</script>

{#if loading}
  <LoadingSpinner message={t("common.loading")} />
{:else if error}
  <div class="error-state">{t("common.error", { msg: error })}</div>
{:else}
  <section class="hero-grid">
    <div class="hero-card">
      <div class="hero-copy">
        <span class="hero-eyebrow">{t("shell.productTagline")}</span>
        <h1>{t("dashboard.title")}</h1>
        <p>{t("dashboard.overviewText")}</p>
      </div>

      <div class="hero-actions">
        <Button onclick={() => goTo("live-chats")} variant="primary">{t("dashboard.primaryAction")}</Button>
        <Button onclick={() => goTo("knowledge-base")} variant="secondary">{t("dashboard.secondaryAction")}</Button>
        <Button onclick={() => goTo("site-settings")} variant="ghost">{t("dashboard.tertiaryAction")}</Button>
      </div>

      <div class="hero-facts">
        <div class="hero-fact">
          <span>{t("dashboard.kbRecords")}</span>
          <strong>{system?.knowledgeBase?.recordCount ?? 0}</strong>
        </div>
        <div class="hero-fact">
          <span>{t("dashboard.topicsCount")}</span>
          <strong>{system?.topicsCount ?? 0}</strong>
        </div>
        <div class="hero-fact">
          <span>{t("dashboard.ticketVolume")}</span>
          <strong>{summary?.summary?.total ?? 0}</strong>
        </div>
      </div>
    </div>

    <div class="health-card">
      <div class="card-head">
        <div>
          <div class="card-eyebrow">{t("dashboard.healthTitle")}</div>
          <h2>{t("dashboard.healthSubtitle")}</h2>
        </div>
        <Badge variant={llmBadgeVariant}>{llmBadgeLabel}</Badge>
      </div>

      <div class="health-list">
        <div class="health-row">
          <span>{t("dashboard.modelLabel")}</span>
          <strong>{system?.llmHealth?.provider || system?.model || "-"}</strong>
        </div>
        <div class="health-row">
          <span>{t("dashboard.uptimeLabel")}</span>
          <strong>{formatUptime(system?.uptime)}</strong>
        </div>
        <div class="health-row">
          <span>{t("dashboard.agentFilesLabel")}</span>
          <strong>{loadedAgentFiles}/{system?.agentStatus?.length || 0}</strong>
        </div>
        <div class="health-row">
          <span>{t("dashboard.last24h")}</span>
          <strong>{summary?.summary?.last24h ?? 0}</strong>
        </div>
      </div>

      {#if system?.llmHealth?.warning}
        <p class="health-note">{system.llmHealth.warning}</p>
      {:else if system?.llmHealth?.error}
        <p class="health-note error">{system.llmHealth.error}</p>
      {:else}
        <p class="health-note">{t("dashboard.healthCaption")}</p>
      {/if}
    </div>
  </section>

  <section class="kpi-grid">
    <KpiCard
      label={t("dashboard.todayChats")}
      value={stats?.today?.chats ?? 0}
      sub={t("dashboard.resolution", { val: stats?.today?.resolutionRate ?? 0 })}
    />
    <KpiCard
      label={t("dashboard.weeklyChats")}
      value={stats?.thisWeek?.chats ?? 0}
      sub={trendArrow(stats?.trends?.weeklyChats)}
      trend={stats?.trends?.weeklyChats > 0 ? "up" : stats?.trends?.weeklyChats < 0 ? "down" : ""}
    />
    <KpiCard
      label={t("dashboard.weeklyCsat")}
      value={(stats?.thisWeek?.csatAvg ?? 0).toFixed(1) + "/5"}
      sub={trendArrow(stats?.trends?.weeklyCsat)}
      trend={stats?.trends?.weeklyCsat > 0 ? "up" : stats?.trends?.weeklyCsat < 0 ? "down" : ""}
    />
    <KpiCard
      label={t("dashboard.monthlyResolution")}
      value={formatPercent(stats?.thisMonth?.resolutionRate)}
      sub={trendArrow(stats?.trends?.monthlyChats)}
    />
  </section>

  <section class="section">
    <div class="section-header">
      <div>
        <h2>{t("dashboard.workspaceTitle")}</h2>
        <p>{t("dashboard.workspaceText")}</p>
      </div>
    </div>

    <div class="workspace-grid">
      {#each workspaceGroups as group}
        <button class="workspace-card" onclick={() => goTo(group.items[0].id)}>
          <div class="workspace-top">
            <div>
              <span class="workspace-label">{t(group.labelKey)}</span>
              <h3>{t(group.descriptionKey)}</h3>
            </div>
            <span class="workspace-count">{group.items.length}</span>
          </div>

          <div class="workspace-pills">
            {#each group.previewItems as item}
              <span class="workspace-pill">{t(item.labelKey)}</span>
            {/each}
          </div>

          <span class="workspace-link">{t("dashboard.openSection")}</span>
        </button>
      {/each}
    </div>
  </section>

  <section class="insight-grid">
    <div class="card">
      <div class="card-head">
        <div>
          <div class="card-eyebrow">{t("dashboard.ticketStatus")}</div>
          <h2>{t("dashboard.statusSubtitle")}</h2>
        </div>
        <Badge variant="blue">{summary?.summary?.total ?? 0}</Badge>
      </div>

      <div class="status-grid">
        <div class="status-item">
          <span class="status-label">{t("dashboard.total")}</span>
          <span class="status-val">{summary?.summary?.total ?? 0}</span>
        </div>
        <div class="status-item">
          <span class="status-label">{t("dashboard.last24h")}</span>
          <span class="status-val">{summary?.summary?.last24h ?? 0}</span>
        </div>
        {#each statusRows as row}
          <div class="status-item">
            <span class="status-label">{row.label}</span>
            <span class="status-val">{row.value}</span>
          </div>
        {/each}
      </div>
    </div>

    <div class="card">
      <div class="card-head">
        <div>
          <div class="card-eyebrow">{t("dashboard.weeklyTopics")}</div>
          <h2>{t("dashboard.topicSubtitle")}</h2>
        </div>
      </div>

      {#if topTopics.length}
        <BarChart items={topTopics} />
      {:else}
        <div class="empty-state">{t("dashboard.noTopics")}</div>
      {/if}
    </div>
  </section>
{/if}

<style>
  .hero-grid,
  .insight-grid {
    display: grid;
    grid-template-columns: minmax(0, 1.5fr) minmax(320px, 1fr);
    gap: 18px;
  }

  .hero-card,
  .health-card,
  .card,
  .workspace-card {
    background: var(--bg-card);
    border: 1px solid var(--border-light);
    border-radius: 24px;
    box-shadow: var(--shadow);
  }

  .hero-card {
    padding: 26px;
    background:
      radial-gradient(circle at top right, rgba(15, 108, 189, 0.12), transparent 28%),
      linear-gradient(135deg, #ffffff, #f4f9ff);
  }

  .hero-copy h1 {
    font-size: 30px;
    font-weight: 800;
    line-height: 1.05;
    margin-bottom: 8px;
  }

  .hero-copy p {
    max-width: 60ch;
    color: var(--text-secondary);
    font-size: 14px;
  }

  .hero-eyebrow,
  .card-eyebrow,
  .workspace-label {
    display: inline-flex;
    align-items: center;
    font-size: 11px;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--accent);
    margin-bottom: 10px;
  }

  .hero-actions {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
    margin: 22px 0 20px;
  }

  .hero-facts {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 10px;
  }

  .hero-fact {
    padding: 14px 16px;
    border-radius: 18px;
    background: rgba(255, 255, 255, 0.78);
    border: 1px solid rgba(15, 108, 189, 0.08);
  }

  .hero-fact span,
  .health-row span,
  .status-label {
    color: var(--text-muted);
    font-size: 12px;
  }

  .hero-fact strong,
  .health-row strong,
  .status-val {
    display: block;
    margin-top: 4px;
    color: var(--text);
    font-size: 20px;
    font-weight: 700;
  }

  .health-card,
  .card {
    padding: 22px;
  }

  .card-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 18px;
  }

  .card-head h2 {
    font-size: 18px;
    font-weight: 700;
    line-height: 1.2;
  }

  .health-list {
    display: grid;
    gap: 10px;
  }

  .health-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    padding: 12px 14px;
    border-radius: 16px;
    background: var(--bg);
    border: 1px solid var(--border-light);
  }

  .health-row strong {
    margin-top: 0;
    font-size: 13px;
    text-align: right;
  }

  .health-note {
    margin-top: 12px;
    color: var(--text-secondary);
    font-size: 12px;
  }

  .health-note.error {
    color: var(--error);
  }

  .kpi-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 16px;
    margin: 18px 0;
  }

  .section {
    margin: 8px 0 18px;
  }

  .section-header {
    margin-bottom: 14px;
  }

  .section-header h2 {
    font-size: 20px;
    font-weight: 700;
    margin-bottom: 4px;
  }

  .section-header p {
    color: var(--text-secondary);
    font-size: 13px;
  }

  .workspace-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 16px;
  }

  .workspace-card {
    padding: 20px;
    text-align: left;
    cursor: pointer;
    transition: transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease;
  }

  .workspace-card:hover {
    transform: translateY(-1px);
    border-color: rgba(15, 108, 189, 0.2);
    box-shadow: var(--shadow-md);
  }

  .workspace-top {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
  }

  .workspace-top h3 {
    font-size: 18px;
    font-weight: 700;
    line-height: 1.25;
    color: var(--text);
  }

  .workspace-count {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 36px;
    height: 36px;
    padding: 0 10px;
    border-radius: 999px;
    background: var(--bg);
    border: 1px solid var(--border);
    color: var(--text-secondary);
    font-size: 12px;
    font-weight: 700;
  }

  .workspace-pills {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin: 18px 0 20px;
  }

  .workspace-pill {
    display: inline-flex;
    align-items: center;
    padding: 8px 10px;
    border-radius: 999px;
    background: var(--bg);
    color: var(--text-secondary);
    font-size: 12px;
    font-weight: 600;
  }

  .workspace-link {
    color: var(--accent);
    font-size: 13px;
    font-weight: 700;
  }

  .status-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }

  .status-item {
    padding: 14px;
    border-radius: 18px;
    background: var(--bg);
    border: 1px solid var(--border-light);
  }

  .status-val {
    font-size: 18px;
  }

  .empty-state,
  .error-state {
    padding: 28px;
    border-radius: 20px;
    background: var(--bg-card);
    border: 1px solid var(--border-light);
    color: var(--text-muted);
    text-align: center;
  }

  .error-state {
    color: var(--error);
  }

  @media (max-width: 1180px) {
    .hero-grid,
    .insight-grid {
      grid-template-columns: 1fr;
    }
  }

  @media (max-width: 1024px) {
    .kpi-grid,
    .workspace-grid {
      grid-template-columns: 1fr 1fr;
    }
  }

  @media (max-width: 768px) {
    .hero-card,
    .health-card,
    .card,
    .workspace-card {
      border-radius: 20px;
    }

    .hero-copy h1 {
      font-size: 24px;
    }

    .hero-facts,
    .kpi-grid,
    .workspace-grid,
    .status-grid {
      grid-template-columns: 1fr;
    }

    .hero-actions {
      flex-direction: column;
    }
  }
</style>

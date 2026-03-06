<script>
  import { onMount } from "svelte";
  import { t } from "../../lib/i18n.svelte.js";
  import { api } from "../../lib/api.js";
  import { showToast } from "../../lib/toast.svelte.js";
  import { fmtDate, fmtRelative, truncate } from "../../lib/format.js";
  import Button from "../../components/ui/Button.svelte";
  import Badge from "../../components/ui/Badge.svelte";
  import KpiCard from "../../components/ui/KpiCard.svelte";
  import LoadingSpinner from "../../components/ui/LoadingSpinner.svelte";

  let loading = $state(true);
  let pruning = $state(false);
  let handlingKey = $state("");
  let gaps = $state([]);
  let summary = $state(null);

  onMount(() => loadGaps());

  function getSignalVariant(signal) {
    if (signal === "high") return "red";
    if (signal === "medium") return "yellow";
    return "blue";
  }

  function getReasonItems() {
    const counts = summary?.filteredReasonCounts || {};
    return Object.entries(counts)
      .filter(([, value]) => value > 0)
      .map(([reason, value]) => ({ reason, value }));
  }

  function getGapKey(gap) {
    return String(gap?.normalizedQuery || gap?.query || gap?.question || "");
  }

  async function loadGaps() {
    loading = true;
    try {
      const res = await api.get("admin/content-gaps");
      gaps = res.gaps || [];
      summary = res.summary || null;
    } catch (e) {
      showToast(t("contentGaps.loadError", { msg: e.message }), "error");
    } finally {
      loading = false;
    }
  }

  async function pruneNoise() {
    pruning = true;
    try {
      const res = await api.post("admin/content-gaps/prune", {});
      showToast(t("contentGaps.pruned", { n: res.removedCount ?? 0 }), "success");
      await loadGaps();
    } catch (e) {
      showToast(t("common.error", { msg: e.message }), "error");
    } finally {
      pruning = false;
    }
  }

  async function markHandled(gap) {
    const key = getGapKey(gap);
    if (!key) return;
    handlingKey = key;
    try {
      const res = await api.post("admin/content-gaps/handle", {
        query: gap.query || gap.question || "",
        action: "resolved",
      });
      gaps = res.gaps || [];
      summary = res.summary || null;
      showToast(t("contentGaps.handled"), "success");
    } catch (e) {
      showToast(t("contentGaps.handleError", { msg: e.message }), "error");
    } finally {
      handlingKey = "";
    }
  }
</script>

<div class="page-header">
  <div>
    <h1>{t("contentGaps.title")}</h1>
    <p>{t("contentGaps.subtitle")}</p>
  </div>
  <div class="actions">
    <Button onclick={pruneNoise} variant="secondary" size="sm" disabled={pruning}>
      {pruning ? t("common.saving") : t("contentGaps.pruneNoise")}
    </Button>
    <Button onclick={loadGaps} variant="ghost" size="sm">{t("common.refresh")}</Button>
  </div>
</div>

{#if loading}
  <LoadingSpinner message={t("common.loading")} />
{:else}
  <div class="guide-card">
    <div>
      <h2>{t("contentGaps.guideTitle")}</h2>
      <p>{t("contentGaps.guideText")}</p>
    </div>
    <div class="guide-points">
      <div>{t("contentGaps.guidePoint1")}</div>
      <div>{t("contentGaps.guidePoint2")}</div>
      <div>{t("contentGaps.guidePoint3")}</div>
    </div>
  </div>

  <div class="kpi-grid">
    <KpiCard
      label={t("contentGaps.actionableCount")}
      value={summary?.actionableCount ?? gaps.length}
      sub={t("contentGaps.actionableHelp")}
    />
    <KpiCard
      label={t("contentGaps.highSignal")}
      value={summary?.highSignalCount ?? gaps.filter((item) => item.signal === "high").length}
      sub={t("contentGaps.highSignalHelp")}
      color="var(--error)"
    />
    <KpiCard
      label={t("contentGaps.filteredNoise")}
      value={summary?.filteredCount ?? 0}
      sub={t("contentGaps.filteredHelp")}
      color="var(--warning)"
    />
    <KpiCard
      label={t("contentGaps.lastSeenCard")}
      value={summary?.lastSeen ? fmtRelative(summary.lastSeen) : "-"}
      sub={summary?.lastSeen ? fmtDate(summary.lastSeen) : t("contentGaps.noRecentSignal")}
    />
  </div>

  {#if getReasonItems().length}
    <div class="noise-card">
      <div>
        <h2>{t("contentGaps.filteredSummary")}</h2>
        <p>{t("contentGaps.filteredSummaryText")}</p>
      </div>
      <div class="noise-badges">
        {#each getReasonItems() as item}
          <Badge variant="gray">{t("contentGaps.reason." + item.reason)}: {item.value}</Badge>
        {/each}
      </div>
    </div>
  {/if}

  <div class="card">
    <table>
      <thead>
        <tr>
          <th>{t("contentGaps.question")}</th>
          <th>{t("contentGaps.count")}</th>
          <th>{t("contentGaps.signal")}</th>
          <th>{t("contentGaps.recommendedAction")}</th>
          <th>{t("contentGaps.lastSeen")}</th>
          <th>{t("contentGaps.actions")}</th>
        </tr>
      </thead>
      <tbody>
        {#each gaps as g}
          <tr>
            <td>
              <div class="question-cell">
                <strong>{truncate(g.query || g.question || "", 120)}</strong>
                <span>{g.normalizedQuery || "-"}</span>
              </div>
            </td>
            <td>{g.count || 0}</td>
            <td>
              <Badge variant={getSignalVariant(g.signal)}>{t("contentGaps.signal." + (g.signal || "low"))}</Badge>
            </td>
            <td>{t("contentGaps.action." + (g.suggestionKey || "create_new_coverage"))}</td>
            <td>
              <div class="time-cell">
                <strong>{fmtRelative(g.lastSeen)}</strong>
                <span>{fmtDate(g.lastSeen)}</span>
              </div>
            </td>
            <td class="actions-cell">
              <Button
                onclick={() => markHandled(g)}
                variant="secondary"
                size="sm"
                disabled={handlingKey === getGapKey(g)}
              >
                {handlingKey === getGapKey(g) ? t("common.saving") : t("contentGaps.markHandled")}
              </Button>
            </td>
          </tr>
        {:else}
          <tr>
            <td colspan="6" class="empty-row">
              <strong>{t("contentGaps.empty")}</strong>
              <span>{t("contentGaps.emptyHelp")}</span>
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
{/if}

<style>
  .page-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 16px;
    margin-bottom: 16px;
  }

  .page-header h1 {
    font-size: 22px;
    font-weight: 700;
  }

  .page-header p {
    font-size: 13px;
    color: var(--text-muted);
    margin-top: 2px;
  }

  .actions {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }

  .guide-card,
  .noise-card,
  .card {
    background: var(--bg-card);
    border-radius: var(--radius);
    box-shadow: var(--shadow);
    border: 1px solid var(--border-light);
  }

  .guide-card,
  .noise-card {
    display: grid;
    gap: 14px;
    padding: 18px 20px;
    margin-bottom: 16px;
  }

  .guide-card h2,
  .noise-card h2 {
    font-size: 16px;
    font-weight: 700;
    margin-bottom: 6px;
  }

  .guide-card p,
  .noise-card p {
    font-size: 13px;
    color: var(--text-secondary);
    line-height: 1.6;
  }

  .guide-points {
    display: grid;
    gap: 8px;
  }

  .guide-points div {
    padding: 10px 12px;
    border-radius: 12px;
    background: var(--bg);
    border: 1px solid var(--border-light);
    font-size: 12px;
    color: var(--text-secondary);
    line-height: 1.5;
  }

  .noise-badges {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }

  .kpi-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 16px;
    margin-bottom: 16px;
  }

  .card {
    overflow: hidden;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
  }

  th {
    text-align: left;
    padding: 10px 12px;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--text-muted);
    border-bottom: 1px solid var(--border);
    background: var(--bg);
  }

  td {
    padding: 12px;
    border-bottom: 1px solid var(--border-light);
    color: var(--text-secondary);
    vertical-align: top;
  }

  .question-cell,
  .time-cell {
    display: grid;
    gap: 4px;
  }

  .actions-cell {
    width: 1%;
    white-space: nowrap;
  }

  .question-cell strong,
  .time-cell strong {
    color: var(--text);
    font-weight: 600;
  }

  .question-cell span,
  .time-cell span {
    font-size: 12px;
    color: var(--text-muted);
  }

  .empty-row {
    padding: 32px 24px;
    text-align: center;
  }

  .empty-row strong {
    display: block;
    color: var(--text);
    margin-bottom: 6px;
  }

  .empty-row span {
    color: var(--text-muted);
    font-size: 13px;
  }

  @media (max-width: 1100px) {
    .kpi-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @media (max-width: 860px) {
    .page-header {
      flex-direction: column;
      align-items: stretch;
    }

    .kpi-grid {
      grid-template-columns: 1fr;
    }

    table,
    thead,
    tbody,
    th,
    td,
    tr {
      display: block;
    }

    thead {
      display: none;
    }

    td {
      border-bottom: 1px solid var(--border-light);
    }

    .actions-cell {
      width: auto;
      white-space: normal;
    }
  }
</style>

<script>
  import { onMount } from "svelte";
  import { t } from "../../lib/i18n.svelte.js";
  import { api } from "../../lib/api.js";
  import { showToast } from "../../lib/toast.svelte.js";
  import { fmtDate } from "../../lib/format.js";
  import KpiCard from "../../components/ui/KpiCard.svelte";
  import Badge from "../../components/ui/Badge.svelte";
  import Button from "../../components/ui/Button.svelte";
  import LoadingSpinner from "../../components/ui/LoadingSpinner.svelte";

  let loading = $state(true);
  let report = $state({ summary: { total: 0, positive: 0, negative: 0, negativeRate: 0, contextCoverage: 0, topIssues: [] }, negative: [] });
  let entries = $state([]);
  let days = $state(30);

  let summary = $derived(report?.summary || {});
  let topIssues = $derived(summary?.topIssues || []);
  let negativeExamples = $derived(report?.negative || []);

  onMount(() => load());

  function getReaction(entry) {
    const raw = String(entry?.type || entry?.rating || "").toLowerCase();
    if (raw === "positive" || raw === "up") return "positive";
    if (raw === "negative" || raw === "down") return "negative";
    return "neutral";
  }

  function getReactionVariant(entry) {
    const reaction = getReaction(entry);
    if (reaction === "positive") return "green";
    if (reaction === "negative") return "red";
    return "gray";
  }

  function getReactionLabel(entry) {
    return t("feedback.reaction." + getReaction(entry));
  }

  async function load() {
    loading = true;
    try {
      const [r, f] = await Promise.all([
        api.get("admin/feedback-report?days=" + days),
        api.get("admin/feedback").catch(() => ({ entries: [] })),
      ]);
      report = r || { summary: {}, negative: [] };
      entries = f.entries || f.feedbacks || [];
    } catch (e) {
      showToast(t("feedback.loadError", { msg: e.message }), "error");
    } finally {
      loading = false;
    }
  }
</script>

<div class="page-header">
  <div>
    <h1>{t("feedback.title")}</h1>
    <p>{t("feedback.subtitle")}</p>
  </div>
  <div class="header-actions">
    <select class="select" bind:value={days} onchange={load}>
      <option value={7}>{t("analytics.7days")}</option>
      <option value={30}>{t("analytics.30days")}</option>
      <option value={90}>{t("analytics.90days")}</option>
    </select>
    <Button onclick={load} variant="ghost" size="sm">{t("common.refresh")}</Button>
  </div>
</div>

{#if loading}
  <LoadingSpinner message={t("common.loading")} />
{:else}
  <div class="guide-card">
    <div>
      <h2>{t("feedback.guideTitle")}</h2>
      <p>{t("feedback.guideText")}</p>
    </div>
    <div class="guide-points">
      <div>{t("feedback.guidePoint1")}</div>
      <div>{t("feedback.guidePoint2")}</div>
    </div>
  </div>

  <div class="kpi-grid">
    <KpiCard label={t("feedback.totalFeedback")} value={summary.total ?? 0} />
    <KpiCard label={t("feedback.positive")} value={summary.positive ?? 0} color="var(--success)" />
    <KpiCard label={t("feedback.negative")} value={summary.negative ?? 0} color="var(--error)" />
    <KpiCard label={t("feedback.negativeRate")} value={(summary.negativeRate ?? 0) + "%"} sub={t("feedback.contextCoverage", { n: summary.contextCoverage ?? 0 })} />
  </div>

  <div class="panel-grid">
    <section class="card">
      <div class="section-head">
        <div>
          <h2>{t("feedback.topIssues")}</h2>
          <p>{t("feedback.topIssuesText")}</p>
        </div>
      </div>

      {#if topIssues.length}
        <div class="issue-list">
          {#each topIssues as issue}
            <div class="issue-card">
              <div class="issue-head">
                <strong>{issue.key || "-"}</strong>
                <Badge variant="yellow">{issue.count || 0}</Badge>
              </div>
              <div class="issue-examples">
                {#each issue.examples || [] as example}
                  <div>{truncate(example.userMessage || "-", 120)}</div>
                {/each}
              </div>
            </div>
          {/each}
        </div>
      {:else}
        <div class="empty-state">
          <strong>{t("feedback.noIssues")}</strong>
          <span>{t("feedback.noIssuesText")}</span>
        </div>
      {/if}
    </section>

    <section class="card">
      <div class="section-head">
        <div>
          <h2>{t("feedback.negativeExamples")}</h2>
          <p>{t("feedback.negativeExamplesText")}</p>
        </div>
      </div>

      {#if negativeExamples.length}
        <div class="example-list">
          {#each negativeExamples.slice(0, 12) as entry}
            <div class="example-card">
              <div class="example-meta">
                <Badge variant="red">{t("feedback.reaction.negative")}</Badge>
                <span>{fmtDate(entry.timestamp)}</span>
              </div>
              <div class="example-block">
                <strong>{t("feedback.userMessage")}</strong>
                <p>{entry.userMessage || t("feedback.noContext")}</p>
              </div>
              <div class="example-block">
                <strong>{t("feedback.botResponse")}</strong>
                <p>{entry.botResponse || t("feedback.noContext")}</p>
              </div>
            </div>
          {/each}
        </div>
      {:else}
        <div class="empty-state">
          <strong>{t("feedback.noNegativeExamples")}</strong>
          <span>{t("feedback.noNegativeExamplesText")}</span>
        </div>
      {/if}
    </section>
  </div>

  <section class="card">
    <div class="section-head">
      <div>
        <h2>{t("feedback.recentFeedback")}</h2>
        <p>{t("feedback.recentFeedbackText")}</p>
      </div>
    </div>

    {#if entries.length}
      <table>
        <thead>
          <tr>
            <th>{t("feedback.reactionLabel")}</th>
            <th>{t("feedback.session")}</th>
            <th>{t("feedback.messageIndex")}</th>
            <th>{t("feedback.context")}</th>
            <th>{t("feedback.timestamp")}</th>
          </tr>
        </thead>
        <tbody>
          {#each entries.slice(0, 20) as fb}
            <tr>
              <td><Badge variant={getReactionVariant(fb)}>{getReactionLabel(fb)}</Badge></td>
              <td class="mono">{fb.sessionId?.slice(-8) || "-"}</td>
              <td>{fb.messageIndex ?? 0}</td>
              <td>{fb.userMessage || fb.botResponse ? t("feedback.contextCaptured") : t("feedback.noContext")}</td>
              <td>{fmtDate(fb.timestamp)}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    {:else}
      <div class="empty-state">
        <strong>{t("feedback.empty")}</strong>
        <span>{t("feedback.emptyText")}</span>
      </div>
    {/if}
  </section>
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

  .header-actions {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }

  .select {
    padding: 6px 10px;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    font-size: 13px;
    font-family: inherit;
  }

  .guide-card,
  .card {
    background: var(--bg-card);
    border-radius: var(--radius);
    box-shadow: var(--shadow);
    border: 1px solid var(--border-light);
  }

  .guide-card {
    display: grid;
    gap: 14px;
    padding: 18px 20px;
    margin-bottom: 16px;
  }

  .guide-card h2,
  .section-head h2 {
    font-size: 16px;
    font-weight: 700;
    margin-bottom: 6px;
  }

  .guide-card p,
  .section-head p {
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

  .kpi-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 16px;
    margin-bottom: 16px;
  }

  .panel-grid {
    display: grid;
    grid-template-columns: 1.2fr 1fr;
    gap: 16px;
    margin-bottom: 16px;
  }

  .card {
    padding: 20px;
  }

  .section-head {
    margin-bottom: 14px;
  }

  .issue-list,
  .example-list {
    display: grid;
    gap: 12px;
  }

  .issue-card,
  .example-card {
    border: 1px solid var(--border-light);
    border-radius: 14px;
    background: var(--bg);
    padding: 14px;
  }

  .issue-head,
  .example-meta {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
    margin-bottom: 10px;
  }

  .issue-head strong,
  .example-block strong {
    color: var(--text);
    font-weight: 700;
  }

  .issue-examples {
    display: grid;
    gap: 6px;
    font-size: 12px;
    color: var(--text-secondary);
    line-height: 1.5;
  }

  .example-meta span {
    font-size: 12px;
    color: var(--text-muted);
  }

  .example-block {
    display: grid;
    gap: 4px;
  }

  .example-block + .example-block {
    margin-top: 10px;
  }

  .example-block p {
    font-size: 13px;
    color: var(--text-secondary);
    line-height: 1.6;
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
    padding: 10px 12px;
    border-bottom: 1px solid var(--border-light);
    color: var(--text-secondary);
  }

  .mono {
    font-family: "JetBrains Mono", monospace;
    font-size: 12px;
  }

  .empty-state {
    display: grid;
    gap: 6px;
    padding: 20px 0;
    text-align: center;
  }

  .empty-state strong {
    color: var(--text);
  }

  .empty-state span {
    color: var(--text-muted);
    font-size: 13px;
  }

  @media (max-width: 1100px) {
    .kpi-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .panel-grid {
      grid-template-columns: 1fr;
    }
  }

  @media (max-width: 760px) {
    .page-header {
      flex-direction: column;
      align-items: stretch;
    }

    .kpi-grid {
      grid-template-columns: 1fr;
    }
  }
</style>

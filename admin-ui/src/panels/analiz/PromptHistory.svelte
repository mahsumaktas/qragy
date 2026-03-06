<script>
  import { onMount } from "svelte";
  import { t } from "../../lib/i18n.svelte.js";
  import { api } from "../../lib/api.js";
  import { showToast } from "../../lib/toast.svelte.js";
  import { fmtDate } from "../../lib/format.js";
  import Button from "../../components/ui/Button.svelte";
  import Badge from "../../components/ui/Badge.svelte";
  import KpiCard from "../../components/ui/KpiCard.svelte";
  import LoadingSpinner from "../../components/ui/LoadingSpinner.svelte";

  let loading = $state(true);
  let versions = $state([]);
  let selectedVersion = $state(null);

  let uniqueFileCount = $derived(new Set(versions.map((item) => item.filename || item.file).filter(Boolean)).size);
  let latestSavedAt = $derived(
    versions
      .map((item) => String(item.savedAt || item.createdAt || ""))
      .filter(Boolean)
      .sort()
      .slice(-1)[0] || ""
  );
  let fileSummaries = $derived(
    Object.values(
      versions.reduce((acc, item) => {
        const filename = item.filename || item.file || "-";
        if (!acc[filename]) {
          acc[filename] = { filename, count: 0, latestSavedAt: "" };
        }
        acc[filename].count++;
        const savedAt = String(item.savedAt || item.createdAt || "");
        if (!acc[filename].latestSavedAt || savedAt > acc[filename].latestSavedAt) {
          acc[filename].latestSavedAt = savedAt;
        }
        return acc;
      }, {})
    ).sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return String(b.latestSavedAt).localeCompare(String(a.latestSavedAt));
    })
  );

  onMount(() => loadVersions());

  async function loadVersions() {
    loading = true;
    try {
      const res = await api.get("admin/prompt-versions");
      versions = res.versions || [];
    } catch (e) {
      showToast(t("promptHistory.loadError", { msg: e.message }), "error");
    } finally {
      loading = false;
    }
  }

  async function rollback(v) {
    if (!confirm(t("promptHistory.rollbackConfirm", { file: v.filename || v.file }))) return;
    try {
      await api.post("admin/prompt-versions/" + (v.id || v._id) + "/rollback");
      showToast(t("promptHistory.rolledBack", { file: v.filename || v.file }), "success");
      selectedVersion = null;
      await loadVersions();
    } catch (e) {
      showToast(t("promptHistory.rollbackError", { msg: e.message }), "error");
    }
  }
</script>

<div class="page-header">
  <div>
    <h1>{t("promptHistory.title")}</h1>
    <p>{t("promptHistory.subtitle")}</p>
  </div>
  <Button onclick={loadVersions} variant="ghost" size="sm">{t("common.refresh")}</Button>
</div>

{#if loading}
  <LoadingSpinner message={t("common.loading")} />
{:else if selectedVersion}
  <div class="detail">
    <Button onclick={() => (selectedVersion = null)} variant="ghost" size="sm">{t("common.backShort")}</Button>
    <div class="guide-card compact">
      <h2>{t("promptHistory.rollbackNoteTitle")}</h2>
      <p>{t("promptHistory.rollbackNoteText")}</p>
    </div>
    <div class="version-card">
      <div class="version-header">
        <div>
          <h2>{selectedVersion.filename || selectedVersion.file}</h2>
          <p class="meta">{fmtDate(selectedVersion.savedAt || selectedVersion.createdAt)}</p>
        </div>
        <Button onclick={() => rollback(selectedVersion)} variant="danger" size="sm">{t("promptHistory.rollback")}</Button>
      </div>
      <pre class="content-pre">{selectedVersion.content || ""}</pre>
    </div>
  </div>
{:else}
  <div class="guide-card">
    <div>
      <h2>{t("promptHistory.scopeTitle")}</h2>
      <p>{t("promptHistory.scopeText")}</p>
    </div>
    <div class="guide-points">
      <div>{t("promptHistory.scopePoint1")}</div>
      <div>{t("promptHistory.scopePoint2")}</div>
    </div>
  </div>

  <div class="kpi-grid">
    <KpiCard label={t("promptHistory.totalVersions")} value={versions.length} />
    <KpiCard label={t("promptHistory.trackedFiles")} value={uniqueFileCount} />
    <KpiCard label={t("promptHistory.latestSave")} value={latestSavedAt ? fmtDate(latestSavedAt) : "-"} />
    <KpiCard label={t("promptHistory.newestFile")} value={fileSummaries[0]?.filename || "-"} sub={fileSummaries[0] ? t("promptHistory.versionCount", { n: fileSummaries[0].count }) : ""} />
  </div>

  {#if fileSummaries.length}
    <div class="summary-card">
      <h2>{t("promptHistory.fileVersions")}</h2>
      <div class="summary-list">
        {#each fileSummaries as item}
          <div class="summary-item">
            <div>
              <strong>{item.filename}</strong>
              <span>{fmtDate(item.latestSavedAt)}</span>
            </div>
            <Badge variant="gray">{t("promptHistory.versionCount", { n: item.count })}</Badge>
          </div>
        {/each}
      </div>
    </div>
  {/if}

  <div class="card">
    <table>
      <thead>
        <tr>
          <th>{t("promptHistory.file")}</th>
          <th>{t("promptHistory.date")}</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {#each versions as v}
          <tr>
            <td>{v.filename || v.file}</td>
            <td>{fmtDate(v.savedAt || v.createdAt)}</td>
            <td class="action-col">
              <Button onclick={() => (selectedVersion = v)} variant="ghost" size="sm">{t("promptHistory.view")}</Button>
              <Button onclick={() => rollback(v)} variant="danger" size="sm">{t("promptHistory.rollback")}</Button>
            </td>
          </tr>
        {:else}
          <tr>
            <td colspan="3" class="empty-row">
              <strong>{t("promptHistory.noVersions")}</strong>
              <span>{t("promptHistory.noVersionsHelp")}</span>
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

  .guide-card,
  .summary-card,
  .card,
  .version-card {
    background: var(--bg-card);
    border-radius: var(--radius);
    box-shadow: var(--shadow);
    border: 1px solid var(--border-light);
  }

  .guide-card,
  .summary-card,
  .version-card {
    padding: 18px 20px;
  }

  .guide-card {
    display: grid;
    gap: 14px;
    margin-bottom: 16px;
  }

  .guide-card.compact {
    margin-bottom: 0;
  }

  .guide-card h2,
  .summary-card h2,
  .version-card h2 {
    font-size: 16px;
    font-weight: 700;
    margin-bottom: 6px;
  }

  .guide-card p {
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

  .summary-card {
    margin-bottom: 16px;
  }

  .summary-list {
    display: grid;
    gap: 10px;
  }

  .summary-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    padding: 12px 14px;
    border-radius: 12px;
    background: var(--bg);
    border: 1px solid var(--border-light);
  }

  .summary-item strong {
    display: block;
    color: var(--text);
    font-weight: 600;
    margin-bottom: 4px;
  }

  .summary-item span,
  .meta {
    font-size: 12px;
    color: var(--text-muted);
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
    padding: 10px 12px;
    border-bottom: 1px solid var(--border-light);
    color: var(--text-secondary);
  }

  .empty-row {
    text-align: center;
    padding: 32px 24px;
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

  .detail {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .version-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 16px;
    margin-bottom: 8px;
  }

  .content-pre {
    font-family: "JetBrains Mono", monospace;
    font-size: 12px;
    line-height: 1.6;
    padding: 12px;
    background: var(--bg);
    border-radius: var(--radius-sm);
    overflow-x: auto;
    white-space: pre-wrap;
  }

  .action-col {
    display: flex;
    gap: 4px;
  }

  @media (max-width: 1100px) {
    .kpi-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @media (max-width: 760px) {
    .page-header,
    .version-header,
    .summary-item {
      flex-direction: column;
      align-items: stretch;
    }

    .kpi-grid {
      grid-template-columns: 1fr;
    }
  }
</style>

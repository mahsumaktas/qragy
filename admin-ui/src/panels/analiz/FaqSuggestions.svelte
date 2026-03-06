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
  let generating = $state(false);
  let items = $state([]);
  let stats = $state({ pending: 0, approved: 0, rejected: 0, eligibleResolvedCount: 0, latestCreatedAt: "" });

  onMount(() => loadFAQ());

  async function loadFAQ() {
    loading = true;
    try {
      const res = await api.get("admin/auto-faq");
      items = res.items || res.faqs || [];
      stats = res.stats || stats;
    } catch (e) {
      showToast(t("faq.loadError", { msg: e.message }), "error");
    } finally {
      loading = false;
    }
  }

  async function approve(id) {
    try {
      await api.post("admin/auto-faq/" + id + "/approve");
      showToast(t("faq.approved"), "success");
      await loadFAQ();
    } catch (e) {
      showToast(t("common.error", { msg: e.message }), "error");
    }
  }

  async function reject(id) {
    try {
      await api.post("admin/auto-faq/" + id + "/reject");
      showToast(t("faq.rejected"), "info");
      await loadFAQ();
    } catch (e) {
      showToast(t("common.error", { msg: e.message }), "error");
    }
  }

  async function generate() {
    generating = true;
    try {
      const res = await api.post("admin/auto-faq/generate");
      showToast(
        res.generated > 0
          ? t("faq.generatedCount", { n: res.generated })
          : (res.stats?.eligibleResolvedCount > 0 ? t("faq.generateEmpty") : t("faq.noEligible")),
        res.generated > 0 ? "success" : "info"
      );
      await loadFAQ();
    } catch (e) {
      showToast(t("common.error", { msg: e.message }), "error");
    } finally {
      generating = false;
    }
  }
</script>

<div class="page-header">
  <div>
    <h1>{t("faq.title")}</h1>
    <p>{t("faq.subtitle")}</p>
  </div>
  <div class="actions">
    <Button onclick={generate} variant="secondary" size="sm" disabled={generating}>
      {generating ? t("common.saving") : t("faq.generateNew")}
    </Button>
    <Button onclick={loadFAQ} variant="ghost" size="sm">{t("common.refresh")}</Button>
  </div>
</div>

{#if loading}
  <LoadingSpinner message={t("common.loading")} />
{:else}
  <div class="guide-card">
    <div>
      <h2>{t("faq.guideTitle")}</h2>
      <p>{t("faq.guideText")}</p>
    </div>
    <div class="guide-points">
      <div>{t("faq.guidePoint1")}</div>
      <div>{t("faq.guidePoint2")}</div>
    </div>
  </div>

  <div class="kpi-grid">
    <KpiCard label={t("faq.pendingCount")} value={stats.pending ?? items.length} />
    <KpiCard label={t("faq.eligibleResolved")} value={stats.eligibleResolvedCount ?? 0} sub={t("faq.eligibleResolvedHelp")} />
    <KpiCard label={t("faq.approvedCount")} value={stats.approved ?? 0} color="var(--success)" />
    <KpiCard label={t("faq.rejectedCount")} value={stats.rejected ?? 0} color="var(--error)" />
  </div>

  {#if items.length}
    <div class="faq-list">
      {#each items as item}
        <div class="faq-card">
          <div class="faq-head">
            <div>
              <h2>{item.question}</h2>
              <p>{item.answer}</p>
            </div>
            <Badge variant={item.status === "approved" ? "green" : item.status === "rejected" ? "red" : "yellow"}>
              {item.status || t("faq.pending")}
            </Badge>
          </div>

          <div class="faq-meta">
            <span>{t("faq.sourceTicket")}: {item.ticketId || "-"}</span>
            <span>{t("faq.createdAt")}: {fmtDate(item.createdAt)}</span>
          </div>

          {#if !item.status || item.status === "pending"}
            <div class="faq-actions">
              <Button onclick={() => approve(item.id || item._id)} variant="primary" size="sm">{t("faq.approve")}</Button>
              <Button onclick={() => reject(item.id || item._id)} variant="ghost" size="sm">{t("faq.reject")}</Button>
            </div>
          {/if}
        </div>
      {/each}
    </div>
  {:else}
    <div class="empty">
      <strong>{t("faq.empty")}</strong>
      <span>
        {stats.eligibleResolvedCount > 0
          ? t("faq.emptyHelp")
          : t("faq.noEligible")}
      </span>
    </div>
  {/if}
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
  .faq-card,
  .empty {
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
  .faq-card h2 {
    font-size: 16px;
    font-weight: 700;
    margin-bottom: 6px;
  }

  .guide-card p,
  .faq-card p {
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

  .faq-list {
    display: grid;
    gap: 12px;
  }

  .faq-card {
    padding: 18px;
  }

  .faq-head {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 16px;
    margin-bottom: 12px;
  }

  .faq-meta {
    display: flex;
    gap: 16px;
    flex-wrap: wrap;
    font-size: 12px;
    color: var(--text-muted);
    margin-bottom: 14px;
  }

  .faq-actions {
    display: flex;
    gap: 8px;
  }

  .empty {
    text-align: center;
    padding: 40px 24px;
  }

  .empty strong {
    display: block;
    color: var(--text);
    margin-bottom: 8px;
  }

  .empty span {
    color: var(--text-muted);
    font-size: 13px;
  }

  @media (max-width: 1100px) {
    .kpi-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @media (max-width: 760px) {
    .page-header,
    .faq-head {
      flex-direction: column;
      align-items: stretch;
    }

    .kpi-grid {
      grid-template-columns: 1fr;
    }
  }
</style>

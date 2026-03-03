<script>
  import { onMount } from "svelte";
  import { t } from "../../lib/i18n.svelte.js";
  import { api } from "../../lib/api.js";
  import { showToast } from "../../lib/toast.svelte.js";
  import Button from "../../components/ui/Button.svelte";
  import Badge from "../../components/ui/Badge.svelte";
  import LoadingSpinner from "../../components/ui/LoadingSpinner.svelte";

  let loading = $state(true);
  let items = $state([]);

  onMount(() => loadFAQ());

  async function loadFAQ() {
    loading = true;
    try {
      const res = await api.get("admin/auto-faq");
      items = res.items || res.faqs || res || [];
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
    try {
      await api.post("admin/auto-faq/generate");
      showToast(t("faq.generationStarted"), "info");
      setTimeout(loadFAQ, 3000);
    } catch (e) {
      showToast(t("common.error", { msg: e.message }), "error");
    }
  }
</script>

<div class="page-header">
  <div><h1>{t("faq.title")}</h1><p>{t("faq.subtitle")}</p></div>
  <div class="actions">
    <Button onclick={generate} variant="secondary" size="sm">{t("faq.generateNew")}</Button>
    <Button onclick={loadFAQ} variant="ghost" size="sm">{t("common.refresh")}</Button>
  </div>
</div>

{#if loading}
  <LoadingSpinner message={t("common.loading")} />
{:else}
  <div class="faq-list">
    {#each items as item}
      <div class="faq-card">
        <div class="faq-q"><strong>{t("faq.question")}</strong> {item.question}</div>
        <div class="faq-a"><strong>{t("faq.answer")}</strong> {item.answer}</div>
        <div class="faq-footer">
          <Badge variant={item.status === "approved" ? "green" : item.status === "rejected" ? "red" : "yellow"}>
            {item.status || t("faq.pending")}
          </Badge>
          {#if !item.status || item.status === "pending"}
            <div class="faq-actions">
              <Button onclick={() => approve(item.id || item._id)} variant="primary" size="sm">{t("faq.approve")}</Button>
              <Button onclick={() => reject(item.id || item._id)} variant="ghost" size="sm">{t("faq.reject")}</Button>
            </div>
          {/if}
        </div>
      </div>
    {:else}
      <div class="empty">{t("faq.empty")}</div>
    {/each}
  </div>
{/if}

<style>
  .page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
  .page-header h1 { font-size: 22px; font-weight: 700; }
  .page-header p { font-size: 13px; color: var(--text-muted); margin-top: 2px; }
  .actions { display: flex; gap: 8px; }
  .faq-list { display: flex; flex-direction: column; gap: 12px; }
  .faq-card { background: var(--bg-card); border-radius: var(--radius); padding: 16px; box-shadow: var(--shadow); border: 1px solid var(--border-light); }
  .faq-q { font-size: 14px; margin-bottom: 8px; }
  .faq-a { font-size: 13px; color: var(--text-secondary); margin-bottom: 10px; }
  .faq-footer { display: flex; justify-content: space-between; align-items: center; }
  .faq-actions { display: flex; gap: 8px; }
  .empty { text-align: center; padding: 40px; color: var(--text-muted); }
</style>

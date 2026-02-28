<script>
  import { onMount } from "svelte";
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
      showToast("FAQ yuklenemedi: " + e.message, "error");
    } finally {
      loading = false;
    }
  }

  async function approve(id) {
    try {
      await api.post("admin/auto-faq/" + id + "/approve");
      showToast("Onaylandi", "success");
      await loadFAQ();
    } catch (e) {
      showToast("Hata: " + e.message, "error");
    }
  }

  async function reject(id) {
    try {
      await api.post("admin/auto-faq/" + id + "/reject");
      showToast("Reddedildi", "info");
      await loadFAQ();
    } catch (e) {
      showToast("Hata: " + e.message, "error");
    }
  }

  async function generate() {
    try {
      await api.post("admin/auto-faq/generate");
      showToast("FAQ uretimi basladi", "info");
      setTimeout(loadFAQ, 3000);
    } catch (e) {
      showToast("Hata: " + e.message, "error");
    }
  }
</script>

<div class="page-header">
  <div><h1>FAQ Onerileri</h1><p>Otomatik uretilen SSS onerileri</p></div>
  <div class="actions">
    <Button onclick={generate} variant="secondary" size="sm">Yeni Uret</Button>
    <Button onclick={loadFAQ} variant="ghost" size="sm">Yenile</Button>
  </div>
</div>

{#if loading}
  <LoadingSpinner message="Yukleniyor..." />
{:else}
  <div class="faq-list">
    {#each items as item}
      <div class="faq-card">
        <div class="faq-q"><strong>S:</strong> {item.question}</div>
        <div class="faq-a"><strong>C:</strong> {item.answer}</div>
        <div class="faq-footer">
          <Badge variant={item.status === "approved" ? "green" : item.status === "rejected" ? "red" : "yellow"}>
            {item.status || "bekliyor"}
          </Badge>
          {#if !item.status || item.status === "pending"}
            <div class="faq-actions">
              <Button onclick={() => approve(item.id || item._id)} variant="primary" size="sm">Onayla</Button>
              <Button onclick={() => reject(item.id || item._id)} variant="ghost" size="sm">Reddet</Button>
            </div>
          {/if}
        </div>
      </div>
    {:else}
      <div class="empty">FAQ onerisi yok</div>
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

<script>
  import { onMount } from "svelte";
  import { api } from "../../lib/api.js";
  import { showToast } from "../../lib/toast.svelte.js";
  import { t } from "../../lib/i18n.svelte.js";
  import Button from "../../components/ui/Button.svelte";
  import Toggle from "../../components/ui/Toggle.svelte";
  import LoadingSpinner from "../../components/ui/LoadingSpinner.svelte";

  let loading = $state(true);
  let config = $state({});

  onMount(async () => {
    try {
      const res = await api.get("admin/whatsapp");
      config = res.config || res || {};
    } catch (e) {
      showToast(t("whatsapp.loadError", { msg: e.message }), "error");
    } finally {
      loading = false;
    }
  });

  async function save() {
    try {
      await api.put("admin/whatsapp", config);
      showToast(t("whatsapp.saved"), "success");
    } catch (e) {
      showToast(t("common.error", { msg: e.message }), "error");
    }
  }
</script>

<div class="page-header">
  <div><h1>{t("whatsapp.title")}</h1><p>{t("whatsapp.subtitle")}</p></div>
  <Button onclick={save} variant="primary" size="sm">{t("common.save")}</Button>
</div>

{#if loading}
  <LoadingSpinner message={t("common.loading")} />
{:else}
  <div class="card">
    <div class="form-grid">
      <div class="form-group"><span class="lbl">{t("whatsapp.apiToken")}</span><input class="input" type="password" bind:value={config.accessToken} /></div>
      <div class="form-group"><span class="lbl">{t("whatsapp.phoneId")}</span><input class="input" bind:value={config.phoneNumberId} /></div>
      <div class="form-group"><span class="lbl">{t("whatsapp.verifyToken")}</span><input class="input" bind:value={config.verifyToken} /></div>
      <div class="form-group"><span class="lbl">{t("whatsapp.businessAccountId")}</span><input class="input" bind:value={config.businessAccountId} /></div>
      <div class="form-row"><span class="lbl">{t("whatsapp.active")}</span><Toggle bind:checked={config.enabled} /></div>
    </div>
  </div>

  <div class="card webhook-card">
    <div class="card-title">{t("whatsapp.webhookUrl")}</div>
    <p class="desc">{t("whatsapp.webhookHint")}</p>
    <input class="input webhook-url" value={config.webhookUrl || ""} readonly onclick={(e) => { e.target.select(); navigator.clipboard?.writeText(e.target.value); showToast(t("common.copied"), "success"); }} />
  </div>
{/if}

<style>
  .page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
  .page-header h1 { font-size: 22px; font-weight: 700; }
  .page-header p { font-size: 13px; color: var(--text-muted); margin-top: 2px; }
  .card { background: var(--bg-card); border-radius: var(--radius); padding: 20px; box-shadow: var(--shadow); border: 1px solid var(--border-light); }
  .form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .form-group { display: flex; flex-direction: column; gap: 4px; }
  .form-row { display: flex; align-items: center; justify-content: space-between; }
  .lbl { font-size: 12px; font-weight: 600; color: var(--text-secondary); }
  .input { width: 100%; padding: 8px 12px; border: 1px solid var(--border); border-radius: var(--radius-sm); font-size: 13px; font-family: inherit; color: var(--text); outline: none; }
  .webhook-card { margin-top: 12px; display: flex; flex-direction: column; gap: 8px; align-items: flex-start; }
  .card-title { font-size: 14px; font-weight: 600; margin: 0; }
  .desc { font-size: 12px; color: var(--text-secondary); margin: 0; }
  .webhook-url { background: var(--bg-hover); cursor: pointer; font-family: "JetBrains Mono", monospace; font-size: 12px; }
</style>

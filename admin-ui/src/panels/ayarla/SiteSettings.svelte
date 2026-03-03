<script>
  import { onMount } from "svelte";
  import { api } from "../../lib/api.js";
  import { showToast } from "../../lib/toast.svelte.js";
  import { t } from "../../lib/i18n.svelte.js";
  import Button from "../../components/ui/Button.svelte";
  import Toggle from "../../components/ui/Toggle.svelte";
  import ColorPicker from "../../components/ui/ColorPicker.svelte";
  import LoadingSpinner from "../../components/ui/LoadingSpinner.svelte";

  let loading = $state(true);
  let config = $state({});
  let logoFile = $state(null);

  onMount(async () => {
    try {
      const res = await api.get("admin/site-config");
      config = res.config || res || {};
    } catch (e) {
      showToast(t("siteSettings.loadError", { msg: e.message }), "error");
    } finally {
      loading = false;
    }
  });

  async function save() {
    try {
      await api.put("admin/site-config", { config });
      showToast(t("siteSettings.saved"), "success");
    } catch (e) {
      showToast(t("common.error", { msg: e.message }), "error");
    }
  }

  async function uploadLogo() {
    if (!logoFile) return;
    try {
      await api.upload("admin/site-logo", logoFile);
      showToast(t("siteSettings.logoUploaded"), "success");
    } catch (e) {
      showToast(t("common.error", { msg: e.message }), "error");
    }
  }
</script>

<div class="page-header">
  <div><h1>{t("siteSettings.title")}</h1><p>{t("siteSettings.subtitle")}</p></div>
  <Button onclick={save} variant="primary" size="sm">{t("common.save")}</Button>
</div>

{#if loading}
  <LoadingSpinner message={t("common.loading")} />
{:else}
  <div class="settings-grid">
    <div class="card">
      <h2>{t("siteSettings.widgetSettings")}</h2>
      <div class="form-grid">
        <div class="form-group"><span class="label">{t("siteSettings.botName")}</span><input class="input" bind:value={config.botName} /></div>
        <div class="form-group"><span class="label">{t("siteSettings.welcomeMessage")}</span><input class="input" bind:value={config.welcomeMessage} /></div>
        <div class="form-group"><span class="label">{t("siteSettings.placeholder")}</span><input class="input" bind:value={config.inputPlaceholder} /></div>
        <div class="form-group"><span class="label">{t("siteSettings.position")}</span>
          <select class="select" bind:value={config.position}>
            <option value="right">{t("siteSettings.right")}</option>
            <option value="left">{t("siteSettings.left")}</option>
          </select>
        </div>
        <div class="form-row"><span class="label">{t("siteSettings.widgetActive")}</span><Toggle bind:checked={config.enabled} /></div>
        <div class="form-row"><span class="label">{t("siteSettings.soundEffect")}</span><Toggle bind:checked={config.soundEnabled} /></div>
      </div>
    </div>

    <div class="card">
      <h2>{t("siteSettings.appearance")}</h2>
      <div class="form-grid">
        <ColorPicker label={t("siteSettings.primaryColor")} bind:value={config.primaryColor} />
        <ColorPicker label={t("siteSettings.textColor")} bind:value={config.textColor} />
        <div class="form-group"><span class="label">{t("siteSettings.borderRadius")}</span><input class="input" type="number" bind:value={config.borderRadius} /></div>
      </div>
    </div>

    <div class="card">
      <h2>{t("siteSettings.logo")}</h2>
      <div class="logo-upload">
        <input type="file" accept="image/*" onchange={(e) => { logoFile = e.target.files[0]; }} />
        <Button onclick={uploadLogo} variant="secondary" size="sm" disabled={!logoFile}>{t("common.upload")}</Button>
      </div>
    </div>
  </div>
{/if}

<style>
  .page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
  .page-header h1 { font-size: 22px; font-weight: 700; }
  .page-header p { font-size: 13px; color: var(--text-muted); margin-top: 2px; }
  .settings-grid { display: flex; flex-direction: column; gap: 16px; }
  .card { background: var(--bg-card); border-radius: var(--radius); padding: 20px; box-shadow: var(--shadow); border: 1px solid var(--border-light); }
  .card h2 { font-size: 15px; font-weight: 600; margin-bottom: 14px; }
  .form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .form-group { display: flex; flex-direction: column; gap: 4px; }
  .form-row { display: flex; align-items: center; justify-content: space-between; }
  .label { font-size: 12px; font-weight: 600; color: var(--text-secondary); }
  .input, .select { width: 100%; padding: 8px 12px; border: 1px solid var(--border); border-radius: var(--radius-sm); font-size: 13px; font-family: inherit; color: var(--text); outline: none; }
  .input:focus { border-color: var(--accent); }
  .logo-upload { display: flex; align-items: center; gap: 12px; }
</style>

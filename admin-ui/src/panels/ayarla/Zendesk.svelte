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
  let testing = $state(false);
  let testPassed = $state(false);
  let settingUp = $state(false);

  onMount(async () => {
    try {
      const res = await api.get("admin/sunshine-config");
      config = res.config || res || {};
    } catch (e) {
      showToast(t("zendesk.loadError", { msg: e.message }), "error");
    } finally {
      loading = false;
    }
  });

  async function save() {
    try {
      await api.put("admin/sunshine-config", { config });
      showToast(t("zendesk.saved"), "success");
    } catch (e) {
      showToast(t("common.error", { msg: e.message }), "error");
    }
  }

  async function test() {
    testing = true;
    testPassed = false;
    try {
      const res = await api.post("admin/sunshine-config/test", {});
      if (res.ok) {
        testPassed = true;
        showToast(res.message || t("zendesk.connectionSuccess"), "success");
      } else {
        showToast(res.error || t("zendesk.testFailed"), "error");
      }
    } catch (e) {
      showToast(t("zendesk.testFailed") + ": " + e.message, "error");
    } finally {
      testing = false;
    }
  }

  async function setupSwitchboard() {
    settingUp = true;
    try {
      const res = await api.post("admin/sunshine-config/setup-switchboard", {});
      if (res.ok) {
        showToast(res.message, "success");
      } else {
        showToast(res.error || t("zendesk.switchboardFailed"), "error");
      }
    } catch (e) {
      showToast(t("zendesk.switchboardError", { msg: e.message }), "error");
    } finally {
      settingUp = false;
    }
  }
</script>

<div class="page-header">
  <div><h1>{t("zendesk.title")}</h1><p>{t("zendesk.subtitle")}</p></div>
  <div class="actions">
    <Button onclick={test} variant="secondary" size="sm" disabled={testing}>{testing ? t("zendesk.testing") : t("zendesk.testConnection")}</Button>
    <Button onclick={save} variant="primary" size="sm">{t("common.save")}</Button>
  </div>
</div>

{#if loading}
  <LoadingSpinner message={t("common.loading")} />
{:else}
  <div class="card">
    <div class="card-title">{t("zendesk.connectionSettings")}</div>
    <div class="form-grid">
      <div class="form-group"><span class="lbl">{t("zendesk.subdomain")}</span><input class="input" bind:value={config.subdomain} oninput={() => testPassed = false} placeholder={t("zendesk.subdomainPlaceholder")} /></div>
      <div class="form-group"><span class="lbl">{t("zendesk.appId")}</span><input class="input" bind:value={config.appId} oninput={() => testPassed = false} placeholder={t("zendesk.appIdPlaceholder")} /></div>
      <div class="form-group"><span class="lbl">{t("zendesk.keyId")}</span><input class="input" bind:value={config.keyId} oninput={() => testPassed = false} placeholder={t("zendesk.keyIdPlaceholder")} /></div>
      <div class="form-group"><span class="lbl">{t("zendesk.keySecret")}</span><input class="input" type="password" bind:value={config.keySecret} oninput={() => testPassed = false} placeholder={t("zendesk.keySecretPlaceholder")} /></div>
      <div class="form-group"><span class="lbl">{t("zendesk.webhookSecret")}</span><input class="input" type="password" bind:value={config.webhookSecret} placeholder={t("zendesk.webhookSecretPlaceholder")} /></div>
      <div class="form-group"><span class="lbl">{t("zendesk.greetingMessage")}</span><input class="input" bind:value={config.greetingMessage} placeholder={t("zendesk.greetingPlaceholder")} /><span class="hint">{t("zendesk.greetingHint")}</span></div>
      <div class="form-group"><span class="lbl">{t("zendesk.farewellMessage")}</span><input class="input" bind:value={config.farewellMessage} placeholder={t("zendesk.farewellPlaceholder")} /></div>
      <div class="form-row"><span class="lbl">{t("zendesk.integrationActive")}</span><Toggle bind:checked={config.enabled} /></div>
    </div>
  </div>

  <div class="card">
    <div class="card-title">{t("zendesk.webhookUrl")}</div>
    <p class="desc">{t("zendesk.webhookUrlHint")}</p>
    <input class="input webhook-url" value={config.webhookUrl || ""} readonly onclick={(e) => { e.target.select(); navigator.clipboard?.writeText(e.target.value); showToast(t("common.copied"), "success"); }} />
  </div>

  <div class="card switchboard-card">
    <div class="card-title">{t("zendesk.switchboardSetup")}</div>
    <p class="desc">{t("zendesk.switchboardHint")}</p>
    <Button onclick={setupSwitchboard} variant="secondary" size="sm" disabled={!testPassed || settingUp}>
      {settingUp ? t("zendesk.settingUp") : t("zendesk.setupSwitchboard")}
    </Button>
    {#if !testPassed}
      <span class="hint">{t("zendesk.passTestFirst")}</span>
    {/if}
  </div>
{/if}

<style>
  .page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
  .page-header h1 { font-size: 22px; font-weight: 700; }
  .page-header p { font-size: 13px; color: var(--text-muted); margin-top: 2px; }
  .actions { display: flex; gap: 8px; }
  .card { background: var(--bg-card); border-radius: var(--radius); padding: 20px; box-shadow: var(--shadow); border: 1px solid var(--border-light); }
  .form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .form-group { display: flex; flex-direction: column; gap: 4px; }
  .form-row { display: flex; align-items: center; justify-content: space-between; }
  .lbl { font-size: 12px; font-weight: 600; color: var(--text-secondary); }
  .input { width: 100%; padding: 8px 12px; border: 1px solid var(--border); border-radius: var(--radius-sm); font-size: 13px; font-family: inherit; color: var(--text); outline: none; }
  .input::placeholder { color: var(--text-muted); opacity: 0.6; }
  .webhook-url { background: var(--bg-hover); cursor: pointer; font-family: "JetBrains Mono", monospace; font-size: 12px; }
  .hint { font-size: 11px; color: var(--text-muted); }
  .card + .card { margin-top: 12px; }
  .card-title { font-size: 14px; font-weight: 600; margin: 0 0 12px 0; }
  .switchboard-card { display: flex; flex-direction: column; gap: 8px; align-items: flex-start; }
  .desc { font-size: 12px; color: var(--text-secondary); margin: 0; }
</style>

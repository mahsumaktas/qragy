<script>
  import { onMount } from "svelte";
  import { api } from "../../lib/api.js";
  import { showToast } from "../../lib/toast.svelte.js";
  import Button from "../../components/ui/Button.svelte";
  import Toggle from "../../components/ui/Toggle.svelte";
  import LoadingSpinner from "../../components/ui/LoadingSpinner.svelte";

  let loading = $state(true);
  let config = $state({});
  let testing = $state(false);

  onMount(async () => {
    try {
      const res = await api.get("admin/sunshine-config");
      config = res.config || res || {};
    } catch (e) {
      showToast("Zendesk config yuklenemedi: " + e.message, "error");
    } finally {
      loading = false;
    }
  });

  async function save() {
    try {
      await api.put("admin/sunshine-config", { config });
      showToast("Kaydedildi", "success");
    } catch (e) {
      showToast("Hata: " + e.message, "error");
    }
  }

  async function test() {
    testing = true;
    try {
      await api.post("admin/sunshine-config/test", {});
      showToast("Baglanti basarili", "success");
    } catch (e) {
      showToast("Test basarisiz: " + e.message, "error");
    } finally {
      testing = false;
    }
  }
</script>

<div class="page-header">
  <div><h1>Zendesk</h1><p>Zendesk Sunshine entegrasyonu</p></div>
  <div class="actions">
    <Button onclick={test} variant="secondary" size="sm" disabled={testing}>{testing ? "Test ediliyor..." : "Baglanti Test"}</Button>
    <Button onclick={save} variant="primary" size="sm">Kaydet</Button>
  </div>
</div>

{#if loading}
  <LoadingSpinner message="Yukleniyor..." />
{:else}
  <div class="card">
    <div class="form-grid">
      <div class="form-group"><span class="lbl">App ID</span><input class="input" bind:value={config.appId} /></div>
      <div class="form-group"><span class="lbl">Key ID</span><input class="input" bind:value={config.keyId} /></div>
      <div class="form-group"><span class="lbl">Secret</span><input class="input" type="password" bind:value={config.secret} /></div>
      <div class="form-group"><span class="lbl">Subdomain</span><input class="input" bind:value={config.subdomain} /></div>
      <div class="form-group"><span class="lbl">Webhook URL</span><input class="input" bind:value={config.webhookUrl} readonly /></div>
      <div class="form-row"><span class="lbl">Aktif</span><Toggle bind:checked={config.enabled} /></div>
    </div>
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
</style>

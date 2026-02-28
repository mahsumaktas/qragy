<script>
  import { onMount } from "svelte";
  import { api } from "../../lib/api.js";
  import { showToast } from "../../lib/toast.svelte.js";
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
      showToast("Site ayarlari yuklenemedi: " + e.message, "error");
    } finally {
      loading = false;
    }
  });

  async function save() {
    try {
      await api.put("admin/site-config", { config });
      showToast("Kaydedildi", "success");
    } catch (e) {
      showToast("Hata: " + e.message, "error");
    }
  }

  async function uploadLogo() {
    if (!logoFile) return;
    try {
      await api.upload("admin/site-logo", logoFile);
      showToast("Logo yuklendi", "success");
    } catch (e) {
      showToast("Hata: " + e.message, "error");
    }
  }
</script>

<div class="page-header">
  <div><h1>Site Ayarlari</h1><p>Widget gorunumu ve yapilandirmasi</p></div>
  <Button onclick={save} variant="primary" size="sm">Kaydet</Button>
</div>

{#if loading}
  <LoadingSpinner message="Yukleniyor..." />
{:else}
  <div class="settings-grid">
    <div class="card">
      <h2>Widget Ayarlari</h2>
      <div class="form-grid">
        <div class="form-group"><span class="label">Bot Adi</span><input class="input" bind:value={config.botName} /></div>
        <div class="form-group"><span class="label">Karsilama Mesaji</span><input class="input" bind:value={config.welcomeMessage} /></div>
        <div class="form-group"><span class="label">Placeholder</span><input class="input" bind:value={config.inputPlaceholder} /></div>
        <div class="form-group"><span class="label">Pozisyon</span>
          <select class="select" bind:value={config.position}>
            <option value="right">Sag</option>
            <option value="left">Sol</option>
          </select>
        </div>
        <div class="form-row"><span class="label">Widget Aktif</span><Toggle bind:checked={config.enabled} /></div>
        <div class="form-row"><span class="label">Ses Efekti</span><Toggle bind:checked={config.soundEnabled} /></div>
      </div>
    </div>

    <div class="card">
      <h2>Gorunum</h2>
      <div class="form-grid">
        <ColorPicker label="Ana Renk" bind:value={config.primaryColor} />
        <ColorPicker label="Metin Rengi" bind:value={config.textColor} />
        <div class="form-group"><span class="label">Border Radius</span><input class="input" type="number" bind:value={config.borderRadius} /></div>
      </div>
    </div>

    <div class="card">
      <h2>Logo</h2>
      <div class="logo-upload">
        <input type="file" accept="image/*" onchange={(e) => { logoFile = e.target.files[0]; }} />
        <Button onclick={uploadLogo} variant="secondary" size="sm" disabled={!logoFile}>Yukle</Button>
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

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
  let testPassed = $state(false);
  let settingUp = $state(false);

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
    testPassed = false;
    try {
      const res = await api.post("admin/sunshine-config/test", {});
      if (res.ok) {
        testPassed = true;
        showToast(res.message || "Baglanti basarili", "success");
      } else {
        showToast(res.error || "Test basarisiz", "error");
      }
    } catch (e) {
      showToast("Test basarisiz: " + e.message, "error");
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
        showToast(res.error || "Switchboard yapilandirilamadi", "error");
      }
    } catch (e) {
      showToast("Switchboard hatasi: " + e.message, "error");
    } finally {
      settingUp = false;
    }
  }
</script>

<div class="page-header">
  <div><h1>Zendesk Sunshine Conversations</h1><p>Zendesk chat widget uzerinden gelen mesajlari Qragy ile karsilayin. Eskalasyonda canli temsilciye otomatik aktarim yapilir.</p></div>
  <div class="actions">
    <Button onclick={test} variant="secondary" size="sm" disabled={testing}>{testing ? "Test ediliyor..." : "Baglanti Test"}</Button>
    <Button onclick={save} variant="primary" size="sm">Kaydet</Button>
  </div>
</div>

{#if loading}
  <LoadingSpinner message="Yukleniyor..." />
{:else}
  <div class="card">
    <div class="card-title">Baglanti Ayarlari</div>
    <div class="form-grid">
      <div class="form-group"><span class="lbl">Subdomain</span><input class="input" bind:value={config.subdomain} oninput={() => testPassed = false} placeholder="sirketiniz (.zendesk.com)" /></div>
      <div class="form-group"><span class="lbl">App ID</span><input class="input" bind:value={config.appId} oninput={() => testPassed = false} placeholder="Sunshine Conversations App ID" /></div>
      <div class="form-group"><span class="lbl">Key ID</span><input class="input" bind:value={config.keyId} oninput={() => testPassed = false} placeholder="API Key ID" /></div>
      <div class="form-group"><span class="lbl">Key Secret</span><input class="input" type="password" bind:value={config.keySecret} oninput={() => testPassed = false} placeholder="API Key Secret" /></div>
      <div class="form-group"><span class="lbl">Webhook Secret (X-API-Key)</span><input class="input" type="password" bind:value={config.webhookSecret} placeholder="Webhook dogrulama secret" /></div>
      <div class="form-group"><span class="lbl">Eskalasyon Veda Mesaji</span><input class="input" bind:value={config.farewellMessage} placeholder="Sizi canli destek temsilcisine aktariyorum. Iyi gunler!" /></div>
      <div class="form-row"><span class="lbl">Entegrasyon Aktif</span><Toggle bind:checked={config.enabled} /></div>
    </div>
  </div>

  <div class="card">
    <div class="card-title">Webhook URL</div>
    <p class="desc">Zendesk Sunshine Conversations ayarlarindan asagidaki URL'yi webhook olarak ekleyin. Trigger: <strong>conversation:message</strong></p>
    <input class="input webhook-url" value={config.webhookUrl || ""} readonly onclick={(e) => { e.target.select(); navigator.clipboard?.writeText(e.target.value); showToast("Kopyalandi", "success"); }} />
  </div>

  <div class="card switchboard-card">
    <div class="card-title">Switchboard Yapilandirmasi</div>
    <p class="desc">Baglanti testi basarili olduktan sonra Switchboard zincirini otomatik yapilandirir: answerBot → Qragy Bot → agentWorkspace</p>
    <Button onclick={setupSwitchboard} variant="secondary" size="sm" disabled={!testPassed || settingUp}>
      {settingUp ? "Yapilandiriliyor..." : "Switchboard Yapilandir"}
    </Button>
    {#if !testPassed}
      <span class="hint">Once baglanti testini basarili gecirin</span>
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

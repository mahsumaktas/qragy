<script>
  import { onMount } from "svelte";
  import { api } from "../../lib/api.js";
  import { showToast } from "../../lib/toast.svelte.js";
  import Button from "../../components/ui/Button.svelte";
  import Toggle from "../../components/ui/Toggle.svelte";
  import LoadingSpinner from "../../components/ui/LoadingSpinner.svelte";

  let loading = $state(true);
  let config = $state({});

  onMount(async () => {
    try {
      const res = await api.get("admin/chat-flow");
      config = res.config || res || {};
    } catch (e) {
      showToast("Sohbet akisi yuklenemedi: " + e.message, "error");
    } finally {
      loading = false;
    }
  });

  async function save() {
    try {
      await api.put("admin/chat-flow", { config });
      showToast("Kaydedildi", "success");
    } catch (e) {
      showToast("Hata: " + e.message, "error");
    }
  }
</script>

<div class="page-header">
  <div>
    <h1>Sohbet Akisi</h1>
    <p>Karsilama, zamanlama, algilama, kapanis ayarlari</p>
  </div>
  <Button onclick={save} variant="primary" size="sm">Kaydet</Button>
</div>

{#if loading}
  <LoadingSpinner message="Yukleniyor..." />
{:else}
  <div class="flow-sections">
    <div class="card">
      <h2>Karsilama</h2>
      <div class="form-grid">
        <div class="form-row">
          <label>Karsilama Aktif
            <Toggle bind:checked={config.greetingEnabled} />
          </label>
        </div>
        <div class="form-group">
          <label>Karsilama Mesaji
            <textarea class="textarea" bind:value={config.greetingMessage} rows="3"></textarea>
          </label>
        </div>
        <div class="form-group">
          <label>Karsilama Gecikmesi (ms)
            <input class="input" type="number" bind:value={config.greetingDelay} />
          </label>
        </div>
      </div>
    </div>

    <div class="card">
      <h2>Zamanlama</h2>
      <div class="form-grid">
        <div class="form-group">
          <label>Mesai Disi Mesaji
            <textarea class="textarea" bind:value={config.offHoursMessage} rows="2"></textarea>
          </label>
        </div>
        <div class="form-group">
          <label>Otomatik Kapanis (dk)
            <input class="input" type="number" bind:value={config.autoCloseMinutes} />
          </label>
        </div>
        <div class="form-group">
          <label>Inaktiflik Uyarisi (dk)
            <input class="input" type="number" bind:value={config.inactivityWarningMinutes} />
          </label>
        </div>
      </div>
    </div>

    <div class="card">
      <h2>Algilama</h2>
      <div class="form-grid">
        <div class="form-row">
          <label>Konu Algilama Aktif
            <Toggle bind:checked={config.topicDetectionEnabled} />
          </label>
        </div>
        <div class="form-row">
          <label>Duygu Analizi
            <Toggle bind:checked={config.sentimentEnabled} />
          </label>
        </div>
        <div class="form-group">
          <label>Maks Klarifikasyon
            <input class="input" type="number" bind:value={config.maxClarifications} />
          </label>
        </div>
      </div>
    </div>

    <div class="card">
      <h2>Kapanis</h2>
      <div class="form-grid">
        <div class="form-group">
          <label>Kapanis Mesaji
            <textarea class="textarea" bind:value={config.closingMessage} rows="2"></textarea>
          </label>
        </div>
        <div class="form-row">
          <label>CSAT Anketi
            <Toggle bind:checked={config.csatEnabled} />
          </label>
        </div>
      </div>
    </div>
  </div>
{/if}

<style>
  .page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
  .page-header h1 { font-size: 22px; font-weight: 700; }
  .page-header p { font-size: 13px; color: var(--text-muted); margin-top: 2px; }

  .flow-sections { display: flex; flex-direction: column; gap: 16px; }
  .card { background: var(--bg-card); border-radius: var(--radius); padding: 20px; box-shadow: var(--shadow); border: 1px solid var(--border-light); }
  .card h2 { font-size: 15px; font-weight: 600; margin-bottom: 14px; }
  .form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .form-group { display: flex; flex-direction: column; gap: 4px; }
  .form-group label { font-size: 12px; font-weight: 600; color: var(--text-secondary); }
  .form-row { display: flex; align-items: center; justify-content: space-between; }
  .form-row label { font-size: 12px; font-weight: 600; color: var(--text-secondary); }
  .input { width: 100%; padding: 8px 12px; border: 1px solid var(--border); border-radius: var(--radius-sm); font-size: 13px; font-family: inherit; color: var(--text); outline: none; }
  .input:focus { border-color: var(--accent); }
  .textarea { width: 100%; padding: 8px 12px; border: 1px solid var(--border); border-radius: var(--radius-sm); font-size: 13px; font-family: inherit; color: var(--text); resize: vertical; outline: none; }
</style>

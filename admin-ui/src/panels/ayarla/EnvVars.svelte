<script>
  import { onMount } from "svelte";
  import { api } from "../../lib/api.js";
  import { showToast } from "../../lib/toast.svelte.js";
  import Button from "../../components/ui/Button.svelte";
  import LoadingSpinner from "../../components/ui/LoadingSpinner.svelte";

  let loading = $state(true);
  let entries = $state([]);
  let updates = $state({});

  const MASKED_KEYS = ["ADMIN_TOKEN", "GOOGLE_API_KEY", "ANTHROPIC_API_KEY", "OPENAI_API_KEY", "GROQ_API_KEY"];

  onMount(async () => {
    try {
      const res = await api.get("admin/env");
      const raw = res.env || res.config || res || {};
      entries = Object.entries(raw).map(([key, value]) => ({ key, value: String(value), masked: MASKED_KEYS.includes(key) }));
    } catch (e) {
      showToast("Ortam degiskenleri yuklenemedi: " + e.message, "error");
    } finally {
      loading = false;
    }
  });

  function handleChange(key, val) {
    updates[key] = val;
  }

  async function save() {
    if (!Object.keys(updates).length) return;
    try {
      await api.put("admin/env", { updates });
      showToast("Kaydedildi — yeniden baslama gerekebilir", "success");
      updates = {};
    } catch (e) {
      showToast("Hata: " + e.message, "error");
    }
  }
</script>

<div class="page-header">
  <div><h1>Ortam Degiskenleri</h1><p>Sunucu .env degerleri</p></div>
  <Button onclick={save} variant="primary" size="sm" disabled={!Object.keys(updates).length}>Kaydet</Button>
</div>

{#if loading}
  <LoadingSpinner message="Yukleniyor..." />
{:else}
  <div class="card">
    <table>
      <thead><tr><th>Anahtar</th><th>Deger</th></tr></thead>
      <tbody>
        {#each entries as entry}
          <tr>
            <td class="mono key-col">{entry.key}</td>
            <td>
              {#if entry.masked}
                <input class="input" type="password" value={entry.value} oninput={(e) => handleChange(entry.key, e.target.value)} />
              {:else}
                <input class="input" value={entry.value} oninput={(e) => handleChange(entry.key, e.target.value)} />
              {/if}
            </td>
          </tr>
        {:else}
          <tr><td colspan="2" class="empty-row">Degisken yok</td></tr>
        {/each}
      </tbody>
    </table>
  </div>
{/if}

<style>
  .page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
  .page-header h1 { font-size: 22px; font-weight: 700; }
  .page-header p { font-size: 13px; color: var(--text-muted); margin-top: 2px; }
  .card { background: var(--bg-card); border-radius: var(--radius); box-shadow: var(--shadow); border: 1px solid var(--border-light); overflow: hidden; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th { text-align: left; padding: 10px 12px; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: .5px; color: var(--text-muted); border-bottom: 1px solid var(--border); background: var(--bg); }
  td { padding: 8px 12px; border-bottom: 1px solid var(--border-light); }
  .key-col { font-weight: 600; width: 260px; }
  .mono { font-family: "JetBrains Mono", monospace; font-size: 12px; }
  .input { width: 100%; padding: 6px 10px; border: 1px solid var(--border); border-radius: var(--radius-sm); font-size: 12px; font-family: "JetBrains Mono", monospace; color: var(--text); outline: none; }
  .input:focus { border-color: var(--accent); }
  .empty-row { text-align: center; color: var(--text-muted); padding: 32px; }
</style>

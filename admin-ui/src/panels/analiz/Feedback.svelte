<script>
  import { onMount } from "svelte";
  import { api } from "../../lib/api.js";
  import { showToast } from "../../lib/toast.svelte.js";
  import KpiCard from "../../components/ui/KpiCard.svelte";
  import LoadingSpinner from "../../components/ui/LoadingSpinner.svelte";

  let loading = $state(true);
  let report = $state(null);
  let feedbacks = $state([]);
  let days = $state(30);

  onMount(() => load());

  async function load() {
    loading = true;
    try {
      const [r, f] = await Promise.all([
        api.get("admin/feedback-report?days=" + days),
        api.get("admin/feedback").catch(() => ({ feedbacks: [] })),
      ]);
      report = r;
      feedbacks = f.feedbacks || f || [];
    } catch (e) {
      showToast("Feedback yuklenemedi: " + e.message, "error");
    } finally {
      loading = false;
    }
  }
</script>

<div class="page-header">
  <div><h1>Feedback Raporu</h1><p>Kullanici geri bildirimleri</p></div>
  <select class="select" bind:value={days} onchange={load}>
    <option value={7}>7 Gun</option>
    <option value={30}>30 Gun</option>
    <option value={90}>90 Gun</option>
  </select>
</div>

{#if loading}
  <LoadingSpinner message="Yukleniyor..." />
{:else}
  {#if report}
    <div class="kpi-grid">
      <KpiCard label="Toplam Feedback" value={report.totalFeedbacks ?? report.total ?? 0} />
      <KpiCard label="Ort. CSAT" value={(report.avgCsat ?? 0).toFixed(1) + "/5"} />
      <KpiCard label="Pozitif" value={report.positive ?? 0} color="var(--success)" />
      <KpiCard label="Negatif" value={report.negative ?? 0} color="var(--error)" />
    </div>
  {/if}

  {#if feedbacks.length}
    <div class="card">
      <h2>Son Geri Bildirimler</h2>
      <table>
        <thead><tr><th>Puan</th><th>Yorum</th><th>Oturum</th></tr></thead>
        <tbody>
          {#each feedbacks.slice(0, 20) as fb}
            <tr>
              <td><span class="rating" class:good={fb.rating >= 4} class:bad={fb.rating <= 2}>{fb.rating}/5</span></td>
              <td>{fb.comment || "-"}</td>
              <td class="mono">{fb.sessionId?.slice(-8) || "-"}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
{/if}

<style>
  .page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
  .page-header h1 { font-size: 22px; font-weight: 700; }
  .page-header p { font-size: 13px; color: var(--text-muted); margin-top: 2px; }
  .select { padding: 6px 10px; border: 1px solid var(--border); border-radius: var(--radius-sm); font-size: 13px; font-family: inherit; }
  .kpi-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 20px; }
  .card { background: var(--bg-card); border-radius: var(--radius); padding: 20px; box-shadow: var(--shadow); border: 1px solid var(--border-light); }
  .card h2 { font-size: 15px; font-weight: 600; margin-bottom: 12px; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th { text-align: left; padding: 10px 12px; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: .5px; color: var(--text-muted); border-bottom: 1px solid var(--border); }
  td { padding: 10px 12px; border-bottom: 1px solid var(--border-light); color: var(--text-secondary); }
  .mono { font-family: "JetBrains Mono", monospace; font-size: 12px; }
  .rating { font-weight: 700; }
  .rating.good { color: var(--success); }
  .rating.bad { color: var(--error); }

  @media (max-width: 1024px) { .kpi-grid { grid-template-columns: repeat(2, 1fr); } }
  @media (max-width: 768px) { .kpi-grid { grid-template-columns: 1fr; } }
</style>

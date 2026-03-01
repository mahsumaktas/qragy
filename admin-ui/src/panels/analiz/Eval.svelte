<script>
  import { onMount, onDestroy } from "svelte";
  import { api } from "../../lib/api.js";
  import { createSSE } from "../../lib/sse.js";
  import { showToast } from "../../lib/toast.svelte.js";
  import { showConfirm } from "../../lib/confirm.svelte.js";
  import Button from "../../components/ui/Button.svelte";
  import Badge from "../../components/ui/Badge.svelte";
  import Modal from "../../components/ui/Modal.svelte";
  import ProgressBar from "../../components/ui/ProgressBar.svelte";
  import LoadingSpinner from "../../components/ui/LoadingSpinner.svelte";

  let loading = $state(true);
  let scenarios = $state([]);
  let history = $state([]);
  let running = $state(false);
  let progress = $state({ completed: 0, total: 0, text: "" });
  let results = $state({});
  let editOpen = $state(false);
  let editScenario = $state({ id: "", title: "", tags: [], turns: [{ user: "", expect: {} }] });
  let editId = $state(null);
  let sseHandle = null;

  onMount(() => loadEval());
  onDestroy(() => sseHandle?.close());

  async function loadEval() {
    loading = true;
    try {
      const [s, h] = await Promise.all([
        api.get("admin/eval/scenarios"),
        api.get("admin/eval/history").catch(() => ({ history: [] })),
      ]);
      scenarios = s.scenarios || s || [];
      history = Array.isArray(h) ? h : (h.history || []);
    } catch (e) {
      showToast("Eval yuklenemedi: " + e.message, "error");
    } finally {
      loading = false;
    }
  }

  function runAll() {
    running = true;
    progress = { completed: 0, total: scenarios.length, text: "Baslatiliyor..." };
    results = {};

    sseHandle = createSSE("admin/eval/run-all?runs=3", {
      onMessage(data) {
        if (data.type === "progress") {
          progress.completed++;
          progress.text = data.scenarioId + ": " + (data.pass ? "GECTI" : "KALDI");
          results[data.scenarioId] = data;
        }
        if (data.type === "done") {
          running = false;
          sseHandle?.close();
          const sum = data.summary || data;
          progress.text = "Tamamlandi — " + sum.passed + "/" + sum.total + " gecti (%"+ sum.passRate +")";
          showToast("Eval tamamlandi: " + sum.passed + "/" + sum.total, sum.passed === sum.total ? "success" : "warning");
          loadEval();
        }
        if (data.type === "error") {
          running = false;
          sseHandle?.close();
          progress.text = "Hata: " + data.message;
          showToast("Eval hatasi: " + data.message, "error");
        }
      },
      onError() {
        running = false;
        progress.text = "Baglanti hatasi";
      },
    });
  }

  async function runSingle(id) {
    try {
      const res = await api.post("admin/eval/run/" + id + "?runs=3", {});
      results[id] = res;
      showToast(id + ": " + (res.pass ? "GECTI" : "KALDI"), res.pass ? "success" : "warning");
    } catch (e) {
      showToast("Hata: " + e.message, "error");
    }
  }

  function openNew() {
    editId = null;
    editScenario = { id: "", title: "", tags: [], turns: [{ user: "", expect: {} }] };
    editOpen = true;
  }

  function openEdit(s) {
    editId = s.id;
    editScenario = {
      id: s.id,
      title: s.title || "",
      tags: [...(s.tags || [])],
      turns: (s.turns || []).map(t => ({ ...t, expect: { ...t.expect } })),
    };
    editOpen = true;
  }

  async function saveScenario() {
    if (!editScenario.id || !editScenario.turns?.length || !editScenario.turns[0]?.user) return;
    try {
      if (editId) {
        await api.put("admin/eval/scenarios/" + editId, editScenario);
      } else {
        await api.post("admin/eval/scenarios", editScenario);
      }
      showToast("Kaydedildi", "success");
      editOpen = false;
      await loadEval();
    } catch (e) {
      showToast("Hata: " + e.message, "error");
    }
  }

  async function deleteScenario(id) {
    const ok = await showConfirm({ title: "Sil", message: "Senaryo silinecek.", confirmText: "Sil", danger: true });
    if (!ok) return;
    try {
      await api.delete("admin/eval/scenarios/" + id);
      showToast("Silindi", "success");
      await loadEval();
    } catch (e) {
      showToast("Hata: " + e.message, "error");
    }
  }

  async function clearHistory() {
    const ok = await showConfirm({ title: "Gecmisi Temizle", message: "Tum eval gecmisi silinecek.", confirmText: "Temizle", danger: true });
    if (!ok) return;
    try {
      await api.delete("admin/eval/history");
      history = [];
      showToast("Gecmis temizlendi", "success");
    } catch (e) {
      showToast("Hata: " + e.message, "error");
    }
  }
</script>

<div class="page-header">
  <div><h1>Eval Yonetimi</h1><p>{scenarios.length} senaryo</p></div>
  <div class="actions">
    <Button onclick={clearHistory} variant="ghost" size="sm">Gecmisi Temizle</Button>
    <Button onclick={openNew} variant="secondary" size="sm">+ Senaryo</Button>
    <Button onclick={runAll} variant="primary" size="sm" disabled={running || !scenarios.length}>{running ? "Calisiyor..." : "Tumu Calistir"}</Button>
  </div>
</div>

{#if running}
  <div class="progress-card">
    <ProgressBar value={progress.completed} max={progress.total} />
    <p class="progress-text">{progress.completed}/{progress.total} — {progress.text}</p>
  </div>
{/if}

{#if loading}
  <LoadingSpinner message="Yukleniyor..." />
{:else}
  <div class="card">
    <table>
      <thead><tr><th>ID</th><th>Baslik</th><th>Turn</th><th>Son Sonuc</th><th></th></tr></thead>
      <tbody>
        {#each scenarios as s}
          <tr>
            <td class="mono">{s.id}</td>
            <td>{s.title?.slice(0, 60) || s.turns?.[0]?.user?.slice(0, 60) || "-"}</td>
            <td class="muted">{s.turns?.length || 0}</td>
            <td>
              {#if results[s.id]}
                <Badge variant={results[s.id].pass ? "green" : "red"}>{results[s.id].pass ? "GECTI" : "KALDI"}</Badge>
              {:else}
                <span class="muted">-</span>
              {/if}
            </td>
            <td class="row-actions">
              <Button onclick={() => runSingle(s.id)} variant="ghost" size="sm">Calistir</Button>
              <Button onclick={() => openEdit(s)} variant="ghost" size="sm">Duzenle</Button>
              <Button onclick={() => deleteScenario(s.id)} variant="ghost" size="sm">Sil</Button>
            </td>
          </tr>
        {:else}
          <tr><td colspan="5" class="empty-row">Senaryo yok</td></tr>
        {/each}
      </tbody>
    </table>
  </div>

  {#if history.length > 0}
    <div class="history-section">
      <h2>Gecmis</h2>
      <div class="card">
        <table>
          <thead><tr><th>Tarih</th><th>Toplam</th><th>Gecti</th><th>Kaldi</th><th>Oran</th><th>Sure</th></tr></thead>
          <tbody>
            {#each history as h}
              <tr>
                <td>{new Date(h.timestamp).toLocaleString("tr-TR")}</td>
                <td>{h.total}</td>
                <td class="pass-cell">{h.passed}</td>
                <td class="fail-cell">{h.failed}</td>
                <td><Badge variant={h.green ? "green" : "red"}>%{h.passRate}</Badge></td>
                <td class="muted">{h.durationMs ? (h.durationMs / 1000).toFixed(1) + "s" : "-"}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </div>
  {/if}
{/if}

<Modal bind:open={editOpen} title={editId ? "Senaryo Duzenle" : "Yeni Senaryo"} width="640px">
  <div class="form-group"><span class="lbl">ID</span><input class="input mono" bind:value={editScenario.id} placeholder="S01" disabled={!!editId} /></div>
  <div class="form-group"><span class="lbl">Baslik</span><input class="input" bind:value={editScenario.title} placeholder="Senaryo aciklamasi..." /></div>
  <div class="form-group"><span class="lbl">Etiketler (virgul ile)</span><input class="input" value={(editScenario.tags || []).join(", ")} oninput={(e) => { editScenario.tags = e.target.value.split(",").map(s => s.trim()).filter(Boolean); }} /></div>

  <div class="turns-section">
    <div class="turns-header">
      <span class="lbl">Turn'lar ({editScenario.turns?.length || 0})</span>
      <Button onclick={() => { editScenario.turns = [...(editScenario.turns || []), { user: "", expect: {} }]; }} variant="ghost" size="sm">+ Turn</Button>
    </div>
    {#each editScenario.turns || [] as turn, i}
      <div class="turn-card">
        <div class="turn-top">
          <span class="turn-num">#{i + 1}</span>
          {#if (editScenario.turns || []).length > 1}
            <Button onclick={() => { editScenario.turns = editScenario.turns.filter((_, idx) => idx !== i); }} variant="ghost" size="sm">Sil</Button>
          {/if}
        </div>
        <div class="form-group"><span class="lbl">Kullanici Mesaji</span><textarea class="textarea" bind:value={turn.user} rows="2" placeholder="Kullanicinin mesaji..."></textarea></div>
        <div class="form-group"><span class="lbl">Beklenen (shouldContainAny, virgul ile)</span><input class="input" value={(turn.expect?.shouldContainAny || []).join(", ")} oninput={(e) => { turn.expect = { ...turn.expect, shouldContainAny: e.target.value.split(",").map(s => s.trim()).filter(Boolean) }; }} /></div>
      </div>
    {/each}
  </div>

  <div class="modal-actions">
    <Button onclick={() => (editOpen = false)} variant="secondary">Iptal</Button>
    <Button onclick={saveScenario} variant="primary">Kaydet</Button>
  </div>
</Modal>

<style>
  .page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
  .page-header h1 { font-size: 22px; font-weight: 700; }
  .page-header p { font-size: 13px; color: var(--text-muted); margin-top: 2px; }
  .actions { display: flex; gap: 8px; }
  .progress-card { background: var(--bg-card); border-radius: var(--radius); padding: 16px; margin-bottom: 16px; box-shadow: var(--shadow); border: 1px solid var(--border-light); }
  .progress-text { font-size: 12px; color: var(--text-secondary); margin-top: 8px; }
  .card { background: var(--bg-card); border-radius: var(--radius); box-shadow: var(--shadow); border: 1px solid var(--border-light); overflow: hidden; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th { text-align: left; padding: 10px 12px; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: .5px; color: var(--text-muted); border-bottom: 1px solid var(--border); background: var(--bg); }
  td { padding: 10px 12px; border-bottom: 1px solid var(--border-light); color: var(--text-secondary); }
  .mono { font-family: "JetBrains Mono", monospace; font-size: 12px; }
  .muted { color: var(--text-muted); }
  .row-actions { display: flex; gap: 4px; }
  .empty-row { text-align: center; color: var(--text-muted); padding: 32px; }
  .form-group { margin-bottom: 14px; display: flex; flex-direction: column; gap: 4px; }
  .lbl { font-size: 12px; font-weight: 600; color: var(--text-secondary); }
  .input { width: 100%; padding: 8px 12px; border: 1px solid var(--border); border-radius: var(--radius-sm); font-size: 13px; font-family: inherit; color: var(--text); outline: none; }
  .textarea { width: 100%; padding: 8px 12px; border: 1px solid var(--border); border-radius: var(--radius-sm); font-size: 13px; font-family: inherit; color: var(--text); resize: vertical; outline: none; }
  .modal-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 16px; }
  .turns-section { margin-top: 8px; }
  .turns-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
  .turn-card { background: var(--bg); border: 1px solid var(--border-light); border-radius: var(--radius-sm); padding: 10px; margin-bottom: 8px; }
  .turn-top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; }
  .turn-num { font-size: 11px; font-weight: 700; color: var(--text-muted); }
  .history-section { margin-top: 24px; }
  .history-section h2 { font-size: 16px; font-weight: 700; margin-bottom: 10px; }
  .pass-cell { color: var(--color-green, #22c55e); font-weight: 600; }
  .fail-cell { color: var(--color-red, #ef4444); font-weight: 600; }
</style>

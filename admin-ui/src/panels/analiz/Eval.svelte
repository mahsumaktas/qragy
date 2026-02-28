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
  let editScenario = $state({ id: "", input: "", expectedTopics: [], assertions: [] });
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
      history = h.history || h || [];
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
          progress.text = "Tamamlandi — " + data.passed + "/" + data.total + " gecti";
          showToast("Eval tamamlandi: " + data.passed + "/" + data.total, data.passed === data.total ? "success" : "warning");
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
    editScenario = { id: "", input: "", expectedTopics: [], assertions: [] };
    editOpen = true;
  }

  function openEdit(s) {
    editId = s.id;
    editScenario = { ...s, expectedTopics: [...(s.expectedTopics || [])], assertions: [...(s.assertions || [])] };
    editOpen = true;
  }

  async function saveScenario() {
    if (!editScenario.id || !editScenario.input) return;
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
      <thead><tr><th>ID</th><th>Girdi</th><th>Son Sonuc</th><th></th></tr></thead>
      <tbody>
        {#each scenarios as s}
          <tr>
            <td class="mono">{s.id}</td>
            <td>{s.input?.slice(0, 60) || "-"}</td>
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
          <tr><td colspan="4" class="empty-row">Senaryo yok</td></tr>
        {/each}
      </tbody>
    </table>
  </div>
{/if}

<Modal bind:open={editOpen} title={editId ? "Senaryo Duzenle" : "Yeni Senaryo"} width="600px">
  <div class="form-group"><span class="lbl">ID</span><input class="input mono" bind:value={editScenario.id} placeholder="S01" disabled={!!editId} /></div>
  <div class="form-group"><span class="lbl">Kullanici Girdisi</span><textarea class="textarea" bind:value={editScenario.input} rows="3" placeholder="Kullanicinin mesaji..."></textarea></div>
  <div class="form-group"><span class="lbl">Beklenen Konular (virgul ile)</span><input class="input" value={(editScenario.expectedTopics || []).join(", ")} oninput={(e) => { editScenario.expectedTopics = e.target.value.split(",").map(s => s.trim()).filter(Boolean); }} /></div>
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
</style>

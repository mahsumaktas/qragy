<script>
  import { onMount, onDestroy } from "svelte";
  import { t } from "../../lib/i18n.svelte.js";
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
      showToast(t("eval.loadError", { msg: e.message }), "error");
    } finally {
      loading = false;
    }
  }

  function runAll() {
    running = true;
    progress = { completed: 0, total: scenarios.length, text: t("eval.starting") };
    results = {};

    sseHandle = createSSE("admin/eval/run-all?runs=3", {
      onMessage(data) {
        if (data.type === "progress") {
          progress.completed++;
          progress.text = data.scenarioId + ": " + (data.pass ? t("eval.passed") : t("eval.failed"));
          results[data.scenarioId] = data;
        }
        if (data.type === "done") {
          running = false;
          sseHandle?.close();
          const sum = data.summary || data;
          progress.text = t("eval.completed", { passed: sum.passed + "/" + sum.total, rate: sum.passRate });
          showToast(t("eval.evalCompleted", { result: sum.passed + "/" + sum.total }), sum.passed === sum.total ? "success" : "warning");
          loadEval();
        }
        if (data.type === "error") {
          running = false;
          sseHandle?.close();
          progress.text = data.message;
          showToast(t("eval.evalError", { msg: data.message }), "error");
        }
      },
      onError() {
        running = false;
        progress.text = t("eval.connectionError");
      },
    });
  }

  async function runSingle(id) {
    try {
      const res = await api.post("admin/eval/run/" + id + "?runs=3", {});
      results[id] = res;
      showToast(id + ": " + (res.pass ? t("eval.passed") : t("eval.failed")), res.pass ? "success" : "warning");
    } catch (e) {
      showToast(t("common.error", { msg: e.message }), "error");
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
      showToast(t("common.saved"), "success");
      editOpen = false;
      await loadEval();
    } catch (e) {
      showToast(t("common.error", { msg: e.message }), "error");
    }
  }

  async function deleteScenario(id) {
    const ok = await showConfirm({ title: t("common.delete"), message: t("eval.deleteMsg"), confirmText: t("common.delete"), danger: true });
    if (!ok) return;
    try {
      await api.delete("admin/eval/scenarios/" + id);
      showToast(t("common.deleted"), "success");
      await loadEval();
    } catch (e) {
      showToast(t("common.error", { msg: e.message }), "error");
    }
  }

  async function clearHistory() {
    const ok = await showConfirm({ title: t("eval.clearHistory"), message: t("eval.clearHistoryMsg"), confirmText: t("eval.clearBtn"), danger: true });
    if (!ok) return;
    try {
      await api.delete("admin/eval/history");
      history = [];
      showToast(t("eval.historyCleared"), "success");
    } catch (e) {
      showToast(t("common.error", { msg: e.message }), "error");
    }
  }
</script>

<div class="page-header">
  <div><h1>{t("eval.title")}</h1><p>{t("eval.scenarios", { n: scenarios.length })}</p></div>
  <div class="actions">
    <Button onclick={clearHistory} variant="ghost" size="sm">{t("eval.clearHistory")}</Button>
    <Button onclick={openNew} variant="secondary" size="sm">{t("eval.addScenario")}</Button>
    <Button onclick={runAll} variant="primary" size="sm" disabled={running || !scenarios.length}>{running ? t("eval.running") : t("eval.runAll")}</Button>
  </div>
</div>

{#if running}
  <div class="progress-card">
    <ProgressBar value={progress.completed} max={progress.total} />
    <p class="progress-text">{progress.completed}/{progress.total} — {progress.text}</p>
  </div>
{/if}

{#if loading}
  <LoadingSpinner message={t("common.loading")} />
{:else}
  <div class="card">
    <table>
      <thead><tr><th>{t("eval.id")}</th><th>{t("eval.titleCol")}</th><th>{t("eval.turn")}</th><th>{t("eval.lastResult")}</th><th></th></tr></thead>
      <tbody>
        {#each scenarios as s}
          <tr>
            <td class="mono">{s.id}</td>
            <td>{s.title?.slice(0, 60) || s.turns?.[0]?.user?.slice(0, 60) || "-"}</td>
            <td class="muted">{s.turns?.length || 0}</td>
            <td>
              {#if results[s.id]}
                <Badge variant={results[s.id].pass ? "green" : "red"}>{results[s.id].pass ? t("eval.passed") : t("eval.failed")}</Badge>
              {:else}
                <span class="muted">-</span>
              {/if}
            </td>
            <td class="row-actions">
              <Button onclick={() => runSingle(s.id)} variant="ghost" size="sm">{t("eval.run")}</Button>
              <Button onclick={() => openEdit(s)} variant="ghost" size="sm">{t("common.edit")}</Button>
              <Button onclick={() => deleteScenario(s.id)} variant="ghost" size="sm">{t("common.delete")}</Button>
            </td>
          </tr>
        {:else}
          <tr><td colspan="5" class="empty-row">{t("eval.noScenarios")}</td></tr>
        {/each}
      </tbody>
    </table>
  </div>

  {#if history.length > 0}
    <div class="history-section">
      <h2>{t("eval.history")}</h2>
      <div class="card">
        <table>
          <thead><tr><th>{t("eval.date")}</th><th>{t("eval.total")}</th><th>{t("eval.passedCol")}</th><th>{t("eval.failedCol")}</th><th>{t("eval.rate")}</th><th>{t("eval.duration")}</th></tr></thead>
          <tbody>
            {#each history as h}
              <tr>
                <td>{new Date(h.timestamp).toLocaleString("en-US")}</td>
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

<Modal bind:open={editOpen} title={editId ? t("eval.editScenario") : t("eval.newScenario")} width="640px">
  <div class="form-group"><span class="lbl">{t("eval.id")}</span><input class="input mono" bind:value={editScenario.id} placeholder="S01" disabled={!!editId} /></div>
  <div class="form-group"><span class="lbl">{t("eval.titleCol")}</span><input class="input" bind:value={editScenario.title} placeholder={t("eval.titlePlaceholder")} /></div>
  <div class="form-group"><span class="lbl">{t("eval.tags")}</span><input class="input" value={(editScenario.tags || []).join(", ")} oninput={(e) => { editScenario.tags = e.target.value.split(",").map(s => s.trim()).filter(Boolean); }} /></div>

  <div class="turns-section">
    <div class="turns-header">
      <span class="lbl">{t("eval.turns", { n: editScenario.turns?.length || 0 })}</span>
      <Button onclick={() => { editScenario.turns = [...(editScenario.turns || []), { user: "", expect: {} }]; }} variant="ghost" size="sm">{t("eval.addTurn")}</Button>
    </div>
    {#each editScenario.turns || [] as turn, i}
      <div class="turn-card">
        <div class="turn-top">
          <span class="turn-num">#{i + 1}</span>
          {#if (editScenario.turns || []).length > 1}
            <Button onclick={() => { editScenario.turns = editScenario.turns.filter((_, idx) => idx !== i); }} variant="ghost" size="sm">{t("common.delete")}</Button>
          {/if}
        </div>
        <div class="form-group"><span class="lbl">{t("eval.userMessage")}</span><textarea class="textarea" bind:value={turn.user} rows="2" placeholder={t("eval.userMsgPlaceholder")}></textarea></div>
        <div class="form-group"><span class="lbl">{t("eval.expected")}</span><input class="input" value={(turn.expect?.shouldContainAny || []).join(", ")} oninput={(e) => { turn.expect = { ...turn.expect, shouldContainAny: e.target.value.split(",").map(s => s.trim()).filter(Boolean) }; }} /></div>
      </div>
    {/each}
  </div>

  <div class="modal-actions">
    <Button onclick={() => (editOpen = false)} variant="secondary">{t("common.cancel")}</Button>
    <Button onclick={saveScenario} variant="primary">{t("common.save")}</Button>
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

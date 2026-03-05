<script>
  import { onMount, onDestroy } from "svelte";
  import { t, getDateLocale } from "../../lib/i18n.svelte.js";
  import { api } from "../../lib/api.js";
  import { createSSE } from "../../lib/sse.js";
  import { showToast } from "../../lib/toast.svelte.js";
  import { showConfirm } from "../../lib/confirm.svelte.js";
  import Button from "../../components/ui/Button.svelte";
  import Badge from "../../components/ui/Badge.svelte";
  import Modal from "../../components/ui/Modal.svelte";
  import ProgressBar from "../../components/ui/ProgressBar.svelte";
  import LoadingSpinner from "../../components/ui/LoadingSpinner.svelte";

  const ASSERTION_TYPES = [
    { value: "shouldContainAny", valueType: "array", labelKey: "eval.assertType.shouldContainAny", hintKey: "eval.assertHint.array" },
    { value: "shouldNotContain", valueType: "array", labelKey: "eval.assertType.shouldNotContain", hintKey: "eval.assertHint.array" },
    { value: "shouldNotContainAny", valueType: "array", labelKey: "eval.assertType.shouldNotContainAny", hintKey: "eval.assertHint.array" },
    { value: "stateShouldBe", valueType: "string", labelKey: "eval.assertType.stateShouldBe", hintKey: "eval.assertHint.string" },
    { value: "topicShouldBe", valueType: "string", labelKey: "eval.assertType.topicShouldBe", hintKey: "eval.assertHint.string" },
    { value: "handoffReady", valueType: "boolean", labelKey: "eval.assertType.handoffReady", hintKey: "eval.assertHint.boolean" },
    { value: "earlyEscalation", valueType: "boolean", labelKey: "eval.assertType.earlyEscalation", hintKey: "eval.assertHint.boolean" },
    { value: "branchCodeShouldBe", valueType: "string", labelKey: "eval.assertType.branchCodeShouldBe", hintKey: "eval.assertHint.string" },
    { value: "isFarewell", valueType: "boolean", labelKey: "eval.assertType.isFarewell", hintKey: "eval.assertHint.boolean" },
    { value: "shouldNotRepeatPrevious", valueType: "boolean", labelKey: "eval.assertType.shouldNotRepeatPrevious", hintKey: "eval.assertHint.boolean" },
  ];

  let loading = $state(true);
  let scenarios = $state([]);
  let history = $state([]);
  let running = $state(false);
  let progress = $state({ completed: 0, total: 0, text: "" });
  let results = $state({});
  let search = $state("");
  let tagFilter = $state("all");
  let editOpen = $state(false);
  let editScenario = $state(makeScenarioDraft());
  let editId = $state(null);
  let sseHandle = null;

  const tags = $derived([
    "all",
    ...new Set(scenarios.flatMap((scenario) => scenario.tags || []).filter(Boolean)),
  ]);
  const filteredScenarios = $derived(getFilteredScenarios());
  const latestHistory = $derived(history[0] || null);

  onMount(() => {
    loadEval();
  });

  onDestroy(() => {
    sseHandle?.close();
  });

  function uid() {
    return Math.random().toString(36).slice(2, 10);
  }

  function getAssertionMeta(type) {
    return ASSERTION_TYPES.find((item) => item.value === type) || ASSERTION_TYPES[0];
  }

  function makeAssertionRow(type = "shouldContainAny", value = undefined) {
    const meta = getAssertionMeta(type);
    if (meta.valueType === "boolean") {
      return { uid: uid(), type, textValue: "", boolValue: value === undefined ? false : Boolean(value) };
    }
    if (meta.valueType === "array") {
      return {
        uid: uid(),
        type,
        textValue: Array.isArray(value) ? value.join(", ") : (value || ""),
        boolValue: false,
      };
    }
    return {
      uid: uid(),
      type,
      textValue: typeof value === "string" ? value : "",
      boolValue: false,
    };
  }

  function expectToRows(expect = {}) {
    const rows = [];
    for (const assertion of ASSERTION_TYPES) {
      if (expect[assertion.value] === undefined) continue;
      rows.push(makeAssertionRow(assertion.value, expect[assertion.value]));
    }
    return rows.length ? rows : [makeAssertionRow()];
  }

  function rowsToExpect(rows = []) {
    const expect = {};

    for (const row of rows) {
      const meta = getAssertionMeta(row.type);
      if (meta.valueType === "boolean") {
        expect[row.type] = Boolean(row.boolValue);
        continue;
      }

      const normalized = (row.textValue || "").trim();
      if (!normalized) continue;

      if (meta.valueType === "array") {
        const values = normalized.split(",").map((item) => item.trim()).filter(Boolean);
        if (values.length) {
          expect[row.type] = values;
        }
        continue;
      }

      expect[row.type] = normalized;
    }

    return expect;
  }

  function makeTurnDraft(turn = null) {
    return {
      uid: uid(),
      user: turn?.user || "",
      assertions: expectToRows(turn?.expect || {}),
    };
  }

  function makeScenarioDraft(scenario = null) {
    return {
      id: scenario?.id || "",
      title: scenario?.title || "",
      tagsInput: (scenario?.tags || []).join(", "),
      turns: (scenario?.turns || []).map((turn) => makeTurnDraft(turn)),
    };
  }

  function getFilteredScenarios() {
    const query = (search || "").toLowerCase().trim();
    return scenarios.filter((scenario) => {
      const matchesQuery = !query || [
        scenario.id,
        scenario.title,
        ...(scenario.tags || []),
      ].join(" ").toLowerCase().includes(query);
      const matchesTag = tagFilter === "all" || (scenario.tags || []).includes(tagFilter);
      return matchesQuery && matchesTag;
    });
  }

  function getAssertionCount(scenario) {
    return (scenario.turns || []).reduce((total, turn) => total + Object.keys(turn.expect || {}).length, 0);
  }

  async function loadEval() {
    loading = true;
    try {
      const [scenarioResponse, historyResponse] = await Promise.all([
        api.get("admin/eval/scenarios"),
        api.get("admin/eval/history").catch(() => ({ history: [] })),
      ]);
      scenarios = scenarioResponse.scenarios || scenarioResponse || [];
      history = Array.isArray(historyResponse) ? historyResponse : (historyResponse.history || []);
    } catch (e) {
      showToast(t("eval.loadError", { msg: e.message }), "error");
    } finally {
      loading = false;
    }
  }

  function runAll() {
    if (!scenarios.length) return;

    running = true;
    progress = { completed: 0, total: scenarios.length, text: t("eval.starting") };
    results = {};
    sseHandle?.close();

    sseHandle = createSSE("admin/eval/run-all?runs=3", {
      onMessage(data) {
        if (data.type === "progress") {
          progress = {
            completed: progress.completed + 1,
            total: progress.total,
            text: data.scenarioId + ": " + (data.pass ? t("eval.passed") : t("eval.failed")),
          };
          results = { ...results, [data.scenarioId]: data };
        }

        if (data.type === "done") {
          const summary = data.summary || data;
          running = false;
          progress = {
            completed: summary.total,
            total: summary.total,
            text: t("eval.completed", { passed: summary.passed + "/" + summary.total, rate: summary.passRate }),
          };
          sseHandle?.close();
          showToast(
            t("eval.evalCompleted", { result: summary.passed + "/" + summary.total }),
            summary.passed === summary.total ? "success" : "warning"
          );
          loadEval();
        }

        if (data.type === "error") {
          running = false;
          progress = { ...progress, text: data.message };
          sseHandle?.close();
          showToast(t("eval.evalError", { msg: data.message }), "error");
        }
      },
      onError() {
        running = false;
        progress = { ...progress, text: t("eval.connectionError") };
      },
    });
  }

  async function runSingle(id) {
    try {
      const result = await api.post("admin/eval/run/" + id + "?runs=3", {});
      results = { ...results, [id]: result };
      showToast(id + ": " + (result.pass ? t("eval.passed") : t("eval.failed")), result.pass ? "success" : "warning");
    } catch (e) {
      showToast(t("common.error", { msg: e.message }), "error");
    }
  }

  function openNew() {
    editId = null;
    editScenario = { ...makeScenarioDraft(), turns: [makeTurnDraft()] };
    editOpen = true;
  }

  function openEdit(scenario) {
    editId = scenario.id;
    editScenario = makeScenarioDraft(scenario);
    if (!editScenario.turns.length) {
      editScenario.turns = [makeTurnDraft()];
    }
    editOpen = true;
  }

  function addTurn() {
    editScenario.turns = [...(editScenario.turns || []), makeTurnDraft()];
  }

  function removeTurn(turnUid) {
    editScenario.turns = (editScenario.turns || []).filter((turn) => turn.uid !== turnUid);
    if (!editScenario.turns.length) {
      editScenario.turns = [makeTurnDraft()];
    }
  }

  function addAssertion(turnUid) {
    const turn = editScenario.turns.find((item) => item.uid === turnUid);
    if (!turn) return;
    turn.assertions = [...(turn.assertions || []), makeAssertionRow()];
  }

  function removeAssertion(turnUid, assertionUid) {
    const turn = editScenario.turns.find((item) => item.uid === turnUid);
    if (!turn) return;
    turn.assertions = turn.assertions.filter((item) => item.uid !== assertionUid);
    if (!turn.assertions.length) {
      turn.assertions = [makeAssertionRow()];
    }
  }

  function updateAssertionType(turnUid, assertionUid, nextType) {
    const turn = editScenario.turns.find((item) => item.uid === turnUid);
    const row = turn?.assertions.find((item) => item.uid === assertionUid);
    if (!turn || !row) return;

    const meta = getAssertionMeta(nextType);
    row.type = nextType;
    row.textValue = "";
    row.boolValue = meta.valueType === "boolean" ? false : row.boolValue;
  }

  async function saveScenario() {
    const turns = (editScenario.turns || [])
      .map((turn) => ({
        user: (turn.user || "").trim(),
        expect: rowsToExpect(turn.assertions),
      }))
      .filter((turn) => turn.user);

    if (!editScenario.id.trim() || !turns.length) {
      return;
    }

    const payload = {
      id: editScenario.id.trim(),
      title: editScenario.title.trim() || editScenario.id.trim(),
      tags: (editScenario.tagsInput || "").split(",").map((item) => item.trim()).filter(Boolean),
      turns,
    };

    try {
      if (editId) {
        await api.put("admin/eval/scenarios/" + editId, payload);
      } else {
        await api.post("admin/eval/scenarios", payload);
      }
      showToast(t("common.saved", { name: payload.id }), "success");
      editOpen = false;
      await loadEval();
    } catch (e) {
      showToast(t("common.error", { msg: e.message }), "error");
    }
  }

  async function deleteScenario(id) {
    const ok = await showConfirm({
      title: t("common.delete"),
      message: t("eval.deleteMsg"),
      confirmText: t("common.delete"),
      danger: true,
    });
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
    const ok = await showConfirm({
      title: t("eval.clearHistory"),
      message: t("eval.clearHistoryMsg"),
      confirmText: t("eval.clearBtn"),
      danger: true,
    });
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
  <div>
    <h1>{t("eval.title")}</h1>
    <p>{t("eval.subtitle")}</p>
  </div>
  <div class="actions">
    <Button onclick={clearHistory} variant="ghost" size="sm">{t("eval.clearHistory")}</Button>
    <Button onclick={openNew} variant="secondary" size="sm">{t("eval.addScenario")}</Button>
    <Button onclick={runAll} variant="primary" size="sm" disabled={running || !scenarios.length}>
      {running ? t("eval.running") : t("eval.runAll")}
    </Button>
  </div>
</div>

{#if running}
  <div class="progress-card">
    <ProgressBar value={progress.completed} max={progress.total} />
    <p class="progress-text">{progress.completed}/{progress.total} · {progress.text}</p>
  </div>
{/if}

{#if loading}
  <LoadingSpinner message={t("common.loading")} />
{:else}
  <div class="summary-grid">
    <div class="stat-card">
      <span class="stat-label">{t("eval.summaryScenarios")}</span>
      <strong>{scenarios.length}</strong>
      <p>{t("eval.summaryScenariosHelp")}</p>
    </div>
    <div class="stat-card">
      <span class="stat-label">{t("eval.summaryTags")}</span>
      <strong>{Math.max(tags.length - 1, 0)}</strong>
      <p>{t("eval.summaryTagsHelp")}</p>
    </div>
    <div class="stat-card">
      <span class="stat-label">{t("eval.summaryPassRate")}</span>
      <strong>{latestHistory ? latestHistory.passRate + "%" : "-"}</strong>
      <p>{latestHistory ? t("eval.summaryPassRateHelp") : t("eval.summaryNoHistory")}</p>
    </div>
  </div>

  <div class="guide-card">
    <div class="guide-copy">
      <h2>{t("eval.guideTitle")}</h2>
      <p>{t("eval.guideIntro")}</p>
    </div>
    <div class="guide-list">
      {#each ASSERTION_TYPES.slice(0, 5) as assertion}
        <div class="guide-item">
          <strong>{t(assertion.labelKey)}</strong>
          <span>{t(assertion.hintKey)}</span>
        </div>
      {/each}
    </div>
  </div>

  <div class="filters-card">
    <input class="input" bind:value={search} placeholder={t("eval.searchPlaceholder")} />
    <select class="input" bind:value={tagFilter}>
      {#each tags as tag}
        <option value={tag}>{tag === "all" ? t("eval.allTags") : tag}</option>
      {/each}
    </select>
  </div>

  <div class="card">
    <table>
      <thead>
        <tr>
          <th>{t("eval.id")}</th>
          <th>{t("eval.titleCol")}</th>
          <th>{t("eval.turn")}</th>
          <th>{t("eval.assertions")}</th>
          <th>{t("eval.lastResult")}</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {#each filteredScenarios as scenario}
          <tr>
            <td class="mono">{scenario.id}</td>
            <td>
              <div class="scenario-title">{scenario.title || scenario.turns?.[0]?.user || "-"}</div>
              <div class="tag-row">
                {#each scenario.tags || [] as tag}
                  <Badge variant="gray">{tag}</Badge>
                {/each}
              </div>
            </td>
            <td class="muted">{scenario.turns?.length || 0}</td>
            <td class="muted">{getAssertionCount(scenario)}</td>
            <td>
              {#if results[scenario.id]}
                <Badge variant={results[scenario.id].pass ? "green" : "red"}>
                  {results[scenario.id].pass ? t("eval.passed") : t("eval.failed")}
                </Badge>
              {:else}
                <span class="muted">-</span>
              {/if}
            </td>
            <td class="row-actions">
              <Button onclick={() => runSingle(scenario.id)} variant="ghost" size="sm">{t("eval.run")}</Button>
              <Button onclick={() => openEdit(scenario)} variant="ghost" size="sm">{t("common.edit")}</Button>
              <Button onclick={() => deleteScenario(scenario.id)} variant="ghost" size="sm">{t("common.delete")}</Button>
            </td>
          </tr>
        {:else}
          <tr>
            <td colspan="6" class="empty-row">{t("eval.noScenarios")}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>

  {#if history.length > 0}
    <div class="history-section">
      <h2>{t("eval.history")}</h2>
      <div class="card">
        <table>
          <thead>
            <tr>
              <th>{t("eval.date")}</th>
              <th>{t("eval.total")}</th>
              <th>{t("eval.passedCol")}</th>
              <th>{t("eval.failedCol")}</th>
              <th>{t("eval.rate")}</th>
              <th>{t("eval.duration")}</th>
            </tr>
          </thead>
          <tbody>
            {#each history as item}
              <tr>
                <td>{new Date(item.timestamp).toLocaleString(getDateLocale())}</td>
                <td>{item.total}</td>
                <td class="pass-cell">{item.passed}</td>
                <td class="fail-cell">{item.failed}</td>
                <td>
                  <Badge variant={item.green ? "green" : "red"}>{item.passRate}%</Badge>
                </td>
                <td class="muted">{item.durationMs ? (item.durationMs / 1000).toFixed(1) + "s" : "-"}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </div>
  {/if}
{/if}

<Modal bind:open={editOpen} title={editId ? t("eval.editScenario") : t("eval.newScenario")} width="820px">
  <div class="modal-grid">
    <div class="form-group">
      <span class="lbl">{t("eval.id")}</span>
      <input class="input mono" bind:value={editScenario.id} placeholder={t("eval.idPlaceholder")} disabled={!!editId} />
    </div>
    <div class="form-group">
      <span class="lbl">{t("eval.titleCol")}</span>
      <input class="input" bind:value={editScenario.title} placeholder={t("eval.titlePlaceholder")} />
    </div>
  </div>

  <div class="form-group">
    <span class="lbl">{t("eval.tags")}</span>
    <input class="input" bind:value={editScenario.tagsInput} placeholder={t("eval.tagsPlaceholder")} />
  </div>

  <div class="modal-guide">
    <strong>{t("eval.editorGuideTitle")}</strong>
    <span>{t("eval.editorGuideText")}</span>
  </div>

  <div class="turns-section">
    <div class="turns-header">
      <span class="lbl">{t("eval.turns", { n: editScenario.turns?.length || 0 })}</span>
      <Button onclick={addTurn} variant="ghost" size="sm">{t("eval.addTurn")}</Button>
    </div>

    {#each editScenario.turns || [] as turn, index}
      <div class="turn-card">
        <div class="turn-top">
          <span class="turn-num">{t("eval.turnNum", { n: index + 1 })}</span>
          {#if (editScenario.turns || []).length > 1}
            <Button onclick={() => removeTurn(turn.uid)} variant="ghost" size="sm">{t("common.delete")}</Button>
          {/if}
        </div>

        <div class="form-group">
          <span class="lbl">{t("eval.userMessage")}</span>
          <textarea class="textarea" bind:value={turn.user} rows="3" placeholder={t("eval.userMsgPlaceholder")}></textarea>
        </div>

        <div class="assertions-block">
          <div class="assertions-head">
            <span class="lbl">{t("eval.assertions")}</span>
            <Button onclick={() => addAssertion(turn.uid)} variant="ghost" size="sm">{t("eval.addAssertion")}</Button>
          </div>

          {#each turn.assertions || [] as assertion}
            <div class="assertion-row">
              <select class="input assertion-type" value={assertion.type} onchange={(event) => updateAssertionType(turn.uid, assertion.uid, event.target.value)}>
                {#each ASSERTION_TYPES as option}
                  <option value={option.value}>{t(option.labelKey)}</option>
                {/each}
              </select>

              {#if getAssertionMeta(assertion.type).valueType === "boolean"}
                <select class="input assertion-value" bind:value={assertion.boolValue}>
                  <option value={false}>{t("eval.booleanFalse")}</option>
                  <option value={true}>{t("eval.booleanTrue")}</option>
                </select>
              {:else}
                <input
                  class="input assertion-value"
                  bind:value={assertion.textValue}
                  placeholder={t(getAssertionMeta(assertion.type).hintKey)}
                />
              {/if}

              <Button onclick={() => removeAssertion(turn.uid, assertion.uid)} variant="ghost" size="sm">{t("common.delete")}</Button>
            </div>
          {/each}
        </div>
      </div>
    {/each}
  </div>

  <div class="modal-actions">
    <Button onclick={() => (editOpen = false)} variant="secondary">{t("common.cancel")}</Button>
    <Button onclick={saveScenario} variant="primary">{t("common.save")}</Button>
  </div>
</Modal>

<style>
  .page-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 16px;
    margin-bottom: 16px;
  }

  .page-header h1 {
    font-size: 22px;
    font-weight: 700;
  }

  .page-header p {
    font-size: 13px;
    color: var(--text-muted);
    margin-top: 2px;
  }

  .actions {
    display: flex;
    gap: 8px;
  }

  .progress-card,
  .card,
  .filters-card,
  .guide-card,
  .stat-card,
  .modal-guide {
    background: var(--bg-card);
    border-radius: var(--radius);
    border: 1px solid var(--border-light);
    box-shadow: var(--shadow-sm);
  }

  .progress-card {
    padding: 16px;
    margin-bottom: 16px;
  }

  .progress-text {
    font-size: 12px;
    color: var(--text-secondary);
    margin-top: 8px;
  }

  .summary-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 12px;
    margin-bottom: 16px;
  }

  .stat-card {
    padding: 16px;
  }

  .stat-label {
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--text-muted);
  }

  .stat-card strong {
    display: block;
    font-size: 26px;
    line-height: 1;
    margin: 6px 0 8px;
  }

  .stat-card p {
    font-size: 12px;
    color: var(--text-secondary);
  }

  .guide-card {
    padding: 18px;
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: 14px;
    margin-bottom: 16px;
  }

  .guide-copy h2 {
    font-size: 18px;
    font-weight: 700;
    margin-bottom: 6px;
  }

  .guide-copy p {
    font-size: 13px;
    color: var(--text-secondary);
    line-height: 1.6;
  }

  .guide-list {
    display: grid;
    gap: 8px;
  }

  .guide-item {
    padding: 10px 12px;
    border-radius: 12px;
    background: linear-gradient(180deg, rgba(15, 108, 189, 0.08), rgba(15, 108, 189, 0.02));
    border: 1px solid rgba(15, 108, 189, 0.12);
  }

  .guide-item strong {
    display: block;
    font-size: 12px;
    font-weight: 700;
    margin-bottom: 3px;
  }

  .guide-item span {
    display: block;
    font-size: 12px;
    color: var(--text-secondary);
    line-height: 1.5;
  }

  .filters-card {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 180px;
    gap: 12px;
    padding: 12px;
    margin-bottom: 16px;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
  }

  th {
    text-align: left;
    padding: 10px 12px;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--text-muted);
    border-bottom: 1px solid var(--border);
    background: var(--bg);
  }

  td {
    padding: 12px;
    border-bottom: 1px solid var(--border-light);
    color: var(--text-secondary);
    vertical-align: top;
  }

  .mono {
    font-family: "JetBrains Mono", monospace;
    font-size: 12px;
  }

  .muted {
    color: var(--text-muted);
  }

  .scenario-title {
    font-weight: 600;
    color: var(--text);
    margin-bottom: 6px;
  }

  .tag-row {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
  }

  .row-actions {
    display: flex;
    gap: 6px;
    justify-content: flex-end;
    white-space: nowrap;
  }

  .empty-row {
    text-align: center;
    color: var(--text-muted);
    padding: 24px 12px;
  }

  .history-section {
    margin-top: 18px;
  }

  .history-section h2 {
    font-size: 16px;
    font-weight: 700;
    margin-bottom: 10px;
  }

  .pass-cell {
    color: var(--success);
    font-weight: 600;
  }

  .fail-cell {
    color: var(--error);
    font-weight: 600;
  }

  .modal-grid {
    display: grid;
    grid-template-columns: 220px minmax(0, 1fr);
    gap: 12px;
  }

  .form-group {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-bottom: 12px;
  }

  .lbl {
    font-size: 12px;
    font-weight: 700;
    color: var(--text-secondary);
  }

  .modal-guide {
    padding: 12px 14px;
    margin-bottom: 12px;
  }

  .modal-guide strong {
    display: block;
    font-size: 12px;
    font-weight: 700;
    margin-bottom: 4px;
  }

  .modal-guide span {
    display: block;
    font-size: 12px;
    color: var(--text-secondary);
    line-height: 1.5;
  }

  .turns-header,
  .assertions-head,
  .turn-top {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
  }

  .turns-header {
    margin-bottom: 10px;
  }

  .turn-card {
    padding: 14px;
    border: 1px solid var(--border);
    border-radius: 14px;
    margin-bottom: 12px;
    background: var(--bg);
  }

  .turn-num {
    font-size: 12px;
    font-weight: 700;
    color: var(--text);
  }

  .assertions-block {
    display: grid;
    gap: 8px;
  }

  .assertion-row {
    display: grid;
    grid-template-columns: 260px minmax(0, 1fr) auto;
    gap: 8px;
    align-items: center;
  }

  .input,
  .textarea {
    width: 100%;
    padding: 8px 12px;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    font-size: 13px;
    color: var(--text);
    font-family: inherit;
    background: var(--bg-card);
    outline: none;
  }

  .textarea {
    resize: vertical;
    line-height: 1.6;
  }

  .input:focus,
  .textarea:focus {
    border-color: var(--accent);
    box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
  }

  .modal-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 16px;
  }

  @media (max-width: 960px) {
    .summary-grid,
    .guide-card,
    .filters-card,
    .modal-grid,
    .assertion-row {
      grid-template-columns: 1fr;
    }

    .row-actions {
      justify-content: flex-start;
      flex-wrap: wrap;
    }
  }
</style>

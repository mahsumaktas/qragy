<script>
  import { onMount } from "svelte";
  import { api } from "../../lib/api.js";
  import { showToast } from "../../lib/toast.svelte.js";
  import { showConfirm } from "../../lib/confirm.svelte.js";
  import { truncate } from "../../lib/format.js";
  import { getLocale, t } from "../../lib/i18n.svelte.js";
  import { getKnowledgeWarnings } from "../../lib/contentQuality.js";
  import {
    clearCopilotRequest,
    getPendingCopilotRequest,
    setAssistantContext,
  } from "../../lib/copilotBridge.svelte.js";
  import Button from "../../components/ui/Button.svelte";
  import Modal from "../../components/ui/Modal.svelte";
  import FileUpload from "../../components/ui/FileUpload.svelte";
  import LoadingSpinner from "../../components/ui/LoadingSpinner.svelte";
  import Badge from "../../components/ui/Badge.svelte";
  import ContentCopilotDrawer from "../../components/copilot/ContentCopilotDrawer.svelte";

  let loading = $state(true);
  let items = $state([]);
  let topics = $state([]);
  let query = $state("");
  let filter = $state("all");
  let addOpen = $state(false);
  let uploadOpen = $state(false);
  let editOpen = $state(false);
  let editId = $state(null);
  let editQuestion = $state("");
  let editAnswer = $state("");
  let newQuestion = $state("");
  let newAnswer = $state("");
  let importUrl = $state("");
  let busyAction = $state("");
  let copilotReview = $state({ summary: null, targets: [] });
  let copilotOpen = $state(false);
  let copilotTarget = $state(null);
  let copilotMode = $state("review");
  let copilotGoal = $state("");
  let copilotLabel = $state("");
  let copilotRequestKey = $state("");
  let copilotApplying = $state(false);

  onMount(() => loadData());

  async function refreshKnowledge() {
    const knowledgeRes = await api.get("admin/knowledge");
    const data = knowledgeRes.records || knowledgeRes.payload?.records || knowledgeRes.items || knowledgeRes.knowledge || [];
    items = Array.isArray(data) ? data : [];
  }

  async function refreshTopics() {
    const topicsRes = await api.get("admin/agent/topics").catch(() => ({ topics: [] }));
    topics = topicsRes.topics || topicsRes || [];
  }

  async function refreshCopilotReview({ selection = null } = {}) {
    const response = await api.post("admin/copilot/review", {
      surface: "knowledge",
      locale: getLocale(),
      selection,
    });
    copilotReview = response.review || { summary: null, targets: [] };
  }

  async function loadData({ reloadTopics = true } = {}) {
    loading = true;
    try {
      if (reloadTopics) {
        await Promise.all([refreshKnowledge(), refreshTopics()]);
      } else {
        await refreshKnowledge();
      }
      await refreshCopilotReview();
    } catch (e) {
      showToast(t("kb.loadError", { msg: e.message }), "error");
    } finally {
      loading = false;
    }
  }

  let reviewMap = $derived(Object.fromEntries(
    (copilotReview.targets || []).map((target) => [String(target.id), target])
  ));

  let decoratedItems = $derived(
    items.map((item) => {
      const review = reviewMap[String(item.id || item._id)];
      return {
        ...item,
        matches: review?.meta?.matches || [],
        warnings: review?.warningCodes || [],
      };
    })
  );

  let filteredItems = $derived(
    decoratedItems.filter((item) => {
      const haystack = [item.question, item.answer, item.source, ...(item.matches || []).map((topic) => topic.title)]
        .join(" ")
        .toLowerCase();
      const matchesQuery = !query.trim() || haystack.includes(query.trim().toLowerCase());
      const matchesFilter =
        filter === "all" ||
        (filter === "unmapped" && item.matches.length === 0) ||
        (filter === "warnings" && item.warnings.length > 0) ||
        (filter === "matched" && item.matches.length > 0);
      return matchesQuery && matchesFilter;
    })
  );

  let unmatchedCount = $derived(decoratedItems.filter((item) => item.matches.length === 0).length);
  let warningCount = $derived(decoratedItems.filter((item) => item.warnings.length > 0).length);
  let importedCount = $derived(decoratedItems.filter((item) => item.source && item.source !== "admin-manual").length);
  let pendingCopilotRequest = $derived(getPendingCopilotRequest());

  function getSourceLabel(source) {
    if (!source || source === "admin-manual") return t("kb.manualSource");
    return source;
  }

  function openAddModal() {
    newQuestion = "";
    newAnswer = "";
    importUrl = "";
    addOpen = true;
  }

  function openEditEntry(item) {
    setAssistantContext({
      panel: "knowledge-base",
      selection: { id: item.id || item._id },
    });
    editId = item.id || item._id;
    editQuestion = item.question || item.title || "";
    editAnswer = item.answer || item.content || "";
    editOpen = true;
  }

  function openCopilot(item, mode = "review", goalText = "", requestId = "") {
    const targetId = item?.id || item?._id;
    if (!targetId) return;
    setAssistantContext({
      panel: "knowledge-base",
      selection: { id: targetId },
    });
    copilotTarget = { id: targetId };
    copilotMode = mode;
    copilotGoal = goalText;
    copilotLabel = item?.question || item?.title || "";
    copilotRequestKey = requestId ? String(requestId) : `${targetId}:${Date.now()}`;
    copilotOpen = true;
  }

  async function addEntry() {
    if (!newQuestion.trim() || !newAnswer.trim() || busyAction) return;
    busyAction = "add";
    try {
      await api.post("admin/knowledge", {
        question: newQuestion.trim(),
        answer: newAnswer.trim(),
        source: "admin-manual",
      });
      showToast(t("kb.added"), "success");
      addOpen = false;
      await loadData({ reloadTopics: false });
    } catch (e) {
      showToast(t("common.error", { msg: e.message }), "error");
    } finally {
      busyAction = "";
    }
  }

  async function updateEntry() {
    if (!editQuestion.trim() || !editAnswer.trim() || busyAction) return;
    busyAction = "update";
    try {
      const existing = items.find((item) => (item.id || item._id) === editId);
      await api.put(`admin/knowledge/${editId}`, {
        question: editQuestion.trim(),
        answer: editAnswer.trim(),
        source: existing?.source || "admin-manual",
      });
      showToast(t("kb.updated"), "success");
      editOpen = false;
      editId = null;
      await loadData({ reloadTopics: false });
    } catch (e) {
      showToast(t("common.error", { msg: e.message }), "error");
    } finally {
      busyAction = "";
    }
  }

  async function deleteEntry(id) {
    if (busyAction) return;
    const ok = await showConfirm({
      title: t("kb.deleteTitle"),
      message: t("kb.deleteMsg"),
      confirmText: t("common.delete"),
      danger: true,
    });
    if (!ok) return;
    busyAction = "delete";
    try {
      await api.delete(`admin/knowledge/${id}`);
      showToast(t("kb.deleted"), "success");
      await loadData({ reloadTopics: false });
    } catch (e) {
      showToast(t("common.error", { msg: e.message }), "error");
    } finally {
      busyAction = "";
    }
  }

  async function handleUpload(files) {
    if (busyAction) return;
    busyAction = "upload";
    const formData = new FormData();
    for (const file of files) formData.append("files", file);
    try {
      await api.uploadForm("admin/knowledge/upload-batch", formData);
      showToast(t("kb.filesUploaded", { n: files.length }), "success");
      uploadOpen = false;
      await loadData({ reloadTopics: false });
    } catch (e) {
      showToast(t("kb.uploadError", { msg: e.message }), "error");
    } finally {
      busyAction = "";
    }
  }

  async function handleImportUrl() {
    if (!importUrl.trim() || busyAction) return;
    busyAction = "import-url";
    try {
      await api.post("admin/knowledge/import-url", { url: importUrl.trim() });
      showToast(t("kb.urlImported"), "success");
      importUrl = "";
      addOpen = false;
      await loadData({ reloadTopics: false });
    } catch (e) {
      showToast(t("kb.importError", { msg: e.message }), "error");
    } finally {
      busyAction = "";
    }
  }

  async function reingest() {
    if (busyAction) return;
    busyAction = "reingest";
    try {
      await api.post("admin/knowledge/reingest", {});
      showToast(t("kb.reingestStarted"), "success");
    } catch (e) {
      showToast(t("common.error", { msg: e.message }), "error");
    } finally {
      busyAction = "";
    }
  }

  function reviewFor(question, answer) {
    return getKnowledgeWarnings(question, answer, topics);
  }

  function warningLabel(key) {
    return t(`kb.warning.${key}`);
  }

  async function applyCopilotDraft(event) {
    const payload = event.detail?.draft?.applyPayload;
    const draftTarget = event.detail?.target;
    if (!payload || !draftTarget?.id) return;

    copilotApplying = true;
    try {
      await api.put(`admin/knowledge/${draftTarget.id}`, payload);
      showToast(t("copilot.applied"), "success");
      copilotOpen = false;
      await loadData({ reloadTopics: false });
    } catch (error) {
      showToast(t("common.error", { msg: error.message }), "error");
    } finally {
      copilotApplying = false;
    }
  }

  $effect(() => {
    const request = pendingCopilotRequest;
    if (!request || request.panel !== "knowledge-base" || request.surface !== "knowledge") return;
    const matched = items.find((item) => String(item.id || item._id) === String(request.target?.id));
    openCopilot(matched || { id: request.target?.id, question: "" }, request.mode || "review", request.goal || "", request.requestId);
    clearCopilotRequest(request.requestId);
  });
</script>

<div class="page-header">
  <div>
    <h1>{t("kb.title")}</h1>
    <p>{t("kb.entries", { n: items.length })}</p>
  </div>
  <div class="header-actions">
    <Button onclick={reingest} variant="ghost" size="sm" disabled={Boolean(busyAction)}>{t("kb.reingest")}</Button>
    <Button onclick={() => (uploadOpen = true)} variant="secondary" size="sm" disabled={Boolean(busyAction)}>{t("kb.uploadFile")}</Button>
    <Button onclick={openAddModal} variant="primary" size="sm" disabled={Boolean(busyAction)}>{t("kb.addEntry")}</Button>
  </div>
</div>

{#if loading}
  <LoadingSpinner message={t("common.loading")} />
{:else}
  <div class="summary-grid">
    <div class="summary-card">
      <span>{t("kb.summary.total")}</span>
      <strong>{items.length}</strong>
    </div>
    <div class="summary-card warn">
      <span>{t("kb.summary.unmapped")}</span>
      <strong>{unmatchedCount}</strong>
    </div>
    <div class="summary-card">
      <span>{t("kb.summary.review")}</span>
      <strong>{warningCount}</strong>
    </div>
    <div class="summary-card">
      <span>{t("kb.summary.imported")}</span>
      <strong>{importedCount}</strong>
    </div>
  </div>

  <div class="guide-card">
    <div>
      <div class="guide-eyebrow">{t("kb.guideTitle")}</div>
      <h2>{t("kb.guideSubtitle")}</h2>
      <p>{t("kb.guideText")}</p>
    </div>
    <div class="guide-points">
      <span>{t("kb.guidePoint1")}</span>
      <span>{t("kb.guidePoint2")}</span>
      <span>{t("kb.guidePoint3")}</span>
      <span>{t("kb.guidePoint4")}</span>
    </div>
  </div>

  <div class="toolbar">
    <input
      class="search-input"
      bind:value={query}
      placeholder={t("kb.searchPlaceholder")}
      aria-label={t("kb.searchPlaceholder")}
    />
    <select class="select" bind:value={filter}>
      <option value="all">{t("kb.filter.all")}</option>
      <option value="matched">{t("kb.filter.matched")}</option>
      <option value="unmapped">{t("kb.filter.unmapped")}</option>
      <option value="warnings">{t("kb.filter.warnings")}</option>
    </select>
  </div>

  <div class="card">
    <table>
      <thead>
        <tr>
          <th>{t("kb.question")}</th>
          <th>{t("kb.topicCoverage")}</th>
          <th>{t("kb.source")}</th>
          <th>{t("kb.answer")}</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {#each filteredItems as item}
          <tr>
            <td>
              <div class="question-cell">
                <strong>{truncate(item.question || "", 84)}</strong>
                {#if item.warnings.length}
                  <div class="warning-list">
                    {#each item.warnings.slice(0, 2) as warning}
                      <span>{warningLabel(warning)}</span>
                    {/each}
                  </div>
                {/if}
              </div>
            </td>
            <td>
              {#if item.matches.length}
                <div class="match-list">
                  {#each item.matches.slice(0, 2) as topic}
                    <Badge variant="blue">{topic.title}</Badge>
                  {/each}
                  {#if item.matches.length > 2}
                    <span class="more">+{item.matches.length - 2}</span>
                  {/if}
                </div>
              {:else}
                <Badge variant="yellow">{t("kb.unmappedBadge")}</Badge>
              {/if}
            </td>
            <td><span class="source-pill">{truncate(getSourceLabel(item.source), 36)}</span></td>
            <td>{truncate(item.answer || "", 120)}</td>
            <td class="actions">
              <Button onclick={() => openCopilot(item, "review")} variant="ghost" size="sm">{t("copilot.reviewAction")}</Button>
              <Button onclick={() => openCopilot(item, "draft", t("copilot.goal.kbImproveAnswerStructure"))} variant="ghost" size="sm">{t("copilot.draftAction")}</Button>
              <Button onclick={() => openEditEntry(item)} variant="ghost" size="sm">{t("common.edit")}</Button>
              <Button onclick={() => deleteEntry(item.id || item._id)} variant="ghost" size="sm">{t("common.delete")}</Button>
            </td>
          </tr>
        {:else}
          <tr><td colspan="5" class="empty-row">{t("kb.empty")}</td></tr>
        {/each}
      </tbody>
    </table>
  </div>
{/if}

<Modal bind:open={addOpen} title={t("kb.newEntry")} width="920px">
  <div class="editor-grid">
    <div>
      <div class="form-group">
        <label>{t("kb.question")}
          <input class="input" bind:value={newQuestion} placeholder={t("kb.questionPlaceholder")} />
        </label>
      </div>
      <div class="form-group">
        <label>{t("kb.answer")}
          <textarea class="textarea" bind:value={newAnswer} rows="8" placeholder={t("kb.answerPlaceholder")}></textarea>
        </label>
      </div>
      <div class="form-group">
        <label>{t("kb.urlImport")}
          <div class="url-row">
            <input class="input" bind:value={importUrl} placeholder={t("kb.urlPlaceholder")} />
            <Button onclick={handleImportUrl} variant="secondary" size="sm">{t("common.import")}</Button>
          </div>
        </label>
      </div>
    </div>

    <div class="review-card">
      <div class="review-title">{t("kb.reviewTitle")}</div>
      <p>{t("kb.reviewText")}</p>

      {#if reviewFor(newQuestion, newAnswer).matches.length}
        <div class="review-section">
          <div class="review-label">{t("kb.reviewTopics")}</div>
          <div class="match-list">
            {#each reviewFor(newQuestion, newAnswer).matches as topic}
              <Badge variant="blue">{topic.title}</Badge>
            {/each}
          </div>
        </div>
      {/if}

      <div class="review-section">
        <div class="review-label">{t("kb.reviewChecklist")}</div>
        <div class="warning-list stacked">
          {#if reviewFor(newQuestion, newAnswer).warnings.length}
            {#each reviewFor(newQuestion, newAnswer).warnings as warning}
              <span>{warningLabel(warning)}</span>
            {/each}
          {:else}
            <span class="success">{t("kb.reviewLooksGood")}</span>
          {/if}
        </div>
      </div>
    </div>
  </div>

  <div class="modal-actions">
    <Button onclick={() => (addOpen = false)} variant="secondary" disabled={Boolean(busyAction)}>{t("common.cancel")}</Button>
    <Button onclick={addEntry} variant="primary" disabled={Boolean(busyAction)}>
      {busyAction === "add" || busyAction === "import-url" ? t("common.saving") : t("common.save")}
    </Button>
  </div>
</Modal>

<Modal bind:open={editOpen} title={t("kb.editEntry")} width="920px">
  <div class="editor-grid">
    <div>
      <div class="form-group">
        <label>{t("kb.question")}
          <input class="input" bind:value={editQuestion} placeholder={t("kb.questionPlaceholder")} />
        </label>
      </div>
      <div class="form-group">
        <label>{t("kb.answer")}
          <textarea class="textarea" bind:value={editAnswer} rows="8" placeholder={t("kb.answerPlaceholder")}></textarea>
        </label>
      </div>
    </div>

    <div class="review-card">
      <div class="review-title">{t("kb.reviewTitle")}</div>
      <p>{t("kb.reviewText")}</p>

      {#if reviewFor(editQuestion, editAnswer).matches.length}
        <div class="review-section">
          <div class="review-label">{t("kb.reviewTopics")}</div>
          <div class="match-list">
            {#each reviewFor(editQuestion, editAnswer).matches as topic}
              <Badge variant="blue">{topic.title}</Badge>
            {/each}
          </div>
        </div>
      {/if}

      <div class="review-section">
        <div class="review-label">{t("kb.reviewChecklist")}</div>
        <div class="warning-list stacked">
          {#if reviewFor(editQuestion, editAnswer).warnings.length}
            {#each reviewFor(editQuestion, editAnswer).warnings as warning}
              <span>{warningLabel(warning)}</span>
            {/each}
          {:else}
            <span class="success">{t("kb.reviewLooksGood")}</span>
          {/if}
        </div>
      </div>
    </div>
  </div>

  <div class="modal-actions">
    <Button onclick={() => (editOpen = false)} variant="secondary" disabled={Boolean(busyAction)}>{t("common.cancel")}</Button>
    <Button onclick={updateEntry} variant="primary" disabled={Boolean(busyAction)}>
      {busyAction === "update" ? t("common.saving") : t("common.save")}
    </Button>
  </div>
</Modal>

<Modal bind:open={uploadOpen} title={t("kb.uploadFile")}>
  <FileUpload accept=".pdf,.docx,.xlsx,.csv,.txt" multiple onfiles={handleUpload} label={t("kb.uploadHint")} />
</Modal>

<ContentCopilotDrawer
  bind:open={copilotOpen}
  surface="knowledge"
  target={copilotTarget}
  contextLabel={copilotLabel}
  initialMode={copilotMode}
  initialGoal={copilotGoal}
  requestKey={copilotRequestKey}
  applying={copilotApplying}
  on:apply={applyCopilotDraft}
/>

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

  .header-actions {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }

  .summary-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 12px;
    margin-bottom: 16px;
  }

  .summary-card {
    padding: 16px 18px;
    border-radius: 18px;
    background: var(--bg-card);
    border: 1px solid var(--border-light);
    box-shadow: var(--shadow-sm);
  }

  .summary-card.warn {
    background: linear-gradient(180deg, #fffaf0, #ffffff);
  }

  .summary-card span,
  .review-label {
    font-size: 12px;
    color: var(--text-muted);
  }

  .summary-card strong {
    display: block;
    margin-top: 6px;
    font-size: 24px;
    color: var(--text);
  }

  .guide-card {
    display: grid;
    grid-template-columns: minmax(0, 1.5fr) minmax(0, 1fr);
    gap: 18px;
    padding: 20px;
    border-radius: 22px;
    background:
      linear-gradient(135deg, rgba(15, 108, 189, 0.06), transparent 42%),
      var(--bg-card);
    border: 1px solid var(--border-light);
    box-shadow: var(--shadow);
    margin-bottom: 16px;
  }

  .guide-eyebrow {
    font-size: 11px;
    font-weight: 800;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--accent);
    margin-bottom: 8px;
  }

  .guide-card h2 {
    font-size: 18px;
    margin-bottom: 8px;
  }

  .guide-card p {
    color: var(--text-secondary);
    font-size: 13px;
  }

  .guide-points {
    display: grid;
    gap: 8px;
    align-content: start;
  }

  .guide-points span,
  .warning-list span,
  .source-pill {
    display: inline-flex;
    align-items: center;
    padding: 7px 10px;
    border-radius: 999px;
    background: var(--bg);
    border: 1px solid var(--border);
    color: var(--text-secondary);
    font-size: 12px;
  }

  .toolbar {
    display: flex;
    gap: 10px;
    margin-bottom: 16px;
    flex-wrap: wrap;
  }

  .search-input,
  .select,
  .input,
  .textarea {
    width: 100%;
    padding: 10px 12px;
    border: 1px solid var(--border);
    border-radius: 12px;
    font-size: 13px;
    font-family: inherit;
    color: var(--text);
    background: var(--bg-card);
    outline: none;
  }

  .search-input {
    flex: 1;
    min-width: 240px;
  }

  .search-input:focus,
  .select:focus,
  .input:focus,
  .textarea:focus {
    border-color: var(--accent);
    box-shadow: 0 0 0 3px rgba(15, 108, 189, 0.1);
  }

  .select {
    width: auto;
    min-width: 220px;
  }

  .card {
    background: var(--bg-card);
    border-radius: var(--radius);
    box-shadow: var(--shadow);
    border: 1px solid var(--border-light);
    overflow: hidden;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
  }

  th {
    text-align: left;
    padding: 12px;
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
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

  tr:hover td {
    background: var(--bg-hover);
  }

  .question-cell {
    display: grid;
    gap: 8px;
  }

  .question-cell strong {
    color: var(--text);
  }

  .warning-list {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .warning-list.stacked {
    flex-direction: column;
  }

  .warning-list span {
    background: #fff7e7;
    border-color: #f1d8a5;
    color: #8a5a00;
  }

  .warning-list .success {
    background: var(--success-bg);
    border-color: rgba(5, 150, 105, 0.2);
    color: var(--success);
  }

  .match-list {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .more {
    font-size: 12px;
    color: var(--text-muted);
    align-self: center;
  }

  .source-pill {
    white-space: nowrap;
  }

  .actions {
    display: flex;
    gap: 4px;
    justify-content: flex-end;
  }

  .empty-row {
    text-align: center;
    color: var(--text-muted);
    padding: 32px;
  }

  .editor-grid {
    display: grid;
    grid-template-columns: minmax(0, 1.6fr) minmax(260px, 1fr);
    gap: 18px;
  }

  .review-card {
    padding: 16px;
    border-radius: 18px;
    background: var(--bg);
    border: 1px solid var(--border);
    display: grid;
    gap: 14px;
    align-content: start;
  }

  .review-title {
    font-size: 14px;
    font-weight: 700;
    color: var(--text);
  }

  .review-card p {
    font-size: 12px;
    color: var(--text-secondary);
  }

  .review-section {
    display: grid;
    gap: 8px;
  }

  .form-group {
    margin-bottom: 14px;
  }

  .form-group label {
    display: block;
    font-size: 12px;
    font-weight: 600;
    color: var(--text-secondary);
    margin-bottom: 4px;
  }

  .textarea {
    resize: vertical;
    min-height: 180px;
  }

  .url-row {
    display: flex;
    gap: 8px;
  }

  .modal-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 16px;
  }

  @media (max-width: 1100px) {
    .summary-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .guide-card,
    .editor-grid {
      grid-template-columns: 1fr;
    }
  }

  @media (max-width: 768px) {
    .page-header {
      align-items: flex-start;
      flex-direction: column;
    }

    .summary-grid {
      grid-template-columns: 1fr;
    }

    .actions {
      flex-direction: column;
      align-items: stretch;
    }
  }
</style>

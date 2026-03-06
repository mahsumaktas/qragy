<script>
  import { onMount } from "svelte";
  import { api } from "../../lib/api.js";
  import { showToast } from "../../lib/toast.svelte.js";
  import { showConfirm } from "../../lib/confirm.svelte.js";
  import { getLocale, t } from "../../lib/i18n.svelte.js";
  import { generateSlug, getTopicCoverage } from "../../lib/contentQuality.js";
  import { truncate } from "../../lib/format.js";
  import {
    clearCopilotRequest,
    getPendingCopilotRequest,
    setAssistantContext,
  } from "../../lib/copilotBridge.svelte.js";
  import Button from "../../components/ui/Button.svelte";
  import Modal from "../../components/ui/Modal.svelte";
  import Tag from "../../components/ui/Tag.svelte";
  import Badge from "../../components/ui/Badge.svelte";
  import Toggle from "../../components/ui/Toggle.svelte";
  import LoadingSpinner from "../../components/ui/LoadingSpinner.svelte";
  import ContentCopilotDrawer from "../../components/copilot/ContentCopilotDrawer.svelte";

  let loading = $state(true);
  let topics = $state([]);
  let knowledgeItems = $state([]);
  let topicContents = $state({});
  let query = $state("");
  let filter = $state("all");
  let editOpen = $state(false);
  let editTopic = $state({
    id: "",
    title: "",
    description: "",
    keywords: [],
    requiresEscalation: false,
    canResolveDirectly: false,
    requiredInfo: [],
    content: "",
  });
  let editId = $state(null);
  let newKeyword = $state("");
  let requiredInfoText = $state("");
  let manualSlugEdited = $state(false);
  let busyAction = $state("");
  let copilotReview = $state({ summary: null, targets: [] });
  let copilotOpen = $state(false);
  let copilotTarget = $state(null);
  let copilotMode = $state("review");
  let copilotGoal = $state("");
  let copilotLabel = $state("");
  let copilotRequestKey = $state("");
  let copilotApplying = $state(false);
  const BLOCKING_WARNINGS = new Set(["missingRequiredInfo", "directWithoutKb"]);

  onMount(() => loadData());

  async function refreshTopics() {
    const topicsRes = await api.get("admin/agent/topics?includeContent=1");
    const loadedTopics = topicsRes.topics || topicsRes || [];
    topics = loadedTopics;
    topicContents = Object.fromEntries(
      loadedTopics.map((topic) => [topic.id, topic.content || ""])
    );
  }

  async function refreshKnowledge() {
    const knowledgeRes = await api.get("admin/knowledge").catch(() => ({ records: [] }));
    knowledgeItems = knowledgeRes.records || [];
  }

  async function refreshCopilotReview({ selection = null } = {}) {
    const response = await api.post("admin/copilot/review", {
      surface: "topics",
      locale: getLocale(),
      selection,
    });
    copilotReview = response.review || { summary: null, targets: [] };
  }

  async function loadData() {
    loading = true;
    try {
      await Promise.all([refreshTopics(), refreshKnowledge()]);
      await refreshCopilotReview();
    } catch (e) {
      showToast(t("topics.loadError", { msg: e.message }), "error");
    } finally {
      loading = false;
    }
  }

  let reviewMap = $derived(Object.fromEntries(
    (copilotReview.targets || []).map((target) => [String(target.id), target])
  ));

  let decoratedTopics = $derived(
    topics.map((topic) => {
      const content = topicContents[topic.id] || "";
      const review = reviewMap[String(topic.id)];
      const coverage = review
        ? {
            matchedEntries: review.meta?.matchedEntries || [],
            warnings: review.warningCodes || [],
          }
        : getTopicCoverage(topic, knowledgeItems, content);
      return {
        ...topic,
        content,
        matchedEntries: coverage.matchedEntries,
        warnings: coverage.warnings,
      };
    })
  );

  let filteredTopics = $derived(
    decoratedTopics.filter((topic) => {
      const haystack = [topic.title, topic.description, topic.content, ...(topic.keywords || [])].join(" ").toLowerCase();
      const matchesQuery = !query.trim() || haystack.includes(query.trim().toLowerCase());
      const matchesFilter =
        filter === "all" ||
        (filter === "coverage" && topic.matchedEntries.length === 0) ||
        (filter === "warnings" && topic.warnings.length > 0) ||
        (filter === "direct" && topic.canResolveDirectly) ||
        (filter === "escalation" && topic.requiresEscalation);
      return matchesQuery && matchesFilter;
    })
  );

  let noCoverageCount = $derived(decoratedTopics.filter((topic) => topic.matchedEntries.length === 0).length);
  let warningCount = $derived(decoratedTopics.filter((topic) => topic.warnings.length > 0).length);
  let escalationNeedsInfoCount = $derived(
    decoratedTopics.filter((topic) => topic.requiresEscalation && (topic.requiredInfo || []).length === 0).length
  );
  let pendingCopilotRequest = $derived(getPendingCopilotRequest());

  function openNew() {
    editId = null;
    editTopic = {
      id: "",
      title: "",
      description: "",
      keywords: [],
      requiresEscalation: false,
      canResolveDirectly: false,
      requiredInfo: [],
      content: `# ${t("topics.playbookTemplateTitle")}\n\n## ${t("topics.playbookSectionScope")}\n- \n\n## ${t("topics.playbookSectionSteps")}\n1. \n2. \n\n## ${t("topics.playbookSectionEscalation")}\n- \n\n## ${t("topics.playbookSectionDo")}\n- \n\n## ${t("topics.playbookSectionDont")}\n- `,
    };
    newKeyword = "";
    requiredInfoText = "";
    manualSlugEdited = false;
    editOpen = true;
  }

  async function openEdit(topic) {
    setAssistantContext({
      panel: "topics",
      selection: { id: topic.id || topic._id },
    });
    const loadedTopic = topic;
    editId = loadedTopic.id || loadedTopic._id;
    editTopic = {
      id: loadedTopic.id || "",
      title: loadedTopic.title || "",
      description: loadedTopic.description || "",
      keywords: [...(loadedTopic.keywords || [])],
      requiresEscalation: Boolean(loadedTopic.requiresEscalation),
      canResolveDirectly: Boolean(loadedTopic.canResolveDirectly),
      requiredInfo: [...(loadedTopic.requiredInfo || [])],
      content: loadedTopic.content || topicContents[loadedTopic.id] || "",
    };
    requiredInfoText = (loadedTopic.requiredInfo || []).join(", ");
    newKeyword = "";
    manualSlugEdited = true;
    editOpen = true;
  }

  async function save() {
    if (!editTopic.id.trim() || !editTopic.title.trim() || busyAction) return;

    const payload = {
      id: editTopic.id.trim(),
      title: editTopic.title.trim(),
      description: editTopic.description.trim(),
      keywords: editTopic.keywords,
      requiresEscalation: editTopic.requiresEscalation,
      canResolveDirectly: editTopic.canResolveDirectly,
      requiredInfo: requiredInfoText.split(",").map((item) => item.trim()).filter(Boolean),
      content: editTopic.content.trim(),
    };
    if (!ensureGuardrail(editCoverage)) return;

    busyAction = "save";
    try {
      if (editId) {
        await api.put(`admin/agent/topics/${editId}`, payload);
        showToast(t("common.updated"), "success");
      } else {
        await api.post("admin/agent/topics", payload);
        showToast(t("common.created"), "success");
      }
      editOpen = false;
      await loadData();
    } catch (e) {
      showToast(t("common.error", { msg: e.message }), "error");
    } finally {
      busyAction = "";
    }
  }

  async function deleteTopic(id) {
    if (busyAction) return;
    const ok = await showConfirm({
      title: t("topics.deleteTitle"),
      message: t("topics.deleteMsg"),
      confirmText: t("common.delete"),
      danger: true,
    });
    if (!ok) return;
    busyAction = "delete";
    try {
      await api.delete(`admin/agent/topics/${id}`);
      showToast(t("common.deleted"), "success");
      await refreshTopics();
    } catch (e) {
      showToast(t("common.error", { msg: e.message }), "error");
    } finally {
      busyAction = "";
    }
  }

  function addKeyword() {
    const keyword = newKeyword.trim();
    if (keyword && !editTopic.keywords.includes(keyword)) {
      editTopic.keywords = [...editTopic.keywords, keyword];
    }
    newKeyword = "";
  }

  function removeKeyword(keyword) {
    editTopic.keywords = editTopic.keywords.filter((item) => item !== keyword);
  }

  async function suggestKeywords() {
    if (!editTopic.title.trim() || busyAction) return;
    busyAction = "keywords";
    try {
      const res = await api.post("admin/topics/suggest-keywords", { title: editTopic.title.trim() });
      const suggested = Array.isArray(res.keywords) ? res.keywords : [];
      const merged = [...new Set([...editTopic.keywords, ...suggested])];
      editTopic.keywords = merged;
      showToast(t("topics.keywordsSuggested", { n: suggested.length }), "info");
    } catch (e) {
      showToast(t("topics.suggestError", { msg: e.message }), "error");
    } finally {
      busyAction = "";
    }
  }

  function updateTitle(value) {
    editTopic.title = value;
    if (!editId && !manualSlugEdited) {
      editTopic.id = generateSlug(value);
    }
  }

  function topicWarningLabel(key) {
    return t(`topics.warning.${key}`);
  }

  function getBlockingWarnings(coverage) {
    return (coverage?.warnings || []).filter((warning) => BLOCKING_WARNINGS.has(warning));
  }

  function ensureGuardrail(coverage) {
    const blocking = getBlockingWarnings(coverage);
    if (!blocking.length) return true;
    showToast(t("topics.guardrailBlocked", { reasons: blocking.map(topicWarningLabel).join(" · ") }), "error");
    return false;
  }

  function openCopilot(topic, mode = "review", goalText = "", requestId = "") {
    const topicId = topic?.id || topic?._id;
    if (!topicId) return;
    setAssistantContext({
      panel: "topics",
      selection: { id: topicId },
    });
    copilotTarget = { id: topicId };
    copilotMode = mode;
    copilotGoal = goalText;
    copilotLabel = topic?.title || topicId;
    copilotRequestKey = requestId ? String(requestId) : `${topicId}:${Date.now()}`;
    copilotOpen = true;
  }

  async function applyCopilotDraft(event) {
    const payload = event.detail?.draft?.applyPayload;
    const draftTarget = event.detail?.target;
    if (!payload || !draftTarget?.id) return;

    copilotApplying = true;
    try {
      await api.put(`admin/agent/topics/${draftTarget.id}`, payload);
      showToast(t("copilot.applied"), "success");
      copilotOpen = false;
      await loadData();
    } catch (error) {
      showToast(t("common.error", { msg: error.message }), "error");
    } finally {
      copilotApplying = false;
    }
  }

  let editCoverage = $derived(
    getTopicCoverage(
      {
        ...editTopic,
        requiredInfo: requiredInfoText.split(",").map((item) => item.trim()).filter(Boolean),
      },
      knowledgeItems,
      editTopic.content
    )
  );

  $effect(() => {
    const request = pendingCopilotRequest;
    if (!request || request.panel !== "topics" || request.surface !== "topics") return;
    const matched = topics.find((topic) => String(topic.id || topic._id) === String(request.target?.id));
    openCopilot(matched || { id: request.target?.id, title: "" }, request.mode || "review", request.goal || "", request.requestId);
    clearCopilotRequest(request.requestId);
  });
</script>

<div class="page-header">
  <div>
    <h1>{t("topics.title")} <Badge variant="blue">{topics.length}</Badge></h1>
    <p>{t("topics.subtitle")}</p>
  </div>
  <Button onclick={openNew} variant="primary" size="sm" disabled={Boolean(busyAction)}>{t("topics.newTopic")}</Button>
</div>

{#if loading}
  <LoadingSpinner message={t("common.loading")} />
{:else}
  <div class="summary-grid">
    <div class="summary-card">
      <span>{t("topics.summary.total")}</span>
      <strong>{topics.length}</strong>
    </div>
    <div class="summary-card warn">
      <span>{t("topics.summary.noCoverage")}</span>
      <strong>{noCoverageCount}</strong>
    </div>
    <div class="summary-card">
      <span>{t("topics.summary.needsReview")}</span>
      <strong>{warningCount}</strong>
    </div>
    <div class="summary-card warn">
      <span>{t("topics.summary.escalationMissingInfo")}</span>
      <strong>{escalationNeedsInfoCount}</strong>
    </div>
  </div>

  <div class="guide-card">
    <div>
      <div class="guide-eyebrow">{t("topics.guideTitle")}</div>
      <h2>{t("topics.guideSubtitle")}</h2>
      <p>{t("topics.guideText")}</p>
    </div>
    <div class="guide-points">
      <span>{t("topics.guidePoint1")}</span>
      <span>{t("topics.guidePoint2")}</span>
      <span>{t("topics.guidePoint3")}</span>
      <span>{t("topics.guidePoint4")}</span>
    </div>
  </div>

  <div class="toolbar">
    <input
      class="search-input"
      bind:value={query}
      placeholder={t("topics.searchPlaceholder")}
      aria-label={t("topics.searchPlaceholder")}
    />
    <select class="select" bind:value={filter}>
      <option value="all">{t("topics.filter.all")}</option>
      <option value="warnings">{t("topics.filter.warnings")}</option>
      <option value="coverage">{t("topics.filter.coverage")}</option>
      <option value="direct">{t("topics.filter.direct")}</option>
      <option value="escalation">{t("topics.filter.escalation")}</option>
    </select>
  </div>

  <div class="topics-grid">
    {#each filteredTopics as topic}
      <div class="topic-card">
        <div class="topic-header">
          <div>
            <h3>{topic.title}</h3>
            <div class="topic-id">{topic.id}</div>
          </div>
          <Badge variant={topic.warnings.length ? "yellow" : "green"}>
            {topic.warnings.length ? t("topics.needsReviewBadge") : t("topics.readyBadge")}
          </Badge>
        </div>

        <p class="topic-desc">
          {topic.description || truncate(topic.content || "", 180) || t("topics.noDescription")}
        </p>

        <div class="topic-meta">
          <Badge variant={topic.requiresEscalation ? "yellow" : "gray"}>{t("topics.escalation")}</Badge>
          <Badge variant={topic.canResolveDirectly ? "blue" : "gray"}>{t("topics.directResolution")}</Badge>
          <Badge variant={topic.matchedEntries.length ? "green" : "yellow"}>
            {t("topics.coverageCount", { n: topic.matchedEntries.length })}
          </Badge>
        </div>

        {#if topic.requiredInfo?.length}
          <p class="topic-info">{t("topics.required", { info: topic.requiredInfo.join(", ") })}</p>
        {/if}

        {#if topic.keywords?.length}
          <div class="topic-tags">
            {#each topic.keywords.slice(0, 6) as keyword}
              <Tag>{keyword}</Tag>
            {/each}
            {#if topic.keywords.length > 6}
              <span class="more">+{topic.keywords.length - 6}</span>
            {/if}
          </div>
        {/if}

        {#if topic.warnings.length}
          <div class="warning-list">
            {#each topic.warnings.slice(0, 2) as warning}
              <span>{topicWarningLabel(warning)}</span>
            {/each}
          </div>
        {/if}

        <div class="topic-actions">
          <Button onclick={() => openCopilot(topic, "review")} variant="ghost" size="sm">{t("copilot.reviewAction")}</Button>
          <Button onclick={() => openCopilot(topic, "draft", t("copilot.goal.topicStrengthenPlaybook"))} variant="ghost" size="sm">{t("copilot.draftAction")}</Button>
          <Button onclick={() => openEdit(topic)} variant="ghost" size="sm">{t("common.edit")}</Button>
          <Button onclick={() => deleteTopic(topic.id || topic._id)} variant="ghost" size="sm">{t("common.delete")}</Button>
        </div>
      </div>
    {:else}
      <div class="empty-state">{t("topics.empty")}</div>
    {/each}
  </div>
{/if}

<Modal bind:open={editOpen} title={editId ? t("topics.editTopic") : t("topics.newTopicTitle")} width="1080px">
  <div class="editor-grid">
    <div class="editor-main">
      <div class="form-row two">
        <div class="form-group">
          <label>{t("topics.topicTitle")}
            <input
              class="input"
              value={editTopic.title}
              placeholder={t("topics.titlePlaceholder")}
              oninput={(event) => updateTitle(event.target.value)}
            />
          </label>
        </div>
        <div class="form-group">
          <label>{t("topics.slug")}
            <input
              class="input mono"
              value={editTopic.id}
              placeholder="topic-slug"
              oninput={(event) => {
                manualSlugEdited = true;
                editTopic.id = generateSlug(event.target.value);
              }}
            />
          </label>
        </div>
      </div>

      <div class="form-group">
        <label>{t("topics.description")}
          <textarea class="textarea" bind:value={editTopic.description} rows="3" placeholder={t("topics.descPlaceholder")}></textarea>
        </label>
      </div>

      <div class="form-group">
        <label>{t("topics.keywords")}
          <div class="kw-input-row">
            <input
              class="input"
              bind:value={newKeyword}
              placeholder={t("topics.keywordPlaceholder")}
              onkeydown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  addKeyword();
                }
              }}
            />
            <Button onclick={addKeyword} variant="secondary" size="sm" disabled={Boolean(busyAction)}>{t("common.add")}</Button>
            <Button onclick={suggestKeywords} variant="ghost" size="sm" disabled={Boolean(busyAction)}>
              {busyAction === "keywords" ? t("common.saving") : t("topics.aiSuggest")}
            </Button>
          </div>
        </label>
        <div class="kw-tags">
          {#each editTopic.keywords as keyword}
            <Tag removable onremove={() => removeKeyword(keyword)}>{keyword}</Tag>
          {/each}
        </div>
      </div>

      <div class="form-row two">
        <div class="form-group">
          <label>{t("topics.requiredInfo")}
            <input class="input" bind:value={requiredInfoText} placeholder={t("topics.requiredPlaceholder")} />
          </label>
        </div>
        <div class="toggle-grid">
          <div class="toggle-card">
            <div>
              <strong>{t("topics.requiresEscalation")}</strong>
              <p>{t("topics.requiresEscalationHint")}</p>
            </div>
            <Toggle bind:checked={editTopic.requiresEscalation} />
          </div>
          <div class="toggle-card">
            <div>
              <strong>{t("topics.canResolve")}</strong>
              <p>{t("topics.canResolveHint")}</p>
            </div>
            <Toggle bind:checked={editTopic.canResolveDirectly} />
          </div>
        </div>
      </div>

      <div class="form-group">
        <label>{t("topics.playbook")}
          <textarea class="textarea code" bind:value={editTopic.content} rows="18" placeholder={t("topics.playbookPlaceholder")}></textarea>
        </label>
      </div>
    </div>

    <div class="editor-side">
      <div class="review-card">
        <div class="review-title">{t("topics.reviewTitle")}</div>
        <p>{t("topics.reviewText")}</p>
        <div class="warning-list stacked">
          {#if editCoverage.warnings.length}
            {#each editCoverage.warnings as warning}
              <span>{topicWarningLabel(warning)}</span>
            {/each}
          {:else}
            <span class="success">{t("topics.reviewLooksGood")}</span>
          {/if}
        </div>
        {#if getBlockingWarnings(editCoverage).length}
          <div class="guardrail-note">{t("topics.guardrailNote")}</div>
        {/if}
      </div>

      <div class="review-card">
        <div class="review-title">{t("topics.linkedKnowledgeTitle")}</div>
        <p>{t("topics.linkedKnowledgeText")}</p>
        <div class="linked-list">
          {#each editCoverage.matchedEntries.slice(0, 8) as entry}
            <div class="linked-item">{truncate(entry.question, 96)}</div>
          {:else}
            <div class="linked-empty">{t("topics.linkedKnowledgeEmpty")}</div>
          {/each}
        </div>
      </div>
    </div>
  </div>

  <div class="modal-actions">
    <Button onclick={() => (editOpen = false)} variant="secondary" disabled={Boolean(busyAction)}>{t("common.cancel")}</Button>
    <Button onclick={save} variant="primary" disabled={Boolean(busyAction)}>
      {busyAction === "save" ? t("common.saving") : t("common.save")}
    </Button>
  </div>
</Modal>

<ContentCopilotDrawer
  bind:open={copilotOpen}
  surface="topics"
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
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .page-header p {
    font-size: 13px;
    color: var(--text-muted);
    margin-top: 2px;
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

  .summary-card span {
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
  .linked-item {
    display: inline-flex;
    align-items: center;
    padding: 7px 10px;
    border-radius: 12px;
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

  .select {
    width: auto;
    min-width: 220px;
  }

  .search-input:focus,
  .select:focus,
  .input:focus,
  .textarea:focus {
    border-color: var(--accent);
    box-shadow: 0 0 0 3px rgba(15, 108, 189, 0.1);
  }

  .topics-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 16px;
  }

  .topic-card {
    background: var(--bg-card);
    border-radius: 20px;
    padding: 18px;
    box-shadow: var(--shadow);
    border: 1px solid var(--border-light);
    display: grid;
    gap: 12px;
  }

  .topic-header {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    align-items: flex-start;
  }

  .topic-header h3 {
    font-size: 16px;
    font-weight: 700;
    margin-bottom: 4px;
  }

  .topic-id {
    font-size: 12px;
    color: var(--text-muted);
    font-family: "JetBrains Mono", monospace;
  }

  .topic-desc,
  .topic-info {
    font-size: 12px;
    color: var(--text-secondary);
    line-height: 1.6;
  }

  .topic-meta,
  .topic-tags,
  .warning-list {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .warning-list span {
    background: #fff7e7;
    border-color: #f1d8a5;
    color: #8a5a00;
  }

  .warning-list.stacked {
    flex-direction: column;
  }

  .warning-list .success {
    background: var(--success-bg);
    border-color: rgba(5, 150, 105, 0.2);
    color: var(--success);
  }

  .guardrail-note {
    margin-top: 10px;
    padding: 10px 12px;
    border-radius: 12px;
    background: #fff7ed;
    border: 1px solid #fdba74;
    color: #9a3412;
    font-size: 12px;
    line-height: 1.5;
  }

  .topic-actions {
    display: flex;
    gap: 6px;
    margin-top: auto;
  }

  .more {
    font-size: 12px;
    color: var(--text-muted);
    align-self: center;
  }

  .empty-state {
    grid-column: 1 / -1;
    text-align: center;
    padding: 40px;
    color: var(--text-muted);
  }

  .editor-grid {
    display: grid;
    grid-template-columns: minmax(0, 1.7fr) minmax(300px, 1fr);
    gap: 18px;
  }

  .editor-main {
    min-width: 0;
  }

  .editor-side {
    display: grid;
    gap: 14px;
    align-content: start;
  }

  .form-row.two {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(220px, 320px);
    gap: 12px;
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
  }

  .textarea.code {
    min-height: 360px;
    font-family: "JetBrains Mono", monospace;
    line-height: 1.6;
  }

  .kw-input-row {
    display: flex;
    gap: 8px;
    margin-bottom: 8px;
  }

  .kw-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .toggle-grid {
    display: grid;
    gap: 10px;
  }

  .toggle-card {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    align-items: center;
    padding: 12px 14px;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 16px;
  }

  .toggle-card strong {
    display: block;
    font-size: 13px;
    color: var(--text);
  }

  .toggle-card p,
  .review-card p,
  .linked-empty {
    font-size: 12px;
    color: var(--text-secondary);
  }

  .review-card {
    padding: 16px;
    border-radius: 18px;
    background: var(--bg);
    border: 1px solid var(--border);
    display: grid;
    gap: 12px;
  }

  .review-title {
    font-size: 14px;
    font-weight: 700;
    color: var(--text);
  }

  .linked-list {
    display: grid;
    gap: 8px;
  }

  .linked-item {
    border-radius: 14px;
  }

  .modal-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 16px;
  }

  .mono {
    font-family: "JetBrains Mono", monospace;
  }

  @media (max-width: 1200px) {
    .topics-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .summary-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .guide-card,
    .editor-grid,
    .form-row.two {
      grid-template-columns: 1fr;
    }
  }

  @media (max-width: 768px) {
    .page-header {
      flex-direction: column;
      align-items: flex-start;
    }

    .topics-grid,
    .summary-grid {
      grid-template-columns: 1fr;
    }

    .topic-actions {
      flex-direction: column;
    }
  }
</style>

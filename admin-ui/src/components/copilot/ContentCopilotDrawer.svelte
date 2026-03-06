<script>
  import { createEventDispatcher } from "svelte";
  import { api } from "../../lib/api.js";
  import { getLocale, t } from "../../lib/i18n.svelte.js";
  import Button from "../ui/Button.svelte";
  import Badge from "../ui/Badge.svelte";
  import LoadingSpinner from "../ui/LoadingSpinner.svelte";

  const dispatch = createEventDispatcher();

  let {
    open = $bindable(false),
    surface = "",
    target = null,
    contextLabel = "",
    initialMode = "review",
    initialGoal = "",
    requestKey = "",
    applying = false,
  } = $props();

  let review = $state(null);
  let draft = $state(null);
  let reviewLoading = $state(false);
  let draftLoading = $state(false);
  let errorMessage = $state("");
  let goal = $state("");
  let reviewAbort = null;
  let draftAbort = null;
  let currentLoadKey = "";

  let selectedTarget = $derived(review?.targets?.[0] || null);
  let surfaceLabel = $derived(t(`copilot.surface.${surface}`));
  let panelTitle = $derived(contextLabel || selectedTarget?.label || t("copilot.defaultTitle"));

  function closeDrawer() {
    abortPending();
    open = false;
  }

  function abortPending() {
    reviewAbort?.abort();
    draftAbort?.abort();
    reviewAbort = null;
    draftAbort = null;
  }

  function formatValue(value) {
    if (Array.isArray(value)) return value.join(", ");
    if (value && typeof value === "object") return JSON.stringify(value, null, 2);
    return String(value ?? "");
  }

  function fieldLabel(field) {
    return t(`copilot.field.${field}`);
  }

  function reviewMessage(finding) {
    return t(finding.messageKey, finding.params);
  }

  function suggestionLabel(suggestion) {
    return t(`copilot.goal.${suggestion.goalKey}`);
  }

  function statusVariant(status) {
    return status === "ready" ? "green" : "yellow";
  }

  async function loadReview(shouldDraft = false) {
    if (!surface || !target) return;
    reviewLoading = true;
    errorMessage = "";
    reviewAbort?.abort();
    reviewAbort = new AbortController();

    try {
      const response = await api.post("admin/copilot/review", {
        surface,
        locale: getLocale(),
        selection: target,
      }, {
        signal: reviewAbort.signal,
      });
      review = response.review || null;
      if (shouldDraft) {
        await loadDraft();
      }
    } catch (error) {
      if (error.name === "AbortError") return;
      errorMessage = error.message;
    } finally {
      reviewLoading = false;
    }
  }

  async function loadDraft() {
    if (!surface || !target) return;
    draftLoading = true;
    errorMessage = "";
    draftAbort?.abort();
    draftAbort = new AbortController();

    try {
      const response = await api.post("admin/copilot/draft", {
        surface,
        locale: getLocale(),
        target,
        goal: goal.trim(),
      }, {
        signal: draftAbort.signal,
      });
      draft = response.draft || null;
      if (!response.draft && response.error) {
        errorMessage = response.error;
      }
    } catch (error) {
      if (error.name === "AbortError") return;
      errorMessage = error.message;
      draft = null;
    } finally {
      draftLoading = false;
    }
  }

  function applyDraft() {
    if (!draft || applying) return;
    dispatch("apply", {
      surface,
      target,
      draft,
    });
  }

  $effect(() => {
    const nextKey = open && surface && target
      ? `${surface}:${JSON.stringify(target)}:${requestKey}:${initialMode}`
      : "";

    if (!nextKey) {
      currentLoadKey = "";
      return;
    }

    if (nextKey === currentLoadKey) return;
    currentLoadKey = nextKey;
    goal = initialGoal || "";
    draft = null;
    review = null;
    errorMessage = "";
    void loadReview(initialMode === "draft");
  });

  $effect(() => {
    if (open) return;
    abortPending();
  });
</script>

<svelte:window onkeydown={(event) => {
  if (open && event.key === "Escape") closeDrawer();
}} />

{#if open}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="drawer-overlay" onclick={(event) => {
    if (event.target === event.currentTarget) closeDrawer();
  }}>
    <div class="drawer-shell" role="dialog" aria-label={t("copilot.title")}>
      <header class="drawer-header">
        <div class="title-stack">
          <div class="eyebrow">{surfaceLabel}</div>
          <h2>{panelTitle}</h2>
          <p>{t("copilot.subtitle")}</p>
        </div>
        <button class="close-btn" onclick={closeDrawer} aria-label={t("common.close")}>×</button>
      </header>

      <div class="drawer-body">
        {#if reviewLoading && !review}
          <LoadingSpinner message={t("copilot.loadingReview")} />
        {:else}
          <section class="status-card">
            <div class="status-head">
              <div>
                <strong>{t("copilot.reviewTitle")}</strong>
                <p>{t("copilot.reviewText")}</p>
              </div>
              {#if selectedTarget}
                <Badge variant={statusVariant(selectedTarget.status)}>
                  {selectedTarget.status === "ready" ? t("copilot.ready") : t("copilot.needsReview")}
                </Badge>
              {/if}
            </div>

            {#if selectedTarget?.findings?.length}
              <div class="finding-list">
                {#each selectedTarget.findings as finding}
                  <div class="finding-item">
                    <strong>{t("copilot.findingTitle")}</strong>
                    <span>{reviewMessage(finding)}</span>
                  </div>
                {/each}
              </div>
            {:else}
              <div class="ready-box">{t("copilot.noFindings")}</div>
            {/if}

            {#if selectedTarget?.meta?.matches?.length}
              <div class="meta-section">
                <div class="meta-title">{t("copilot.matchesTitle")}</div>
                <div class="badge-row">
                  {#each selectedTarget.meta.matches as match}
                    <Badge variant="blue">{match.title} · {match.confidence}</Badge>
                  {/each}
                </div>
              </div>
            {/if}

            {#if selectedTarget?.meta?.matchedEntries?.length}
              <div class="meta-section">
                <div class="meta-title">{t("copilot.coverageTitle")}</div>
                <div class="snippet-list">
                  {#each selectedTarget.meta.matchedEntries.slice(0, 6) as entry}
                    <div class="snippet-item">{entry.question}</div>
                  {/each}
                </div>
              </div>
            {/if}

            {#if selectedTarget?.meta?.overlapTopics?.length}
              <div class="meta-section">
                <div class="meta-title">{t("copilot.overlapTitle")}</div>
                <div class="snippet-list">
                  {#each selectedTarget.meta.overlapTopics as overlap}
                    <div class="snippet-item">
                      <strong>{overlap.title}</strong>
                      <span>{overlap.keywords.join(", ")}</span>
                    </div>
                  {/each}
                </div>
              </div>
            {/if}

            {#if selectedTarget?.suggestions?.length}
              <div class="meta-section">
                <div class="meta-title">{t("copilot.suggestedGoals")}</div>
                <div class="badge-row">
                  {#each selectedTarget.suggestions as suggestion}
                    <button class="goal-chip" onclick={() => (goal = suggestionLabel(suggestion))}>
                      {suggestionLabel(suggestion)}
                    </button>
                  {/each}
                </div>
              </div>
            {/if}
          </section>

          <section class="draft-card">
            <div class="status-head">
              <div>
                <strong>{t("copilot.draftTitle")}</strong>
                <p>{t("copilot.draftText")}</p>
              </div>
              <Button onclick={loadDraft} variant="primary" size="sm" disabled={draftLoading || reviewLoading || !target}>
                {draftLoading ? t("copilot.loadingDraft") : t("copilot.generateDraft")}
              </Button>
            </div>

            <label class="goal-box">
              <span>{t("copilot.goalLabel")}</span>
              <textarea
                class="goal-input"
                rows="3"
                bind:value={goal}
                placeholder={t("copilot.goalPlaceholder")}
              ></textarea>
            </label>

            {#if errorMessage}
              <div class="error-box">{errorMessage}</div>
            {/if}

            {#if draft}
              <div class="draft-meta">
                <Badge variant="blue">{t("copilot.confidence", { value: draft.confidence })}</Badge>
                <Badge variant="gray">{t("copilot.changeCount", { n: draft.changes?.length || 0 })}</Badge>
              </div>

              <div class="change-list">
                {#each draft.changes || [] as change}
                  <div class="change-card">
                    <div class="change-head">{fieldLabel(change.field)}</div>
                    <div class="change-grid">
                      <div>
                        <div class="change-label">{t("copilot.currentValue")}</div>
                        <pre>{formatValue(change.before)}</pre>
                      </div>
                      <div>
                        <div class="change-label">{t("copilot.proposedValue")}</div>
                        <pre>{formatValue(change.after)}</pre>
                      </div>
                    </div>
                  </div>
                {/each}
              </div>

              {#if draft.rationale?.length}
                <div class="meta-section">
                  <div class="meta-title">{t("copilot.rationaleTitle")}</div>
                  <div class="snippet-list">
                    {#each draft.rationale as item}
                      <div class="snippet-item">{item}</div>
                    {/each}
                  </div>
                </div>
              {/if}

              <div class="drawer-actions">
                <Button onclick={applyDraft} variant="primary" disabled={applying}>
                  {applying ? t("copilot.applying") : t("copilot.applyDraft")}
                </Button>
              </div>
            {:else if draftLoading}
              <LoadingSpinner message={t("copilot.loadingDraft")} />
            {/if}
          </section>
        {/if}
      </div>
    </div>
  </div>
{/if}

<style>
  .drawer-overlay {
    position: fixed;
    inset: 0;
    background: rgba(15, 23, 42, 0.28);
    backdrop-filter: blur(3px);
    z-index: 9200;
    display: flex;
    justify-content: flex-end;
  }

  .drawer-shell {
    width: min(620px, 100vw);
    height: 100vh;
    background: var(--bg-card);
    border-left: 1px solid var(--border);
    box-shadow: -20px 0 60px rgba(15, 23, 42, 0.18);
    display: flex;
    flex-direction: column;
  }

  .drawer-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
    padding: 22px;
    border-bottom: 1px solid var(--border-light);
    background:
      linear-gradient(135deg, rgba(15, 108, 189, 0.08), transparent 38%),
      var(--bg-card);
  }

  .title-stack {
    min-width: 0;
  }

  .eyebrow {
    font-size: 11px;
    font-weight: 800;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--accent);
    margin-bottom: 8px;
  }

  .title-stack h2 {
    font-size: 20px;
    font-weight: 700;
    margin-bottom: 6px;
  }

  .title-stack p {
    font-size: 13px;
    color: var(--text-secondary);
    line-height: 1.6;
  }

  .close-btn {
    width: 40px;
    height: 40px;
    border-radius: 12px;
    border: 1px solid var(--border);
    background: var(--bg);
    font-size: 22px;
    line-height: 1;
    cursor: pointer;
    color: var(--text-muted);
  }

  .drawer-body {
    flex: 1;
    overflow-y: auto;
    padding: 20px;
    display: grid;
    gap: 16px;
  }

  .status-card,
  .draft-card {
    border: 1px solid var(--border-light);
    border-radius: 20px;
    background: var(--bg-card);
    padding: 16px;
    display: grid;
    gap: 14px;
    box-shadow: var(--shadow-sm);
  }

  .status-head {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 12px;
  }

  .status-head strong {
    display: block;
    font-size: 15px;
    font-weight: 700;
    margin-bottom: 4px;
  }

  .status-head p {
    font-size: 12px;
    color: var(--text-secondary);
    line-height: 1.6;
  }

  .finding-list,
  .snippet-list,
  .change-list {
    display: grid;
    gap: 10px;
  }

  .finding-item,
  .snippet-item,
  .ready-box,
  .error-box {
    padding: 12px 14px;
    border-radius: 14px;
    border: 1px solid var(--border);
    background: var(--bg);
    font-size: 12px;
    line-height: 1.6;
  }

  .finding-item {
    background: #fff7e7;
    border-color: #f1d8a5;
  }

  .finding-item strong {
    display: block;
    font-size: 11px;
    font-weight: 800;
    color: #8a5a00;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin-bottom: 4px;
  }

  .ready-box {
    color: var(--success);
    background: var(--success-bg);
    border-color: rgba(5, 150, 105, 0.15);
  }

  .error-box {
    color: var(--danger);
    background: rgba(220, 38, 38, 0.06);
    border-color: rgba(220, 38, 38, 0.12);
  }

  .meta-section {
    display: grid;
    gap: 8px;
  }

  .meta-title,
  .change-label,
  .goal-box span {
    font-size: 12px;
    font-weight: 700;
    color: var(--text-muted);
  }

  .badge-row {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .goal-chip {
    border: 1px solid rgba(15, 108, 189, 0.15);
    background: rgba(15, 108, 189, 0.06);
    color: var(--accent);
    padding: 8px 10px;
    border-radius: 999px;
    font-size: 12px;
    cursor: pointer;
  }

  .goal-box {
    display: grid;
    gap: 6px;
  }

  .goal-input {
    width: 100%;
    border: 1px solid var(--border);
    border-radius: 14px;
    padding: 10px 12px;
    background: var(--bg);
    color: var(--text);
    font-family: inherit;
    font-size: 13px;
    resize: vertical;
    outline: none;
  }

  .goal-input:focus {
    border-color: var(--accent);
    box-shadow: 0 0 0 3px rgba(15, 108, 189, 0.12);
  }

  .draft-meta,
  .drawer-actions {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }

  .change-card {
    border: 1px solid var(--border);
    border-radius: 16px;
    background: var(--bg);
    overflow: hidden;
  }

  .change-head {
    padding: 10px 12px;
    font-size: 12px;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--text-secondary);
    border-bottom: 1px solid var(--border-light);
  }

  .change-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0;
  }

  .change-grid > div {
    padding: 12px;
    min-width: 0;
  }

  .change-grid > div + div {
    border-left: 1px solid var(--border-light);
  }

  pre {
    margin: 6px 0 0;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    font-size: 12px;
    line-height: 1.6;
    font-family: "JetBrains Mono", monospace;
    color: var(--text);
  }

  .snippet-item strong {
    display: block;
    margin-bottom: 4px;
  }

  @media (max-width: 720px) {
    .drawer-shell {
      width: 100vw;
    }

    .change-grid {
      grid-template-columns: 1fr;
    }

    .change-grid > div + div {
      border-left: none;
      border-top: 1px solid var(--border-light);
    }

    .status-head {
      flex-direction: column;
    }
  }
</style>

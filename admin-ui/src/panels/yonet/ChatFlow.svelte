<script>
  import { onMount } from "svelte";
  import { api } from "../../lib/api.js";
  import { showToast } from "../../lib/toast.svelte.js";
  import { t } from "../../lib/i18n.svelte.js";
  import Button from "../../components/ui/Button.svelte";
  import Toggle from "../../components/ui/Toggle.svelte";
  import LoadingSpinner from "../../components/ui/LoadingSpinner.svelte";

  const MS_PER_MINUTE = 60 * 1000;
  const DEFAULT_CHAT_FLOW = {
    messageAggregationWindowMs: 4000,
    botResponseDelayMs: 2000,
    typingIndicatorEnabled: true,
    inactivityTimeoutMs: 600000,
    nudgeEnabled: true,
    nudgeAt75Message: "I'm still here. How can I help you?",
    nudgeAt90Message: "I haven't received a message in a while. Can I help with anything?",
    inactivityCloseMessage: "I'm closing this chat due to inactivity. Feel free to reach out again anytime.",
    maxClarificationRetries: 3,
    gibberishDetectionEnabled: true,
    gibberishMessage: "I couldn't understand your message. Could you please describe your issue in more detail?",
    closingFlowEnabled: true,
    anythingElseMessage: "Is there anything else I can help you with?",
    farewellMessage: "Have a great day! Feel free to reach out again anytime.",
    csatEnabled: true,
    csatMessage: "Would you like to rate your experience?",
    welcomeMessage: "Hello! Welcome to Technical Support. How can I help you?",
    questionExtractionEnabled: true,
    conversationSummaryEnabled: true,
    summaryThreshold: 15,
  };

  let loading = $state(true);
  let config = $state({ ...DEFAULT_CHAT_FLOW });
  let inactivityTimeoutMinutes = $state(DEFAULT_CHAT_FLOW.inactivityTimeoutMs / MS_PER_MINUTE);

  function normalizeConfig(raw = {}) {
    return {
      ...DEFAULT_CHAT_FLOW,
      ...(raw || {}),
    };
  }

  function syncDerivedState(nextConfig = config) {
    const minutes = Math.max(
      1,
      Math.round((Number(nextConfig.inactivityTimeoutMs) || DEFAULT_CHAT_FLOW.inactivityTimeoutMs) / MS_PER_MINUTE)
    );
    inactivityTimeoutMinutes = minutes;
  }

  onMount(async () => {
    try {
      const res = await api.get("admin/chat-flow");
      config = normalizeConfig(res.config || res || {});
      syncDerivedState(config);
    } catch (e) {
      showToast(t("chatFlow.loadError", { msg: e.message }), "error");
    } finally {
      loading = false;
    }
  });

  function updateInactivityTimeout(value) {
    const minutes = Math.max(1, Number(value) || 0);
    inactivityTimeoutMinutes = minutes;
    config = {
      ...config,
      inactivityTimeoutMs: minutes * MS_PER_MINUTE,
    };
  }

  async function save() {
    try {
      const payload = {
        ...config,
        messageAggregationWindowMs: Number(config.messageAggregationWindowMs) || DEFAULT_CHAT_FLOW.messageAggregationWindowMs,
        botResponseDelayMs: Number(config.botResponseDelayMs) || DEFAULT_CHAT_FLOW.botResponseDelayMs,
        inactivityTimeoutMs: Math.max(1, Number(inactivityTimeoutMinutes) || 1) * MS_PER_MINUTE,
        maxClarificationRetries: Number(config.maxClarificationRetries) || DEFAULT_CHAT_FLOW.maxClarificationRetries,
        summaryThreshold: Number(config.summaryThreshold) || DEFAULT_CHAT_FLOW.summaryThreshold,
      };
      await api.put("admin/chat-flow", { config: payload });
      config = normalizeConfig(payload);
      syncDerivedState(config);
      showToast(t("chatFlow.saved"), "success");
    } catch (e) {
      showToast(t("common.error", { msg: e.message }), "error");
    }
  }
</script>

<div class="page-header">
  <div>
    <h1>{t("chatFlow.title")}</h1>
    <p>{t("chatFlow.subtitle")}</p>
  </div>
  <Button onclick={save} variant="primary" size="sm">{t("common.save")}</Button>
</div>

{#if loading}
  <LoadingSpinner message={t("common.loading")} />
{:else}
  <div class="card note-card">
    <div class="card-title">{t("chatFlow.sourceOfTruthTitle")}</div>
    <p>{t("chatFlow.sourceOfTruthText")}</p>
  </div>

  <div class="flow-sections">
    <div class="card">
      <h2>{t("chatFlow.runtime")}</h2>
      <div class="form-grid">
        <label class="form-group full-width">
          <span>{t("chatFlow.welcomeMessage")}</span>
          <textarea class="textarea" bind:value={config.welcomeMessage} rows="3"></textarea>
        </label>
        <label class="form-group">
          <span>{t("chatFlow.aggregationWindow")}</span>
          <input class="input" type="number" bind:value={config.messageAggregationWindowMs} />
        </label>
        <label class="form-group">
          <span>{t("chatFlow.responseDelay")}</span>
          <input class="input" type="number" bind:value={config.botResponseDelayMs} />
        </label>
        <div class="form-row">
          <label>{t("chatFlow.typingIndicator")}
            <Toggle bind:checked={config.typingIndicatorEnabled} />
          </label>
        </div>
      </div>
    </div>

    <div class="card">
      <h2>{t("chatFlow.collection")}</h2>
      <div class="form-grid">
        <label class="form-group">
          <span>{t("chatFlow.maxClarificationRetries")}</span>
          <input class="input" type="number" bind:value={config.maxClarificationRetries} />
        </label>
        <div class="form-row">
          <label>{t("chatFlow.questionExtraction")}
            <Toggle bind:checked={config.questionExtractionEnabled} />
          </label>
        </div>
        <div class="form-row">
          <label>{t("chatFlow.gibberishDetection")}
            <Toggle bind:checked={config.gibberishDetectionEnabled} />
          </label>
        </div>
        <label class="form-group full-width">
          <span>{t("chatFlow.gibberishMessage")}</span>
          <textarea class="textarea" bind:value={config.gibberishMessage} rows="2"></textarea>
        </label>
      </div>
    </div>

    <div class="card">
      <h2>{t("chatFlow.inactivity")}</h2>
      <div class="form-grid">
        <label class="form-group">
          <span>{t("chatFlow.inactivityTimeout")}</span>
          <input
            class="input"
            type="number"
            value={inactivityTimeoutMinutes}
            oninput={(e) => updateInactivityTimeout(e.target.value)}
          />
        </label>
        <div class="form-row">
          <label>{t("chatFlow.nudgeEnabled")}
            <Toggle bind:checked={config.nudgeEnabled} />
          </label>
        </div>
        <label class="form-group full-width">
          <span>{t("chatFlow.nudge75")}</span>
          <textarea class="textarea" bind:value={config.nudgeAt75Message} rows="2"></textarea>
        </label>
        <label class="form-group full-width">
          <span>{t("chatFlow.nudge90")}</span>
          <textarea class="textarea" bind:value={config.nudgeAt90Message} rows="2"></textarea>
        </label>
        <label class="form-group full-width">
          <span>{t("chatFlow.inactivityClose")}</span>
          <textarea class="textarea" bind:value={config.inactivityCloseMessage} rows="2"></textarea>
        </label>
      </div>
    </div>

    <div class="card">
      <h2>{t("chatFlow.summaryAndClose")}</h2>
      <div class="form-grid">
        <div class="form-row">
          <label>{t("chatFlow.closingEnabled")}
            <Toggle bind:checked={config.closingFlowEnabled} />
          </label>
        </div>
        <div class="form-row">
          <label>{t("chatFlow.csatSurvey")}
            <Toggle bind:checked={config.csatEnabled} />
          </label>
        </div>
        <div class="form-row">
          <label>{t("chatFlow.conversationSummary")}
            <Toggle bind:checked={config.conversationSummaryEnabled} />
          </label>
        </div>
        <label class="form-group full-width">
          <span>{t("chatFlow.anythingElse")}</span>
          <textarea class="textarea" bind:value={config.anythingElseMessage} rows="2"></textarea>
        </label>
        <label class="form-group full-width">
          <span>{t("chatFlow.farewellMessage")}</span>
          <textarea class="textarea" bind:value={config.farewellMessage} rows="2"></textarea>
        </label>
        <label class="form-group full-width">
          <span>{t("chatFlow.csatMessage")}</span>
          <textarea class="textarea" bind:value={config.csatMessage} rows="2"></textarea>
        </label>
        <label class="form-group">
          <span>{t("chatFlow.summaryThreshold")}</span>
          <input class="input" type="number" bind:value={config.summaryThreshold} />
        </label>
      </div>
    </div>
  </div>
{/if}

<style>
  .page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
  .page-header h1 { font-size: 22px; font-weight: 700; }
  .page-header p { font-size: 13px; color: var(--text-muted); margin-top: 2px; }

  .note-card { margin-bottom: 12px; }
  .flow-sections { display: flex; flex-direction: column; gap: 16px; }
  .card { background: var(--bg-card); border-radius: var(--radius); padding: 20px; box-shadow: var(--shadow); border: 1px solid var(--border-light); }
  .card h2, .card-title { font-size: 15px; font-weight: 600; margin-bottom: 14px; }
  .note-card p { font-size: 13px; color: var(--text-secondary); line-height: 1.6; }
  .form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .form-group { display: flex; flex-direction: column; gap: 4px; }
  .form-group > span { font-size: 12px; font-weight: 600; color: var(--text-secondary); }
  .form-group.full-width { grid-column: 1 / -1; }
  .form-row { display: flex; align-items: center; justify-content: space-between; }
  .form-row label { font-size: 12px; font-weight: 600; color: var(--text-secondary); }
  .input { width: 100%; padding: 8px 12px; border: 1px solid var(--border); border-radius: var(--radius-sm); font-size: 13px; font-family: inherit; color: var(--text); outline: none; }
  .input:focus { border-color: var(--accent); }
  .textarea { width: 100%; padding: 8px 12px; border: 1px solid var(--border); border-radius: var(--radius-sm); font-size: 13px; font-family: inherit; color: var(--text); resize: vertical; outline: none; }
  @media (max-width: 980px) { .form-grid { grid-template-columns: 1fr; } }
</style>

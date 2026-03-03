<script>
  import { onMount } from "svelte";
  import { api } from "../../lib/api.js";
  import { showToast } from "../../lib/toast.svelte.js";
  import { t } from "../../lib/i18n.svelte.js";
  import Button from "../../components/ui/Button.svelte";
  import Toggle from "../../components/ui/Toggle.svelte";
  import LoadingSpinner from "../../components/ui/LoadingSpinner.svelte";

  let loading = $state(true);
  let config = $state({});

  onMount(async () => {
    try {
      const res = await api.get("admin/chat-flow");
      config = res.config || res || {};
    } catch (e) {
      showToast(t("chatFlow.loadError", { msg: e.message }), "error");
    } finally {
      loading = false;
    }
  });

  async function save() {
    try {
      await api.put("admin/chat-flow", { config });
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
  <div class="flow-sections">
    <div class="card">
      <h2>{t("chatFlow.greeting")}</h2>
      <div class="form-grid">
        <div class="form-row">
          <label>{t("chatFlow.greetingEnabled")}
            <Toggle bind:checked={config.greetingEnabled} />
          </label>
        </div>
        <div class="form-group">
          <label>{t("chatFlow.greetingMessage")}
            <textarea class="textarea" bind:value={config.greetingMessage} rows="3"></textarea>
          </label>
        </div>
        <div class="form-group">
          <label>{t("chatFlow.greetingDelay")}
            <input class="input" type="number" bind:value={config.greetingDelay} />
          </label>
        </div>
      </div>
    </div>

    <div class="card">
      <h2>{t("chatFlow.timing")}</h2>
      <div class="form-grid">
        <div class="form-group">
          <label>{t("chatFlow.offHoursMessage")}
            <textarea class="textarea" bind:value={config.offHoursMessage} rows="2"></textarea>
          </label>
        </div>
        <div class="form-group">
          <label>{t("chatFlow.autoClose")}
            <input class="input" type="number" bind:value={config.autoCloseMinutes} />
          </label>
        </div>
        <div class="form-group">
          <label>{t("chatFlow.inactivityWarning")}
            <input class="input" type="number" bind:value={config.inactivityWarningMinutes} />
          </label>
        </div>
        <div class="form-group">
          <label>{t("chatFlow.aggregationWindow")}
            <input class="input" type="number" bind:value={config.messageAggregationWindowMs} />
          </label>
        </div>
        <div class="form-group">
          <label>{t("chatFlow.responseDelay")}
            <input class="input" type="number" bind:value={config.botResponseDelayMs} />
          </label>
        </div>
        <div class="form-row">
          <label>{t("chatFlow.typingIndicator")}
            <Toggle bind:checked={config.typingIndicatorEnabled} />
          </label>
        </div>
      </div>
    </div>

    <div class="card">
      <h2>{t("chatFlow.detection")}</h2>
      <div class="form-grid">
        <div class="form-row">
          <label>{t("chatFlow.topicDetection")}
            <Toggle bind:checked={config.topicDetectionEnabled} />
          </label>
        </div>
        <div class="form-row">
          <label>{t("chatFlow.sentimentAnalysis")}
            <Toggle bind:checked={config.sentimentEnabled} />
          </label>
        </div>
        <div class="form-group">
          <label>{t("chatFlow.maxClarifications")}
            <input class="input" type="number" bind:value={config.maxClarifications} />
          </label>
        </div>
        <div class="form-row">
          <label>{t("chatFlow.gibberishDetection")}
            <Toggle bind:checked={config.gibberishDetectionEnabled} />
          </label>
        </div>
        <div class="form-group">
          <label>{t("chatFlow.gibberishMessage")}
            <textarea class="textarea" bind:value={config.gibberishMessage} rows="2"></textarea>
          </label>
        </div>
      </div>
    </div>

    <div class="card">
      <h2>{t("chatFlow.closing")}</h2>
      <div class="form-grid">
        <div class="form-row">
          <label>{t("chatFlow.closingEnabled")}
            <Toggle bind:checked={config.closingFlowEnabled} />
          </label>
        </div>
        <div class="form-group">
          <label>{t("chatFlow.closingMessage")}
            <textarea class="textarea" bind:value={config.closingMessage} rows="2"></textarea>
          </label>
        </div>
        <div class="form-group">
          <label>{t("chatFlow.anythingElse")}
            <textarea class="textarea" bind:value={config.anythingElseMessage} rows="2"></textarea>
          </label>
        </div>
        <div class="form-group">
          <label>{t("chatFlow.farewellMessage")}
            <textarea class="textarea" bind:value={config.farewellMessage} rows="2"></textarea>
          </label>
        </div>
        <div class="form-row">
          <label>{t("chatFlow.csatSurvey")}
            <Toggle bind:checked={config.csatEnabled} />
          </label>
        </div>
        <div class="form-group">
          <label>{t("chatFlow.csatMessage")}
            <textarea class="textarea" bind:value={config.csatMessage} rows="2"></textarea>
          </label>
        </div>
      </div>
    </div>

    <div class="card">
      <h2>{t("chatFlow.nudge")}</h2>
      <div class="form-grid">
        <div class="form-row">
          <label>{t("chatFlow.nudgeEnabled")}
            <Toggle bind:checked={config.nudgeEnabled} />
          </label>
        </div>
        <div class="form-group">
          <label>{t("chatFlow.nudge75")}
            <textarea class="textarea" bind:value={config.nudgeAt75Message} rows="2"></textarea>
          </label>
        </div>
        <div class="form-group">
          <label>{t("chatFlow.nudge90")}
            <textarea class="textarea" bind:value={config.nudgeAt90Message} rows="2"></textarea>
          </label>
        </div>
        <div class="form-group">
          <label>{t("chatFlow.inactivityClose")}
            <textarea class="textarea" bind:value={config.inactivityCloseMessage} rows="2"></textarea>
          </label>
        </div>
      </div>
    </div>
  </div>
{/if}

<style>
  .page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
  .page-header h1 { font-size: 22px; font-weight: 700; }
  .page-header p { font-size: 13px; color: var(--text-muted); margin-top: 2px; }

  .flow-sections { display: flex; flex-direction: column; gap: 16px; }
  .card { background: var(--bg-card); border-radius: var(--radius); padding: 20px; box-shadow: var(--shadow); border: 1px solid var(--border-light); }
  .card h2 { font-size: 15px; font-weight: 600; margin-bottom: 14px; }
  .form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .form-group { display: flex; flex-direction: column; gap: 4px; }
  .form-group label { font-size: 12px; font-weight: 600; color: var(--text-secondary); }
  .form-row { display: flex; align-items: center; justify-content: space-between; }
  .form-row label { font-size: 12px; font-weight: 600; color: var(--text-secondary); }
  .input { width: 100%; padding: 8px 12px; border: 1px solid var(--border); border-radius: var(--radius-sm); font-size: 13px; font-family: inherit; color: var(--text); outline: none; }
  .input:focus { border-color: var(--accent); }
  .textarea { width: 100%; padding: 8px 12px; border: 1px solid var(--border); border-radius: var(--radius-sm); font-size: 13px; font-family: inherit; color: var(--text); resize: vertical; outline: none; }
</style>

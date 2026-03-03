<script>
  import { onMount } from "svelte";
  import { api } from "../../lib/api.js";
  import { showToast } from "../../lib/toast.svelte.js";
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
      showToast("Failed to load chat flow: " + e.message, "error");
    } finally {
      loading = false;
    }
  });

  async function save() {
    try {
      await api.put("admin/chat-flow", { config });
      showToast("Saved", "success");
    } catch (e) {
      showToast("Error: " + e.message, "error");
    }
  }
</script>

<div class="page-header">
  <div>
    <h1>Chat Flow</h1>
    <p>Greeting, timing, detection, closing settings</p>
  </div>
  <Button onclick={save} variant="primary" size="sm">Save</Button>
</div>

{#if loading}
  <LoadingSpinner message="Loading..." />
{:else}
  <div class="flow-sections">
    <div class="card">
      <h2>Greeting</h2>
      <div class="form-grid">
        <div class="form-row">
          <label>Greeting Enabled
            <Toggle bind:checked={config.greetingEnabled} />
          </label>
        </div>
        <div class="form-group">
          <label>Greeting Message
            <textarea class="textarea" bind:value={config.greetingMessage} rows="3"></textarea>
          </label>
        </div>
        <div class="form-group">
          <label>Greeting Delay (ms)
            <input class="input" type="number" bind:value={config.greetingDelay} />
          </label>
        </div>
      </div>
    </div>

    <div class="card">
      <h2>Timing</h2>
      <div class="form-grid">
        <div class="form-group">
          <label>Off-Hours Message
            <textarea class="textarea" bind:value={config.offHoursMessage} rows="2"></textarea>
          </label>
        </div>
        <div class="form-group">
          <label>Auto Close (min)
            <input class="input" type="number" bind:value={config.autoCloseMinutes} />
          </label>
        </div>
        <div class="form-group">
          <label>Inactivity Warning (min)
            <input class="input" type="number" bind:value={config.inactivityWarningMinutes} />
          </label>
        </div>
        <div class="form-group">
          <label>Message Aggregation Window (ms)
            <input class="input" type="number" bind:value={config.messageAggregationWindowMs} />
          </label>
        </div>
        <div class="form-group">
          <label>Bot Response Delay (ms)
            <input class="input" type="number" bind:value={config.botResponseDelayMs} />
          </label>
        </div>
        <div class="form-row">
          <label>Typing Indicator
            <Toggle bind:checked={config.typingIndicatorEnabled} />
          </label>
        </div>
      </div>
    </div>

    <div class="card">
      <h2>Detection</h2>
      <div class="form-grid">
        <div class="form-row">
          <label>Topic Detection Enabled
            <Toggle bind:checked={config.topicDetectionEnabled} />
          </label>
        </div>
        <div class="form-row">
          <label>Sentiment Analysis
            <Toggle bind:checked={config.sentimentEnabled} />
          </label>
        </div>
        <div class="form-group">
          <label>Max Clarifications
            <input class="input" type="number" bind:value={config.maxClarifications} />
          </label>
        </div>
        <div class="form-row">
          <label>Gibberish Detection
            <Toggle bind:checked={config.gibberishDetectionEnabled} />
          </label>
        </div>
        <div class="form-group">
          <label>Gibberish Message
            <textarea class="textarea" bind:value={config.gibberishMessage} rows="2"></textarea>
          </label>
        </div>
      </div>
    </div>

    <div class="card">
      <h2>Closing</h2>
      <div class="form-grid">
        <div class="form-row">
          <label>Closing Flow Enabled
            <Toggle bind:checked={config.closingFlowEnabled} />
          </label>
        </div>
        <div class="form-group">
          <label>Closing Message
            <textarea class="textarea" bind:value={config.closingMessage} rows="2"></textarea>
          </label>
        </div>
        <div class="form-group">
          <label>Anything Else? Message
            <textarea class="textarea" bind:value={config.anythingElseMessage} rows="2"></textarea>
          </label>
        </div>
        <div class="form-group">
          <label>Farewell Message
            <textarea class="textarea" bind:value={config.farewellMessage} rows="2"></textarea>
          </label>
        </div>
        <div class="form-row">
          <label>CSAT Survey
            <Toggle bind:checked={config.csatEnabled} />
          </label>
        </div>
        <div class="form-group">
          <label>CSAT Message
            <textarea class="textarea" bind:value={config.csatMessage} rows="2"></textarea>
          </label>
        </div>
      </div>
    </div>

    <div class="card">
      <h2>Nudge</h2>
      <div class="form-grid">
        <div class="form-row">
          <label>Nudge Enabled
            <Toggle bind:checked={config.nudgeEnabled} />
          </label>
        </div>
        <div class="form-group">
          <label>75% Nudge Message
            <textarea class="textarea" bind:value={config.nudgeAt75Message} rows="2"></textarea>
          </label>
        </div>
        <div class="form-group">
          <label>90% Nudge Message
            <textarea class="textarea" bind:value={config.nudgeAt90Message} rows="2"></textarea>
          </label>
        </div>
        <div class="form-group">
          <label>Inactivity Close Message
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

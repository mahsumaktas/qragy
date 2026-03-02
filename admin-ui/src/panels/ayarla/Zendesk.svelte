<script>
  import { onMount } from "svelte";
  import { api } from "../../lib/api.js";
  import { showToast } from "../../lib/toast.svelte.js";
  import Button from "../../components/ui/Button.svelte";
  import Toggle from "../../components/ui/Toggle.svelte";
  import LoadingSpinner from "../../components/ui/LoadingSpinner.svelte";

  let loading = $state(true);
  let config = $state({});
  let testing = $state(false);
  let testPassed = $state(false);
  let settingUp = $state(false);

  onMount(async () => {
    try {
      const res = await api.get("admin/sunshine-config");
      config = res.config || res || {};
    } catch (e) {
      showToast("Failed to load Zendesk config: " + e.message, "error");
    } finally {
      loading = false;
    }
  });

  async function save() {
    try {
      await api.put("admin/sunshine-config", { config });
      showToast("Saved", "success");
    } catch (e) {
      showToast("Error: " + e.message, "error");
    }
  }

  async function test() {
    testing = true;
    testPassed = false;
    try {
      const res = await api.post("admin/sunshine-config/test", {});
      if (res.ok) {
        testPassed = true;
        showToast(res.message || "Connection successful", "success");
      } else {
        showToast(res.error || "Test failed", "error");
      }
    } catch (e) {
      showToast("Test failed: " + e.message, "error");
    } finally {
      testing = false;
    }
  }

  async function setupSwitchboard() {
    settingUp = true;
    try {
      const res = await api.post("admin/sunshine-config/setup-switchboard", {});
      if (res.ok) {
        showToast(res.message, "success");
      } else {
        showToast(res.error || "Switchboard setup failed", "error");
      }
    } catch (e) {
      showToast("Switchboard error: " + e.message, "error");
    } finally {
      settingUp = false;
    }
  }
</script>

<div class="page-header">
  <div><h1>Zendesk Sunshine Conversations</h1><p>Handle messages from the Zendesk chat widget with Qragy. On escalation, conversations are automatically handed off to a live agent.</p></div>
  <div class="actions">
    <Button onclick={test} variant="secondary" size="sm" disabled={testing}>{testing ? "Testing..." : "Test Connection"}</Button>
    <Button onclick={save} variant="primary" size="sm">Save</Button>
  </div>
</div>

{#if loading}
  <LoadingSpinner message="Loading..." />
{:else}
  <div class="card">
    <div class="card-title">Connection Settings</div>
    <div class="form-grid">
      <div class="form-group"><span class="lbl">Subdomain</span><input class="input" bind:value={config.subdomain} oninput={() => testPassed = false} placeholder="yourcompany (.zendesk.com)" /></div>
      <div class="form-group"><span class="lbl">App ID</span><input class="input" bind:value={config.appId} oninput={() => testPassed = false} placeholder="Sunshine Conversations App ID" /></div>
      <div class="form-group"><span class="lbl">Key ID</span><input class="input" bind:value={config.keyId} oninput={() => testPassed = false} placeholder="API Key ID" /></div>
      <div class="form-group"><span class="lbl">Key Secret</span><input class="input" type="password" bind:value={config.keySecret} oninput={() => testPassed = false} placeholder="API Key Secret" /></div>
      <div class="form-group"><span class="lbl">Webhook Secret (X-API-Key)</span><input class="input" type="password" bind:value={config.webhookSecret} placeholder="Webhook verification secret" /></div>
      <div class="form-group"><span class="lbl">Greeting Message</span><input class="input" bind:value={config.greetingMessage} placeholder="Hello, I'm the Technical Support Assistant. How can I help you?" /><span class="hint">Should match the greeting message in the Zendesk widget</span></div>
      <div class="form-group"><span class="lbl">Escalation Farewell Message</span><input class="input" bind:value={config.farewellMessage} placeholder="I'm connecting you with a live support agent. Have a great day!" /></div>
      <div class="form-row"><span class="lbl">Integration Active</span><Toggle bind:checked={config.enabled} /></div>
    </div>
  </div>

  <div class="card">
    <div class="card-title">Webhook URL</div>
    <p class="desc">Add the following URL as a webhook in your Zendesk Sunshine Conversations settings. Trigger: <strong>conversation:message</strong></p>
    <input class="input webhook-url" value={config.webhookUrl || ""} readonly onclick={(e) => { e.target.select(); navigator.clipboard?.writeText(e.target.value); showToast("Copied", "success"); }} />
  </div>

  <div class="card switchboard-card">
    <div class="card-title">Switchboard Setup</div>
    <p class="desc">After a successful connection test, this automatically configures the Switchboard chain: answerBot → Qragy Bot → agentWorkspace</p>
    <Button onclick={setupSwitchboard} variant="secondary" size="sm" disabled={!testPassed || settingUp}>
      {settingUp ? "Setting up..." : "Setup Switchboard"}
    </Button>
    {#if !testPassed}
      <span class="hint">Pass the connection test first</span>
    {/if}
  </div>
{/if}

<style>
  .page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
  .page-header h1 { font-size: 22px; font-weight: 700; }
  .page-header p { font-size: 13px; color: var(--text-muted); margin-top: 2px; }
  .actions { display: flex; gap: 8px; }
  .card { background: var(--bg-card); border-radius: var(--radius); padding: 20px; box-shadow: var(--shadow); border: 1px solid var(--border-light); }
  .form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .form-group { display: flex; flex-direction: column; gap: 4px; }
  .form-row { display: flex; align-items: center; justify-content: space-between; }
  .lbl { font-size: 12px; font-weight: 600; color: var(--text-secondary); }
  .input { width: 100%; padding: 8px 12px; border: 1px solid var(--border); border-radius: var(--radius-sm); font-size: 13px; font-family: inherit; color: var(--text); outline: none; }
  .input::placeholder { color: var(--text-muted); opacity: 0.6; }
  .webhook-url { background: var(--bg-hover); cursor: pointer; font-family: "JetBrains Mono", monospace; font-size: 12px; }
  .hint { font-size: 11px; color: var(--text-muted); }
  .card + .card { margin-top: 12px; }
  .card-title { font-size: 14px; font-weight: 600; margin: 0 0 12px 0; }
  .switchboard-card { display: flex; flex-direction: column; gap: 8px; align-items: flex-start; }
  .desc { font-size: 12px; color: var(--text-secondary); margin: 0; }
</style>

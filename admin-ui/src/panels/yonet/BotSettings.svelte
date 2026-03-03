<script>
  import { onMount } from "svelte";
  import { api } from "../../lib/api.js";
  import { showToast } from "../../lib/toast.svelte.js";
  import { t } from "../../lib/i18n.svelte.js";
  import ExpandCard from "../../components/ui/ExpandCard.svelte";
  import Button from "../../components/ui/Button.svelte";
  import Toggle from "../../components/ui/Toggle.svelte";
  import LoadingSpinner from "../../components/ui/LoadingSpinner.svelte";

  let loading = $state(true);
  let soulMd = $state("");
  let personaMd = $state("");
  let domainMd = $state("");
  let skillsMd = $state("");
  let hardBansMd = $state("");
  let escalationMd = $state("");
  let chatFlow = $state({});
  let siteConfig = $state({});

  onMount(async () => {
    try {
      const [soul, persona, domain, skills, hardBans, escalation, flow, site] = await Promise.all([
        api.get("admin/agent/files/soul.md").catch(() => ({ content: "" })),
        api.get("admin/agent/files/persona.md").catch(() => ({ content: "" })),
        api.get("admin/agent/files/domain.md").catch(() => ({ content: "" })),
        api.get("admin/agent/files/skills.md").catch(() => ({ content: "" })),
        api.get("admin/agent/files/hard-bans.md").catch(() => ({ content: "" })),
        api.get("admin/agent/files/escalation-matrix.md").catch(() => ({ content: "" })),
        api.get("admin/chat-flow").catch(() => ({})),
        api.get("admin/site-config").catch(() => ({})),
      ]);
      soulMd = soul.content || "";
      personaMd = persona.content || "";
      domainMd = domain.content || "";
      skillsMd = skills.content || "";
      hardBansMd = hardBans.content || "";
      escalationMd = escalation.content || "";
      chatFlow = flow.config || flow || {};
      siteConfig = site.config || site || {};
    } catch (e) {
      showToast(t("botSettings.loadError", { msg: e.message }), "error");
    } finally {
      loading = false;
    }
  });

  async function saveFile(filename, content) {
    try {
      await api.put("admin/agent/files/" + filename, { content });
      showToast(t("common.saved", { name: filename }), "success");
    } catch (e) {
      showToast(t("common.error", { msg: e.message }), "error");
    }
  }

  async function saveChatFlow() {
    try {
      await api.put("admin/chat-flow", { config: chatFlow });
      showToast(t("botSettings.chatFlowSaved"), "success");
    } catch (e) {
      showToast(t("common.error", { msg: e.message }), "error");
    }
  }

  async function reloadAgent() {
    try {
      await api.post("admin/agent/reload", {});
      showToast(t("botSettings.agentReloaded"), "success");
    } catch (e) {
      showToast(t("common.error", { msg: e.message }), "error");
    }
  }
</script>

<div class="page-header">
  <div>
    <h1>{t("botSettings.title")}</h1>
    <p>{t("botSettings.subtitle")}</p>
  </div>
  <Button onclick={reloadAgent} variant="secondary" size="sm">{t("botSettings.reloadAgent")}</Button>
</div>

{#if loading}
  <LoadingSpinner message={t("common.loading")} />
{:else}
  <ExpandCard title={t("botSettings.identity")}>
    <textarea class="mono-editor" rows="12" bind:value={soulMd}></textarea>
    <div class="card-actions"><Button onclick={() => saveFile("soul.md", soulMd)} variant="primary" size="sm">{t("common.save")}</Button></div>
  </ExpandCard>

  <ExpandCard title={t("botSettings.persona")}>
    <textarea class="mono-editor" rows="12" bind:value={personaMd}></textarea>
    <div class="card-actions"><Button onclick={() => saveFile("persona.md", personaMd)} variant="primary" size="sm">{t("common.save")}</Button></div>
  </ExpandCard>

  <ExpandCard title={t("botSettings.domain")}>
    <textarea class="mono-editor" rows="10" bind:value={domainMd}></textarea>
    <div class="card-actions"><Button onclick={() => saveFile("domain.md", domainMd)} variant="primary" size="sm">{t("common.save")}</Button></div>
  </ExpandCard>

  <ExpandCard title={t("botSettings.skills")}>
    <textarea class="mono-editor" rows="10" bind:value={skillsMd}></textarea>
    <div class="card-actions"><Button onclick={() => saveFile("skills.md", skillsMd)} variant="primary" size="sm">{t("common.save")}</Button></div>
  </ExpandCard>

  <ExpandCard title={t("botSettings.hardBans")}>
    <textarea class="mono-editor" rows="8" bind:value={hardBansMd}></textarea>
    <div class="card-actions"><Button onclick={() => saveFile("hard-bans.md", hardBansMd)} variant="primary" size="sm">{t("common.save")}</Button></div>
  </ExpandCard>

  <ExpandCard title={t("botSettings.escalationMatrix")}>
    <textarea class="mono-editor" rows="10" bind:value={escalationMd}></textarea>
    <div class="card-actions"><Button onclick={() => saveFile("escalation-matrix.md", escalationMd)} variant="primary" size="sm">{t("common.save")}</Button></div>
  </ExpandCard>

  <ExpandCard title={t("botSettings.chatFlow")}>
    <div class="flow-grid">
      <div class="form-group">
        <label>{t("botSettings.greetingMessage")}
          <input class="input" bind:value={chatFlow.greetingMessage} />
        </label>
      </div>
      <div class="form-group">
        <label>{t("botSettings.offHoursMessage")}
          <input class="input" bind:value={chatFlow.offHoursMessage} />
        </label>
      </div>
      <div class="form-group">
        <label>{t("botSettings.autoClose")}
          <input class="input" type="number" bind:value={chatFlow.autoCloseMinutes} />
        </label>
      </div>
      <div class="form-row">
        <label>{t("botSettings.greetingEnabled")}
          <Toggle bind:checked={chatFlow.greetingEnabled} />
        </label>
      </div>
    </div>
    <div class="card-actions"><Button onclick={saveChatFlow} variant="primary" size="sm">{t("common.save")}</Button></div>
  </ExpandCard>

  <ExpandCard title={t("botSettings.generalSettings")}>
    <div class="flow-grid">
      <div class="form-group">
        <label>{t("botSettings.botName")}
          <input class="input" bind:value={siteConfig.botName} />
        </label>
      </div>
      <div class="form-group">
        <label>{t("botSettings.companyName")}
          <input class="input" bind:value={siteConfig.companyName} />
        </label>
      </div>
    </div>
  </ExpandCard>
{/if}

<style>
  .page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
  .page-header h1 { font-size: 22px; font-weight: 700; }
  .page-header p { font-size: 13px; color: var(--text-muted); margin-top: 2px; }

  .mono-editor {
    width: 100%; padding: 12px 16px; border: 1px solid var(--border); border-radius: var(--radius-sm);
    font-family: "JetBrains Mono", monospace; font-size: 12px; line-height: 1.6; color: var(--text);
    background: var(--bg); resize: vertical; outline: none; tab-size: 2;
  }
  .mono-editor:focus { border-color: var(--accent); }

  .card-actions { display: flex; justify-content: flex-end; margin-top: 12px; }

  .flow-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .form-group { display: flex; flex-direction: column; gap: 4px; }
  .form-group label { font-size: 12px; font-weight: 600; color: var(--text-secondary); }
  .form-row { display: flex; align-items: center; gap: 10px; }
  .form-row label { font-size: 12px; font-weight: 600; color: var(--text-secondary); }
  .input { width: 100%; padding: 8px 12px; border: 1px solid var(--border); border-radius: var(--radius-sm); font-size: 13px; font-family: inherit; color: var(--text); outline: none; }
  .input:focus { border-color: var(--accent); }
</style>

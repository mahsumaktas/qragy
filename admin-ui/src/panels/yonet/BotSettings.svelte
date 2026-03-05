<script>
  import { onMount } from "svelte";
  import { api } from "../../lib/api.js";
  import { showToast } from "../../lib/toast.svelte.js";
  import { t } from "../../lib/i18n.svelte.js";
  import { getBotSettingsQualityReport } from "../../lib/agentConfigQuality.js";
  import ExpandCard from "../../components/ui/ExpandCard.svelte";
  import Button from "../../components/ui/Button.svelte";
  import Toggle from "../../components/ui/Toggle.svelte";
  import Badge from "../../components/ui/Badge.svelte";
  import LoadingSpinner from "../../components/ui/LoadingSpinner.svelte";

  const FILE_GROUPS = [
    {
      id: "identity",
      titleKey: "botSettings.groupIdentity",
      descriptionKey: "botSettings.groupIdentityDesc",
      items: [
        { kind: "text", filename: "soul.md", titleKey: "botSettings.identity", summaryKey: "botSettings.summarySoul", rows: 14 },
        { kind: "text", filename: "persona.md", titleKey: "botSettings.persona", summaryKey: "botSettings.summaryPersona", rows: 14 },
        { kind: "text", filename: "domain.md", titleKey: "botSettings.domain", summaryKey: "botSettings.summaryDomain", rows: 12 },
      ],
    },
    {
      id: "execution",
      titleKey: "botSettings.groupExecution",
      descriptionKey: "botSettings.groupExecutionDesc",
      items: [
        { kind: "text", filename: "bootstrap.md", titleKey: "botSettings.bootstrap", summaryKey: "botSettings.summaryBootstrap", rows: 14 },
        { kind: "text", filename: "response-policy.md", titleKey: "botSettings.responsePolicy", summaryKey: "botSettings.summaryResponsePolicy", rows: 18 },
        { kind: "text", filename: "definition-of-done.md", titleKey: "botSettings.definitionOfDone", summaryKey: "botSettings.summaryDefinitionOfDone", rows: 12 },
      ],
    },
    {
      id: "guardrails",
      titleKey: "botSettings.groupGuardrails",
      descriptionKey: "botSettings.groupGuardrailsDesc",
      items: [
        { kind: "text", filename: "skills.md", titleKey: "botSettings.skills", summaryKey: "botSettings.summarySkills", rows: 12 },
        { kind: "text", filename: "hard-bans.md", titleKey: "botSettings.hardBans", summaryKey: "botSettings.summaryHardBans", rows: 12 },
        { kind: "text", filename: "escalation-matrix.md", titleKey: "botSettings.escalationMatrix", summaryKey: "botSettings.summaryEscalationMatrix", rows: 14 },
        { kind: "text", filename: "output-filter.md", titleKey: "botSettings.outputFilter", summaryKey: "botSettings.summaryOutputFilter", rows: 12 },
      ],
    },
    {
      id: "memory",
      titleKey: "botSettings.groupMemory",
      descriptionKey: "botSettings.groupMemoryDesc",
      items: [
        { kind: "memory", filename: "ticket-template.json", titleKey: "botSettings.ticketTemplate", summaryKey: "botSettings.summaryTicketTemplate", rows: 14 },
        { kind: "memory", filename: "conversation-schema.json", titleKey: "botSettings.conversationSchema", summaryKey: "botSettings.summaryConversationSchema", rows: 18 },
      ],
    },
  ];

  let loading = $state(true);
  let search = $state("");
  let files = $state({});
  let memoryFiles = $state({});
  let chatFlow = $state({});
  let siteConfig = $state({});

  const parsedMemoryFiles = $derived(Object.fromEntries(
    FILE_GROUPS
      .flatMap((group) => group.items)
      .filter((item) => item.kind === "memory")
      .map((item) => {
        try {
          return [item.filename, JSON.parse(memoryFiles[item.filename] || "{}")];
        } catch (_error) {
          return [item.filename, {}];
        }
      })
  ));

  const jsonValidity = $derived(Object.fromEntries(
    Object.keys(parsedMemoryFiles).map((filename) => {
      try {
        JSON.parse(memoryFiles[filename] || "{}");
        return [filename, true];
      } catch (_error) {
        return [filename, false];
      }
    })
  ));

  const qualityReport = $derived(getBotSettingsQualityReport(files, parsedMemoryFiles));
  const visibleGroups = $derived(getVisibleGroups());
  const visibleFileCount = $derived(
    visibleGroups.reduce((total, group) => total + group.items.length, 0)
  );
  const totalFileCount = FILE_GROUPS.reduce((total, group) => total + group.items.length, 0);

  onMount(() => {
    loadAll();
  });

  function normalizeText(value) {
    return (value || "").toLowerCase().trim();
  }

  function getVisibleGroups() {
    const query = normalizeText(search);
    if (!query) return FILE_GROUPS;

    return FILE_GROUPS
      .map((group) => ({
        ...group,
        items: group.items.filter((item) => {
          const haystack = [
            t(item.titleKey),
            item.filename,
            t(item.summaryKey),
            t(group.titleKey),
          ].join(" ").toLowerCase();
          return haystack.includes(query);
        }),
      }))
      .filter((group) => group.items.length > 0);
  }

  async function loadAll() {
    loading = true;
    try {
      const textFiles = FILE_GROUPS.flatMap((group) => group.items).filter((item) => item.kind === "text");
      const requests = textFiles.map((item) =>
        api.get("admin/agent/files/" + item.filename).catch(() => ({ content: "" }))
      );

      const [fileResponses, memoryResponse, flowResponse, siteResponse] = await Promise.all([
        Promise.all(requests),
        api.get("admin/agent/memory").catch(() => ({ files: {} })),
        api.get("admin/chat-flow").catch(() => ({})),
        api.get("admin/site-config").catch(() => ({})),
      ]);

      files = Object.fromEntries(
        textFiles.map((item, index) => [item.filename, fileResponses[index]?.content || ""])
      );

      const memoryPayload = memoryResponse.files || {};
      memoryFiles = {
        "ticket-template.json": JSON.stringify(memoryPayload["ticket-template.json"] || {}, null, 2),
        "conversation-schema.json": JSON.stringify(memoryPayload["conversation-schema.json"] || {}, null, 2),
      };

      chatFlow = flowResponse.config || flowResponse || {};
      siteConfig = siteResponse.config || siteResponse || {};
    } catch (e) {
      showToast(t("botSettings.loadError", { msg: e.message }), "error");
    } finally {
      loading = false;
    }
  }

  function getWarnings(filename) {
    return qualityReport.warningsByFile[filename] || [];
  }

  async function saveFile(filename) {
    try {
      await api.put("admin/agent/files/" + filename, { content: files[filename] || "" });
      showToast(t("common.saved", { name: filename }), "success");
    } catch (e) {
      showToast(t("common.error", { msg: e.message }), "error");
    }
  }

  async function saveMemory(filename) {
    try {
      JSON.parse(memoryFiles[filename] || "{}");
    } catch (_error) {
      showToast(t("memoryTemplates.jsonInvalid"), "error");
      return;
    }

    try {
      await api.put("admin/agent/memory/" + filename, { content: memoryFiles[filename] });
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

  async function saveSiteConfig() {
    try {
      await api.put("admin/site-config", { config: siteConfig });
      showToast(t("botSettings.siteConfigSaved"), "success");
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
  <div class="header-actions">
    <Button onclick={loadAll} variant="ghost" size="sm">{t("common.refresh")}</Button>
    <Button onclick={reloadAgent} variant="secondary" size="sm">{t("botSettings.reloadAgent")}</Button>
  </div>
</div>

{#if loading}
  <LoadingSpinner message={t("common.loading")} />
{:else}
  <div class="summary-grid">
    <div class="stat-card">
      <span class="stat-label">{t("botSettings.filesLoaded")}</span>
      <strong>{totalFileCount}</strong>
      <p>{t("botSettings.filesLoadedHelp")}</p>
    </div>
    <div class="stat-card">
      <span class="stat-label">{t("botSettings.visibleFiles")}</span>
      <strong>{visibleFileCount}</strong>
      <p>{t("botSettings.visibleFilesHelp")}</p>
    </div>
    <div class="stat-card">
      <span class="stat-label">{t("botSettings.qualityWarnings")}</span>
      <strong>{qualityReport.warningCount}</strong>
      <p>{t("botSettings.qualityWarningsHelp")}</p>
    </div>
  </div>

  <div class="guide-card">
    <div class="guide-copy">
      <h2>{t("botSettings.guideTitle")}</h2>
      <p>{t("botSettings.guideIntro")}</p>
    </div>
    <div class="guide-list">
      <div class="guide-item">
        <strong>{t("botSettings.guideIdentityTitle")}</strong>
        <span>{t("botSettings.guideIdentityText")}</span>
      </div>
      <div class="guide-item">
        <strong>{t("botSettings.guideExecutionTitle")}</strong>
        <span>{t("botSettings.guideExecutionText")}</span>
      </div>
      <div class="guide-item">
        <strong>{t("botSettings.guideGuardrailTitle")}</strong>
        <span>{t("botSettings.guideGuardrailText")}</span>
      </div>
      <div class="guide-item">
        <strong>{t("botSettings.guideMemoryTitle")}</strong>
        <span>{t("botSettings.guideMemoryText")}</span>
      </div>
    </div>
  </div>

  <div class="search-row">
    <input class="input" bind:value={search} placeholder={t("botSettings.searchPlaceholder")} />
  </div>

  {#each visibleGroups as group}
    <section class="group-section">
      <div class="group-head">
        <div>
          <h2>{t(group.titleKey)}</h2>
          <p>{t(group.descriptionKey)}</p>
        </div>
        <Badge variant="gray">{group.items.length}</Badge>
      </div>

      {#each group.items as item}
        <ExpandCard title={t(item.titleKey) + " · " + item.filename}>
          <div class="file-summary">
            <p>{t(item.summaryKey)}</p>
            <div class="meta-badges">
              <Badge variant="gray">{item.filename}</Badge>
              {#if item.kind === "memory"}
                <Badge variant={jsonValidity[item.filename] ? "green" : "red"}>
                  {jsonValidity[item.filename] ? t("memoryTemplates.jsonValid") : t("memoryTemplates.jsonInvalid")}
                </Badge>
              {/if}
              {#if getWarnings(item.filename).length}
                <Badge variant="yellow">{t("botSettings.warningBadge", { n: getWarnings(item.filename).length })}</Badge>
              {/if}
            </div>
          </div>

          {#if getWarnings(item.filename).length}
            <div class="warning-list">
              {#each getWarnings(item.filename) as warning}
                <div class="warning-item">
                  <strong>{t("botSettings.warningTitle")}</strong>
                  <span>{t(warning.key, warning.params)}</span>
                </div>
              {/each}
            </div>
          {/if}

          {#if item.kind === "text"}
            <textarea class="mono-editor" rows={item.rows} bind:value={files[item.filename]}></textarea>
            <div class="card-actions">
              <Button onclick={() => saveFile(item.filename)} variant="primary" size="sm">{t("common.save")}</Button>
            </div>
          {:else}
            <textarea class="mono-editor" rows={item.rows} bind:value={memoryFiles[item.filename]}></textarea>
            <div class="card-actions">
              <Button onclick={() => saveMemory(item.filename)} variant="primary" size="sm">{t("common.save")}</Button>
            </div>
          {/if}
        </ExpandCard>
      {/each}
    </section>
  {:else}
    <div class="empty-state">{t("common.noData")}</div>
  {/each}

  <section class="group-section">
    <div class="group-head">
      <div>
        <h2>{t("botSettings.chatFlow")}</h2>
        <p>{t("botSettings.chatFlowSummary")}</p>
      </div>
    </div>
    <div class="config-card">
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
      <div class="card-actions">
        <Button onclick={saveChatFlow} variant="primary" size="sm">{t("common.save")}</Button>
      </div>
    </div>
  </section>

  <section class="group-section">
    <div class="group-head">
      <div>
        <h2>{t("botSettings.generalSettings")}</h2>
        <p>{t("botSettings.generalSettingsSummary")}</p>
      </div>
    </div>
    <div class="config-card">
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
      <div class="card-actions">
        <Button onclick={saveSiteConfig} variant="primary" size="sm">{t("common.save")}</Button>
      </div>
    </div>
  </section>
{/if}

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
  }

  .summary-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 12px;
    margin-bottom: 16px;
  }

  .stat-card,
  .guide-card,
  .config-card,
  .empty-state {
    border: 1px solid var(--border-light);
    border-radius: var(--radius);
    background: var(--bg-card);
    box-shadow: var(--shadow-sm);
  }

  .stat-card {
    padding: 16px;
  }

  .stat-card strong {
    display: block;
    font-size: 26px;
    line-height: 1;
    margin: 6px 0 8px;
  }

  .stat-label {
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--text-muted);
  }

  .stat-card p {
    font-size: 12px;
    color: var(--text-secondary);
  }

  .guide-card {
    padding: 18px;
    display: grid;
    grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr);
    gap: 18px;
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
    gap: 10px;
  }

  .guide-item {
    padding: 12px 14px;
    border-radius: 14px;
    background: linear-gradient(180deg, rgba(15, 108, 189, 0.08), rgba(15, 108, 189, 0.02));
    border: 1px solid rgba(15, 108, 189, 0.12);
  }

  .guide-item strong {
    display: block;
    font-size: 12px;
    font-weight: 700;
    margin-bottom: 4px;
  }

  .guide-item span {
    display: block;
    font-size: 12px;
    color: var(--text-secondary);
    line-height: 1.5;
  }

  .search-row {
    margin-bottom: 16px;
  }

  .group-section {
    margin-bottom: 20px;
  }

  .group-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 10px;
  }

  .group-head h2 {
    font-size: 16px;
    font-weight: 700;
  }

  .group-head p {
    font-size: 12px;
    color: var(--text-muted);
    margin-top: 4px;
  }

  .file-summary {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 12px;
  }

  .file-summary p {
    font-size: 12px;
    color: var(--text-secondary);
    line-height: 1.6;
  }

  .meta-badges {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
    justify-content: flex-end;
  }

  .warning-list {
    display: grid;
    gap: 8px;
    margin-bottom: 12px;
  }

  .warning-item {
    padding: 10px 12px;
    border-radius: 12px;
    background: var(--warning-bg);
    border: 1px solid rgba(217, 119, 6, 0.2);
  }

  .warning-item strong {
    display: block;
    font-size: 11px;
    font-weight: 700;
    color: var(--warning);
    margin-bottom: 3px;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  .warning-item span {
    font-size: 12px;
    color: var(--text-secondary);
    line-height: 1.5;
  }

  .mono-editor {
    width: 100%;
    padding: 12px 16px;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    font-family: "JetBrains Mono", monospace;
    font-size: 12px;
    line-height: 1.6;
    color: var(--text);
    background: var(--bg);
    resize: vertical;
    outline: none;
    tab-size: 2;
  }

  .mono-editor:focus {
    border-color: var(--accent);
  }

  .card-actions {
    display: flex;
    justify-content: flex-end;
    margin-top: 12px;
  }

  .flow-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
  }

  .form-group {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .form-group label,
  .form-row label {
    font-size: 12px;
    font-weight: 600;
    color: var(--text-secondary);
  }

  .form-row {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .input {
    width: 100%;
    padding: 8px 12px;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    font-size: 13px;
    font-family: inherit;
    color: var(--text);
    outline: none;
    background: var(--bg-card);
  }

  .input:focus {
    border-color: var(--accent);
    box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
  }

  .config-card {
    padding: 16px;
  }

  .empty-state {
    padding: 24px;
    text-align: center;
    color: var(--text-muted);
  }

  @media (max-width: 980px) {
    .summary-grid,
    .guide-card,
    .flow-grid {
      grid-template-columns: 1fr;
    }

    .file-summary {
      flex-direction: column;
    }

    .meta-badges {
      justify-content: flex-start;
    }
  }
</style>

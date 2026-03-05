<script>
  import { onMount } from "svelte";
  import { api } from "../../lib/api.js";
  import { showToast } from "../../lib/toast.svelte.js";
  import { t } from "../../lib/i18n.svelte.js";
  import Button from "../../components/ui/Button.svelte";
  import ColorPicker from "../../components/ui/ColorPicker.svelte";
  import LoadingSpinner from "../../components/ui/LoadingSpinner.svelte";

  const SITE_CONFIG_DEFAULTS = {
    pageTitle: "Technical Support",
    heroTitle: "Technical Support",
    heroDescription: "Let our AI assistant help with your support requests.",
    heroButtonText: "Live Support",
    heroHint: "When the AI gathers the necessary info, you'll be automatically connected to an agent.",
    headerTitle: "Technical Support",
    logoUrl: "",
    themeColor: "#2563EB",
    primaryColor: "#2563EB",
    headerBg: "#2563EB",
    chatBubbleColor: "#2563EB",
    inputPlaceholder: "Type your message...",
    sendButtonText: "Send",
  };

  let loading = $state(true);
  let config = $state({ ...SITE_CONFIG_DEFAULTS });
  let defaults = $state({ ...SITE_CONFIG_DEFAULTS });
  let logoFile = $state(null);

  function normalizeColor(value, fallback = "#2563EB") {
    return typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value.trim())
      ? value.trim()
      : fallback;
  }

  function normalizeConfig(raw = {}, fallbackDefaults = SITE_CONFIG_DEFAULTS) {
    return {
      ...fallbackDefaults,
      ...raw,
      pageTitle: String(raw.pageTitle ?? fallbackDefaults.pageTitle ?? ""),
      heroTitle: String(raw.heroTitle ?? fallbackDefaults.heroTitle ?? ""),
      heroDescription: String(raw.heroDescription ?? fallbackDefaults.heroDescription ?? ""),
      heroButtonText: String(raw.heroButtonText ?? fallbackDefaults.heroButtonText ?? ""),
      heroHint: String(raw.heroHint ?? fallbackDefaults.heroHint ?? ""),
      headerTitle: String(raw.headerTitle ?? fallbackDefaults.headerTitle ?? ""),
      logoUrl: String(raw.logoUrl ?? fallbackDefaults.logoUrl ?? ""),
      inputPlaceholder: String(raw.inputPlaceholder ?? fallbackDefaults.inputPlaceholder ?? ""),
      sendButtonText: String(raw.sendButtonText ?? fallbackDefaults.sendButtonText ?? ""),
      themeColor: normalizeColor(raw.themeColor, normalizeColor(fallbackDefaults.themeColor)),
      primaryColor: normalizeColor(raw.primaryColor, normalizeColor(raw.themeColor, normalizeColor(fallbackDefaults.primaryColor))),
      headerBg: normalizeColor(raw.headerBg, normalizeColor(raw.themeColor, normalizeColor(fallbackDefaults.headerBg))),
      chatBubbleColor: normalizeColor(raw.chatBubbleColor, normalizeColor(raw.themeColor, normalizeColor(fallbackDefaults.chatBubbleColor))),
    };
  }

  function getLogoPreviewUrl(logoUrl) {
    if (!logoUrl) return "";
    if (/^(https?:)?\/\//.test(logoUrl) || logoUrl.startsWith("data:") || logoUrl.startsWith("/")) {
      return logoUrl;
    }
    return "../" + logoUrl.replace(/^\.?\//, "");
  }

  onMount(async () => {
    try {
      const res = await api.get("admin/site-config");
      defaults = normalizeConfig(res.defaults || {});
      config = normalizeConfig(res.config || {}, defaults);
    } catch (e) {
      showToast(t("siteSettings.loadError", { msg: e.message }), "error");
    } finally {
      loading = false;
    }
  });

  async function save() {
    try {
      await api.put("admin/site-config", { config });
      showToast(t("siteSettings.saved"), "success");
    } catch (e) {
      showToast(t("common.error", { msg: e.message }), "error");
    }
  }

  function resetToDefaults() {
    config = { ...defaults };
    showToast(t("siteSettings.defaultsLoaded"), "success");
  }

  async function uploadLogo() {
    if (!logoFile) return;
    try {
      const result = await api.upload("admin/site-logo", logoFile);
      config = { ...config, logoUrl: result.logoUrl || config.logoUrl };
      logoFile = null;
      showToast(t("siteSettings.logoUploaded"), "success");
    } catch (e) {
      showToast(t("common.error", { msg: e.message }), "error");
    }
  }
</script>

<div class="page-header">
  <div>
    <h1>{t("siteSettings.title")}</h1>
    <p>{t("siteSettings.subtitle")}</p>
  </div>
  <div class="header-actions">
    <Button onclick={resetToDefaults} variant="ghost" size="sm">{t("siteSettings.reset")}</Button>
    <Button onclick={save} variant="primary" size="sm">{t("common.save")}</Button>
  </div>
</div>

{#if loading}
  <LoadingSpinner message={t("common.loading")} />
{:else}
  <div class="settings-grid">
    <div class="card">
      <h2>{t("siteSettings.content")}</h2>
      <div class="form-grid">
        <label class="form-group">
          <span class="label">{t("siteSettings.pageTitle")}</span>
          <input class="input" bind:value={config.pageTitle} />
        </label>
        <label class="form-group">
          <span class="label">{t("siteSettings.headerTitle")}</span>
          <input class="input" bind:value={config.headerTitle} />
        </label>
        <label class="form-group">
          <span class="label">{t("siteSettings.heroTitle")}</span>
          <input class="input" bind:value={config.heroTitle} />
        </label>
        <label class="form-group">
          <span class="label">{t("siteSettings.heroButtonText")}</span>
          <input class="input" bind:value={config.heroButtonText} />
        </label>
        <label class="form-group full-width">
          <span class="label">{t("siteSettings.heroDescription")}</span>
          <textarea class="input textarea" bind:value={config.heroDescription} rows="3"></textarea>
        </label>
        <label class="form-group full-width">
          <span class="label">{t("siteSettings.heroHint")}</span>
          <textarea class="input textarea" bind:value={config.heroHint} rows="3"></textarea>
        </label>
        <label class="form-group">
          <span class="label">{t("siteSettings.placeholder")}</span>
          <input class="input" bind:value={config.inputPlaceholder} />
        </label>
        <label class="form-group">
          <span class="label">{t("siteSettings.sendButtonText")}</span>
          <input class="input" bind:value={config.sendButtonText} />
        </label>
      </div>
    </div>

    <div class="card">
      <h2>{t("siteSettings.appearance")}</h2>
      <div class="form-grid">
        <ColorPicker label={t("siteSettings.themeColor")} bind:value={config.themeColor} />
        <ColorPicker label={t("siteSettings.primaryColor")} bind:value={config.primaryColor} />
        <ColorPicker label={t("siteSettings.headerBg")} bind:value={config.headerBg} />
        <ColorPicker label={t("siteSettings.chatBubbleColor")} bind:value={config.chatBubbleColor} />
      </div>
    </div>

    <div class="card">
      <h2>{t("siteSettings.logo")}</h2>
      <div class="logo-block">
        <div class="logo-preview">
          {#if config.logoUrl}
            <img src={getLogoPreviewUrl(config.logoUrl)} alt={t("siteSettings.logo")} />
          {:else}
            <span>Q</span>
          {/if}
        </div>
        <div class="logo-meta">
          <div class="logo-name">{config.logoUrl || t("siteSettings.defaultLogo")}</div>
          <div class="logo-upload">
            <input type="file" accept="image/*" onchange={(e) => { logoFile = e.target.files[0] || null; }} />
            <Button onclick={uploadLogo} variant="secondary" size="sm" disabled={!logoFile}>{t("common.upload")}</Button>
          </div>
        </div>
      </div>
    </div>
  </div>
{/if}

<style>
  .page-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 16px;
    gap: 12px;
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
  .settings-grid {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
  .card {
    background: var(--bg-card);
    border-radius: var(--radius);
    padding: 20px;
    box-shadow: var(--shadow);
    border: 1px solid var(--border-light);
  }
  .card h2 {
    font-size: 15px;
    font-weight: 600;
    margin-bottom: 14px;
  }
  .form-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
  }
  .form-group {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .form-group.full-width {
    grid-column: 1 / -1;
  }
  .label {
    font-size: 12px;
    font-weight: 600;
    color: var(--text-secondary);
  }
  .input {
    width: 100%;
    padding: 8px 12px;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    font-size: 13px;
    font-family: inherit;
    color: var(--text);
    background: var(--bg);
    outline: none;
    box-sizing: border-box;
  }
  .input:focus {
    border-color: var(--accent);
  }
  .textarea {
    resize: vertical;
    min-height: 84px;
  }
  .logo-block {
    display: flex;
    align-items: center;
    gap: 16px;
  }
  .logo-preview {
    width: 72px;
    height: 72px;
    border-radius: 14px;
    border: 1px solid var(--border);
    background: var(--bg);
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    flex-shrink: 0;
    color: var(--text-muted);
    font-size: 24px;
    font-weight: 700;
  }
  .logo-preview img {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }
  .logo-meta {
    display: flex;
    flex-direction: column;
    gap: 10px;
    min-width: 0;
  }
  .logo-name {
    font-size: 13px;
    color: var(--text-secondary);
    word-break: break-all;
  }
  .logo-upload {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
  }
  @media (max-width: 720px) {
    .page-header {
      flex-direction: column;
      align-items: stretch;
    }
    .header-actions {
      justify-content: flex-end;
    }
    .form-grid {
      grid-template-columns: 1fr;
    }
    .logo-block {
      flex-direction: column;
      align-items: flex-start;
    }
  }
</style>

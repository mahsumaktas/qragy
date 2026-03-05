<script>
  import { getPanelMeta } from "../../lib/constants.js";
  import { getPanel } from "../../lib/router.svelte.js";
  import { clearToken } from "../../lib/auth.svelte.js";
  import { t, getLocale, setLocale } from "../../lib/i18n.svelte.js";

  let { onOpenCommandPalette = () => {}, onToggleMobile = () => {} } = $props();

  const shortcutLabel = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform)
    ? "Cmd+K"
    : "Ctrl+K";

  let locale = $derived(getLocale());
  let panelMeta = $derived(getPanelMeta(getPanel()));
  let title = $derived(panelMeta ? t(panelMeta.item.labelKey) : t("dashboard.title"));
  let sectionLabel = $derived(panelMeta ? t(panelMeta.group.labelKey) : t("shell.productTagline"));
  let sectionDesc = $derived(panelMeta ? t(panelMeta.group.descriptionKey) : t("shell.productTagline"));

  function toggleLang() {
    setLocale(locale === "en" ? "tr" : "en");
  }
</script>

<header class="header">
  <div class="header-start">
    <button class="hamburger" onclick={onToggleMobile} aria-label={t("header.menu")}>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
    </button>

    <div class="title-stack">
      <div class="section-row">
        <span class="section-pill">{sectionLabel}</span>
        <span class="section-desc">{sectionDesc}</span>
      </div>
      <div class="panel-row">
        <div class="header-title">{title}</div>
        <span class="admin-chip">{t("header.admin")}</span>
      </div>
    </div>
  </div>

  <div class="header-tools">
    <button class="header-search" onclick={onOpenCommandPalette}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
      <span>{t("header.quickSearch")}</span>
      <kbd>{shortcutLabel}</kbd>
    </button>

    <button class="lang-pill" title={t("header.language")} onclick={toggleLang}>
      <span>{locale.toUpperCase()}</span>
      <span class="lang-sep">/</span>
      <span>{locale === "en" ? "TR" : "EN"}</span>
    </button>

    <button
      class="logout-btn"
      title={t("header.logout")}
      onclick={() => {
        clearToken();
        window.location.reload();
      }}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
    </button>
  </div>
</header>

<style>
  .header {
    height: var(--header-h);
    background: rgba(255, 255, 255, 0.84);
    border-bottom: 1px solid var(--border);
    backdrop-filter: blur(12px);
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 22px;
    gap: 18px;
    flex-shrink: 0;
  }

  .header-start {
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 14px;
  }

  .title-stack {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .section-row {
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .section-pill {
    display: inline-flex;
    align-items: center;
    padding: 4px 9px;
    border-radius: 999px;
    background: var(--accent-light);
    color: var(--accent);
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    white-space: nowrap;
  }

  .section-desc {
    font-size: 12px;
    color: var(--text-muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .panel-row {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
  }

  .header-title {
    font-size: 22px;
    font-weight: 700;
    line-height: 1.1;
    color: var(--text);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .admin-chip {
    display: inline-flex;
    align-items: center;
    padding: 4px 8px;
    border-radius: 999px;
    background: var(--bg);
    border: 1px solid var(--border);
    color: var(--text-secondary);
    font-size: 11px;
    font-weight: 600;
    white-space: nowrap;
  }

  .header-tools {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-shrink: 0;
  }

  .header-search {
    min-width: 240px;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 14px;
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: 14px;
    box-shadow: var(--shadow-sm);
    cursor: pointer;
    color: var(--text-secondary);
    font-size: 13px;
    font-family: inherit;
    transition: all 0.15s ease;
  }

  .header-search:hover {
    border-color: rgba(15, 108, 189, 0.32);
    color: var(--text);
  }

  .header-search span {
    white-space: nowrap;
  }

  .header-search kbd,
  .lang-pill {
    font-family: inherit;
  }

  .header-search kbd {
    margin-left: auto;
    padding: 2px 7px;
    border-radius: 8px;
    border: 1px solid var(--border);
    background: var(--bg);
    font-size: 11px;
    color: var(--text-muted);
  }

  .lang-pill,
  .logout-btn,
  .hamburger {
    height: 40px;
    border-radius: 12px;
    border: 1px solid var(--border);
    background: var(--bg-card);
    color: var(--text-secondary);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .lang-pill:hover,
  .logout-btn:hover,
  .hamburger:hover {
    background: var(--bg-hover);
    color: var(--text);
  }

  .lang-pill {
    padding: 0 12px;
    gap: 6px;
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.04em;
  }

  .lang-sep {
    color: var(--text-muted);
    font-weight: 500;
  }

  .logout-btn,
  .hamburger {
    width: 40px;
    padding: 0;
  }

  .logout-btn:hover {
    color: var(--error);
    border-color: rgba(220, 38, 38, 0.22);
  }

  .hamburger {
    display: none;
    flex-shrink: 0;
  }

  @media (max-width: 1200px) {
    .section-desc {
      display: none;
    }
  }

  @media (max-width: 1024px) {
    .hamburger {
      display: inline-flex;
    }
  }

  @media (max-width: 860px) {
    .header {
      padding: 0 16px;
    }

    .header-search {
      min-width: 0;
      width: 46px;
      padding: 0;
      justify-content: center;
    }

    .header-search span,
    .header-search kbd,
    .admin-chip {
      display: none;
    }
  }

  @media (max-width: 640px) {
    .header-title {
      font-size: 18px;
    }

    .section-row {
      gap: 8px;
    }
  }
</style>

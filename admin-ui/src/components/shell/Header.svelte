<script>
  import { PANEL_TITLES } from "../../lib/constants.js";
  import { getPanel } from "../../lib/router.svelte.js";

  let { onOpenCommandPalette = () => {}, onToggleMobile = () => {} } = $props();

  let title = $derived(PANEL_TITLES[getPanel()] || "Dashboard");
</script>

<header class="header">
  <button class="hamburger" onclick={onToggleMobile} aria-label="Menu">
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
  </button>
  <div class="header-title">{title}</div>

  <button class="header-search" onclick={onOpenCommandPalette}>
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
    <span>Hizli arama...</span>
    <kbd>Cmd+K</kbd>
  </button>

  <div class="header-actions">
    <button class="header-btn" title="Bildirimler">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
    </button>
    <div class="avatar" title="Admin">MA</div>
  </div>
</header>

<style>
  .header {
    height: var(--header-h);
    background: var(--bg-card);
    border-bottom: 1px solid var(--border);
    display: flex;
    align-items: center;
    padding: 0 20px;
    gap: 16px;
    flex-shrink: 0;
  }

  .header-title {
    font-size: 15px;
    font-weight: 600;
  }

  .header-search {
    flex: 1;
    max-width: 480px;
    margin: 0 auto;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 7px 14px;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 8px;
    cursor: pointer;
    color: var(--text-muted);
    font-size: 13px;
    font-family: inherit;
    transition: border-color 0.15s;
  }
  .header-search:hover {
    border-color: var(--text-muted);
  }
  .header-search kbd {
    margin-left: auto;
    font-size: 11px;
    padding: 1px 6px;
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: 4px;
    color: var(--text-muted);
    font-family: inherit;
  }

  .header-actions {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .header-btn {
    width: 34px;
    height: 34px;
    border-radius: 8px;
    border: 1px solid var(--border);
    background: var(--bg-card);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--text-secondary);
    transition: all 0.15s;
  }
  .header-btn:hover {
    background: var(--bg-hover);
    color: var(--text);
  }

  .avatar {
    width: 30px;
    height: 30px;
    border-radius: 50%;
    background: var(--accent);
    color: #fff;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 12px;
    font-weight: 700;
    cursor: pointer;
  }

  .hamburger {
    display: none;
    width: 34px;
    height: 34px;
    border-radius: 8px;
    border: 1px solid var(--border);
    background: var(--bg-card);
    cursor: pointer;
    align-items: center;
    justify-content: center;
    color: var(--text-secondary);
    flex-shrink: 0;
  }

  @media (max-width: 1024px) {
    .hamburger {
      display: flex;
    }
  }
  @media (max-width: 600px) {
    .header-search span,
    .header-search kbd {
      display: none;
    }
  }
</style>

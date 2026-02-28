<script>
  let { title = "", open = $bindable(false), icon = "", children } = $props();
</script>

<div class="expand-card" class:open>
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="expand-header" onclick={() => (open = !open)}>
    <h3>
      {#if icon}
        <span class="expand-icon">{@html icon}</span>
      {/if}
      {title}
    </h3>
    <svg class="expand-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <polyline points="6 9 12 15 18 9"/>
    </svg>
  </div>
  {#if open}
    <div class="expand-body">
      {@render children()}
    </div>
  {/if}
</div>

<style>
  .expand-card {
    border: 1px solid var(--border);
    border-radius: var(--radius);
    overflow: hidden;
    margin-bottom: 8px;
  }
  .expand-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 16px;
    cursor: pointer;
    background: var(--bg-card);
    transition: background 0.15s;
  }
  .expand-header:hover { background: var(--bg-hover); }
  .expand-header h3 {
    font-size: 14px;
    font-weight: 600;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .expand-icon { display: flex; }
  .expand-chevron {
    transition: transform 0.2s;
    color: var(--text-muted);
  }
  .open .expand-chevron { transform: rotate(180deg); }
  .expand-body {
    padding: 16px;
    border-top: 1px solid var(--border-light);
  }
</style>

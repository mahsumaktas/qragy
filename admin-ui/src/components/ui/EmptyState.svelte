<script>
  let { message = "Veri bulunamadi", icon = "" } = $props();
</script>

<div class="empty-state">
  {#if icon}
    <div class="empty-icon">{@html icon}</div>
  {:else}
    <div class="empty-icon">
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/></svg>
    </div>
  {/if}
  <p>{message}</p>
</div>

<style>
  .empty-state {
    text-align: center;
    padding: 48px 20px;
    color: var(--text-muted);
  }
  .empty-icon {
    margin-bottom: 12px;
    opacity: 0.4;
  }
  p { font-size: 13px; }
</style>

<script>
  let { size = 32, message = "" } = $props();
</script>

<div class="loading">
  <div class="spinner" style:width="{size}px" style:height="{size}px"></div>
  {#if message}
    <p>{message}</p>
  {/if}
</div>

<style>
  .loading {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    padding: 32px;
  }
  .spinner {
    border: 3px solid var(--border);
    border-top-color: var(--accent);
    border-radius: 50%;
    animation: spin 0.6s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
  p { font-size: 13px; color: var(--text-muted); }
</style>

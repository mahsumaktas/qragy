<script>
  let { removable = false, onremove, children } = $props();
</script>

<span class="tag">
  {@render children()}
  {#if removable}
    <button class="tag-remove" onclick={onremove}>&times;</button>
  {/if}
</span>

<style>
  .tag {
    display: inline-flex;
    align-items: center;
    padding: 2px 8px;
    border-radius: 4px;
    font-size: 11px;
    font-weight: 500;
    background: var(--bg);
    color: var(--text-secondary);
    border: 1px solid var(--border-light);
    gap: 4px;
  }
  .tag-remove {
    background: none;
    border: none;
    cursor: pointer;
    color: var(--text-muted);
    font-size: 14px;
    line-height: 1;
    padding: 0;
  }
  .tag-remove:hover { color: var(--error); }
</style>

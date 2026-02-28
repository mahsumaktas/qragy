<script>
  let { value = $bindable("#2563eb"), label = "" } = $props();
</script>

<div class="color-picker">
  {#if label}
    <label class="color-label">{label}
      <div class="color-row">
        <input type="color" bind:value class="color-input" />
        <input type="text" bind:value class="color-text" maxlength="7" />
      </div>
    </label>
  {:else}
    <div class="color-row">
      <input type="color" bind:value class="color-input" />
      <input type="text" bind:value class="color-text" maxlength="7" />
    </div>
  {/if}
</div>

<style>
  .color-picker { display: flex; flex-direction: column; gap: 4px; }
  .color-label {
    font-size: 12px;
    font-weight: 600;
    color: var(--text-secondary);
  }
  .color-row { display: flex; align-items: center; gap: 8px; }
  .color-input {
    width: 32px;
    height: 32px;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    cursor: pointer;
    padding: 2px;
  }
  .color-text {
    width: 80px;
    padding: 6px 8px;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    font-size: 12px;
    font-family: "JetBrains Mono", monospace;
    color: var(--text);
    background: var(--bg-card);
  }
</style>

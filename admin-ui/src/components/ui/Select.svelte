<script>
  let {
    value = $bindable(""),
    options = [],
    label = "",
    disabled = false,
    onchange,
  } = $props();
</script>

{#if label}
  <label class="select-label">{label}</label>
{/if}
<select class="select" bind:value {disabled} {onchange}>
  {#each options as opt}
    <option value={typeof opt === "string" ? opt : opt.value}>
      {typeof opt === "string" ? opt : opt.label}
    </option>
  {/each}
</select>

<style>
  .select-label {
    display: block;
    font-size: 12px;
    font-weight: 600;
    color: var(--text-secondary);
    margin-bottom: 4px;
  }
  .select {
    width: 100%;
    padding: 8px 12px;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    font-size: 13px;
    color: var(--text);
    font-family: inherit;
    background: var(--bg-card);
    outline: none;
    transition: border 0.15s;
    cursor: pointer;
    appearance: auto;
  }
  .select:focus {
    border-color: var(--accent);
    box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
  }
  .select:disabled { opacity: 0.6; cursor: not-allowed; }
</style>

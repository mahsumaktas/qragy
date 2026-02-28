<script>
  let {
    value = $bindable(""),
    placeholder = "",
    rows = 4,
    disabled = false,
    label = "",
    oninput,
  } = $props();
</script>

{#if label}
  <label class="textarea-label">{label}</label>
{/if}
<textarea
  class="textarea"
  {placeholder}
  {rows}
  {disabled}
  bind:value
  {oninput}
></textarea>

<style>
  .textarea-label {
    display: block;
    font-size: 12px;
    font-weight: 600;
    color: var(--text-secondary);
    margin-bottom: 4px;
  }
  .textarea {
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
    resize: vertical;
  }
  .textarea:focus {
    border-color: var(--accent);
    box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
  }
  .textarea:disabled { opacity: 0.6; cursor: not-allowed; }
</style>

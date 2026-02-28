<script>
  let {
    value = $bindable(""),
    type = "text",
    placeholder = "",
    disabled = false,
    label = "",
    oninput,
    onchange,
    class: className = "",
  } = $props();
</script>

{#if label}
  <label class="input-label">{label}</label>
{/if}
<input
  class="input {className}"
  {type}
  {placeholder}
  {disabled}
  bind:value
  {oninput}
  {onchange}
/>

<style>
  .input-label {
    display: block;
    font-size: 12px;
    font-weight: 600;
    color: var(--text-secondary);
    margin-bottom: 4px;
  }
  .input {
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
  }
  .input:focus {
    border-color: var(--accent);
    box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
  }
  .input:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
</style>

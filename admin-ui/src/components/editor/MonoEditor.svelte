<script>
  let { value = $bindable(""), readonly = false, rows = 20, placeholder = "" } = $props();
</script>

<textarea
  class="mono-editor"
  bind:value
  {readonly}
  {rows}
  {placeholder}
  spellcheck="false"
></textarea>

<style>
  .mono-editor {
    width: 100%;
    padding: 12px 16px;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    font-family: "JetBrains Mono", monospace;
    font-size: 12px;
    line-height: 1.6;
    color: var(--text);
    background: var(--bg);
    resize: vertical;
    outline: none;
    tab-size: 2;
  }
  .mono-editor:focus {
    border-color: var(--accent);
    box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
  }
  .mono-editor[readonly] {
    opacity: 0.8;
    cursor: default;
  }
</style>

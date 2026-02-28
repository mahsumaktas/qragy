<script>
  let {
    variant = "secondary",
    size = "md",
    disabled = false,
    type = "button",
    onclick,
    children,
    class: className = "",
  } = $props();
</script>

<button
  {type}
  class="btn btn-{variant} btn-{size} {className}"
  {disabled}
  {onclick}
>
  {@render children()}
</button>

<style>
  .btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 8px 16px;
    border-radius: 8px;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s;
    border: none;
    font-family: inherit;
    white-space: nowrap;
  }
  .btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .btn-primary { background: var(--accent); color: #fff; }
  .btn-primary:hover:not(:disabled) { background: var(--accent-hover); }
  .btn-secondary { background: var(--bg-card); color: var(--text); border: 1px solid var(--border); }
  .btn-secondary:hover:not(:disabled) { background: var(--bg-hover); }
  .btn-ghost { background: transparent; color: var(--text-secondary); }
  .btn-ghost:hover:not(:disabled) { background: var(--bg-hover); color: var(--text); }
  .btn-danger { background: var(--error-bg); color: var(--error); }
  .btn-danger:hover:not(:disabled) { background: var(--error); color: #fff; }
  .btn-sm { padding: 5px 10px; font-size: 12px; }
  .btn-md { padding: 8px 16px; font-size: 13px; }
</style>

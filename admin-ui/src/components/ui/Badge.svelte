<script>
  let { variant = "gray", children } = $props();
</script>

<span class="badge badge-{variant}">
  {@render children()}
</span>

<style>
  .badge {
    display: inline-flex;
    align-items: center;
    font-size: 11px;
    font-weight: 600;
    padding: 2px 8px;
    border-radius: 20px;
  }
  .badge-blue { background: var(--accent-light); color: var(--accent); }
  .badge-green { background: var(--success-bg); color: var(--success); }
  .badge-yellow { background: var(--warning-bg); color: var(--warning); }
  .badge-red { background: var(--error-bg); color: var(--error); }
  .badge-gray { background: var(--bg); color: var(--text-muted); }
  .badge-purple { background: var(--purple-bg); color: var(--purple); }
</style>

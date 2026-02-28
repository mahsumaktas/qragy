<script>
  let { value = 0, max = 100, color = "var(--accent)", height = "6px" } = $props();
  let pct = $derived(Math.min(100, Math.max(0, (value / max) * 100)));
</script>

<div class="progress" style:height>
  <div class="progress-bar" style:width="{pct}%" style:background={color}></div>
</div>

<style>
  .progress { background: var(--bg); border-radius: 4px; overflow: hidden; }
  .progress-bar { height: 100%; border-radius: 4px; transition: width 0.3s; }
</style>

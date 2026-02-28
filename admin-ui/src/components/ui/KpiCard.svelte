<script>
  let { label = "", value = 0, sub = "", trend = "", color = "var(--text)" } = $props();
</script>

<div class="kpi-card">
  <div class="kpi-label">{label}</div>
  <div class="kpi-value" style:color>{value}</div>
  {#if sub}
    <div class="kpi-sub">
      {#if trend === "up"}
        <span class="trend up">↑</span>
      {:else if trend === "down"}
        <span class="trend down">↓</span>
      {/if}
      {sub}
    </div>
  {/if}
</div>

<style>
  .kpi-card {
    background: var(--bg-card);
    border-radius: var(--radius);
    padding: 20px;
    box-shadow: var(--shadow);
    border: 1px solid var(--border-light);
  }
  .kpi-label {
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.6px;
    color: var(--text-muted);
    margin-bottom: 8px;
  }
  .kpi-value {
    font-size: 30px;
    font-weight: 700;
    line-height: 1;
  }
  .kpi-sub {
    font-size: 12px;
    color: var(--text-muted);
    margin-top: 4px;
  }
  .trend.up { color: var(--success); }
  .trend.down { color: var(--error); }
</style>

<script>
  let { data = [], labels = [], color = "var(--accent)", height = 180 } = $props();

  let pathD = $derived(() => {
    if (!data.length) return { line: "", area: "" };
    const max = Math.max(...data, 1);
    const w = 100;
    const step = w / (data.length - 1 || 1);
    const pts = data.map((v, i) => [i * step, height - (v / max) * (height - 20) - 10]);
    const line = pts.map((p, i) => (i === 0 ? "M" : "L") + p[0] + "," + p[1]).join(" ");
    const area = line + ` L${pts[pts.length - 1][0]},${height} L0,${height} Z`;
    return { line, area };
  });
</script>

<div class="area-chart">
  <svg viewBox="0 0 100 {height}" preserveAspectRatio="none" class="chart-svg">
    <defs>
      <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color={color} stop-opacity="0.15" />
        <stop offset="100%" stop-color={color} stop-opacity="0" />
      </linearGradient>
    </defs>
    {#if data.length > 1}
      <path d={pathD().area} fill="url(#areaGrad)" />
      <path d={pathD().line} fill="none" stroke={color} stroke-width="2" vector-effect="non-scaling-stroke" stroke-linecap="round" />
    {/if}
  </svg>
  {#if labels.length}
    <div class="chart-labels">
      {#each labels as lbl}
        <span>{lbl}</span>
      {/each}
    </div>
  {/if}
</div>

<style>
  .area-chart { position: relative; }
  .chart-svg { width: 100%; height: auto; display: block; }
  .chart-labels {
    display: flex;
    justify-content: space-between;
    font-size: 10px;
    color: var(--text-muted);
    margin-top: 4px;
  }
</style>

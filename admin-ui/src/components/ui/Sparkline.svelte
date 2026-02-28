<script>
  let { data = [], color = "var(--accent)", height = 36, width = "100%" } = $props();

  let points = $derived(() => {
    if (!data.length) return "";
    const max = Math.max(...data, 1);
    const step = 100 / (data.length - 1 || 1);
    return data.map((v, i) => `${i * step},${height - (v / max) * height}`).join(" ");
  });
</script>

<svg class="sparkline" viewBox="0 0 100 {height}" preserveAspectRatio="none" style:width style:height="{height}px">
  {#if data.length > 1}
    <polyline
      points={points()}
      fill="none"
      stroke={color}
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      vector-effect="non-scaling-stroke"
    />
  {/if}
</svg>

<style>
  .sparkline { display: block; }
</style>

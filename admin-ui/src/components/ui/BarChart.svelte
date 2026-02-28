<script>
  let { items = [], color = "var(--accent)" } = $props();
  // items: [{ label, value }]

  let maxVal = $derived(Math.max(...items.map((i) => i.value), 1));
</script>

<div class="bar-chart">
  {#each items as item}
    <div class="bar-row">
      <span class="bar-label">{item.label}</span>
      <div class="bar-track">
        <div
          class="bar-fill"
          style:width="{(item.value / maxVal) * 100}%"
          style:background={item.color || color}
        ></div>
      </div>
      <span class="bar-value">{item.value}</span>
    </div>
  {/each}
</div>

<style>
  .bar-chart { display: flex; flex-direction: column; gap: 8px; }
  .bar-row { display: flex; align-items: center; gap: 10px; }
  .bar-label {
    width: 100px;
    font-size: 12px;
    color: var(--text-secondary);
    text-align: right;
    flex-shrink: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .bar-track {
    flex: 1;
    height: 8px;
    background: var(--bg);
    border-radius: 4px;
    overflow: hidden;
  }
  .bar-fill {
    height: 100%;
    border-radius: 4px;
    transition: width 0.3s;
  }
  .bar-value {
    width: 40px;
    font-size: 12px;
    font-weight: 600;
    color: var(--text);
  }
</style>

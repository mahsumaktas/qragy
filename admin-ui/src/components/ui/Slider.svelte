<script>
  let { value = $bindable(50), min = 0, max = 100, step = 1, label = "", onchange } = $props();
</script>

{#if label}
  <label class="slider-label">{label}: <strong>{value}</strong></label>
{/if}
<input
  type="range"
  class="slider"
  bind:value
  {min}
  {max}
  {step}
  oninput={(e) => { value = Number(e.target.value); onchange?.(value); }}
/>

<style>
  .slider-label {
    display: block;
    font-size: 12px;
    font-weight: 500;
    color: var(--text-secondary);
    margin-bottom: 4px;
  }
  .slider {
    width: 100%;
    accent-color: var(--accent);
    cursor: pointer;
  }
</style>

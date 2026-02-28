<script>
  let { checked = $bindable(), disabled = false, onchange } = $props();

  // API'den henuz data gelmemisse undefined olabilir, false olarak kullan
  let isOn = $derived(!!checked);

  function handleClick() {
    if (disabled) return;
    checked = !isOn;
    onchange?.(checked);
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<span
  class="toggle"
  class:on={isOn}
  class:disabled
  role="switch"
  aria-checked={isOn}
  tabindex="0"
  onclick={handleClick}
  onkeydown={(e) => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); handleClick(); } }}
></span>

<style>
  .toggle {
    width: 36px;
    height: 20px;
    border-radius: 10px;
    background: var(--border);
    position: relative;
    cursor: pointer;
    transition: background 0.2s;
    display: inline-block;
    flex-shrink: 0;
  }
  .toggle.on { background: var(--accent); }
  .toggle.disabled { opacity: 0.5; cursor: not-allowed; }
  .toggle::after {
    content: "";
    position: absolute;
    top: 2px;
    left: 2px;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: #fff;
    transition: transform 0.2s;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.15);
  }
  .toggle.on::after { transform: translateX(16px); }
</style>

<script>
  import { NAV_GROUPS } from "../../lib/constants.js";
  import { navigate } from "../../lib/router.svelte.js";

  let { open = $bindable(false) } = $props();
  let query = $state("");
  let inputRef;
  let selectedIdx = $state(0);

  let allItems = NAV_GROUPS.flatMap((g) =>
    g.items.map((item) => ({ ...item, group: g.label }))
  );

  let filtered = $derived(
    query.trim()
      ? allItems.filter(
          (item) =>
            item.label.toLowerCase().includes(query.toLowerCase()) ||
            item.id.includes(query.toLowerCase())
        )
      : allItems
  );

  $effect(() => {
    if (open && inputRef) {
      query = "";
      selectedIdx = 0;
      setTimeout(() => inputRef?.focus(), 10);
    }
  });

  function handleKeydown(e) {
    if (e.key === "Escape") {
      open = false;
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      selectedIdx = (selectedIdx + 1) % filtered.length;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      selectedIdx = (selectedIdx - 1 + filtered.length) % filtered.length;
    }
    if (e.key === "Enter" && filtered[selectedIdx]) {
      e.preventDefault();
      selectItem(filtered[selectedIdx]);
    }
  }

  function selectItem(item) {
    navigate(item.id);
    open = false;
  }

  function handleOverlayClick(e) {
    if (e.target === e.currentTarget) {
      open = false;
    }
  }
</script>

{#if open}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="cmd-overlay" onclick={handleOverlayClick}>
    <div class="cmd-box" role="dialog" aria-label="Hizli arama">
      <input
        bind:this={inputRef}
        bind:value={query}
        class="cmd-input"
        placeholder="Panel veya islem ara..."
        onkeydown={handleKeydown}
      />
      <div class="cmd-results">
        {#each filtered as item, idx}
          {#if idx === 0 || filtered[idx - 1]?.group !== item.group}
            <div class="cmd-group">{item.group}</div>
          {/if}
          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div
            class="cmd-item"
            class:selected={idx === selectedIdx}
            onclick={() => selectItem(item)}
          >
            {item.label}
          </div>
        {/each}
        {#if filtered.length === 0}
          <div class="cmd-empty">Sonuc bulunamadi</div>
        {/if}
      </div>
    </div>
  </div>
{/if}

<style>
  .cmd-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.4);
    z-index: 9999;
    display: flex;
    align-items: flex-start;
    justify-content: center;
    padding-top: 20vh;
    backdrop-filter: blur(2px);
  }

  .cmd-box {
    background: var(--bg-card);
    border-radius: 12px;
    width: 560px;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.2);
    border: 1px solid var(--border);
    overflow: hidden;
  }

  .cmd-input {
    width: 100%;
    padding: 16px 20px;
    border: none;
    font-size: 15px;
    outline: none;
    background: transparent;
    color: var(--text);
    font-family: inherit;
    border-bottom: 1px solid var(--border-light);
  }

  .cmd-results {
    max-height: 320px;
    overflow-y: auto;
    padding: 8px;
  }

  .cmd-group {
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--text-muted);
    padding: 8px 12px 4px;
  }

  .cmd-item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 12px;
    border-radius: 8px;
    cursor: pointer;
    color: var(--text-secondary);
    font-size: 13px;
  }
  .cmd-item:hover,
  .cmd-item.selected {
    background: var(--accent-light);
    color: var(--accent);
  }

  .cmd-empty {
    padding: 20px;
    text-align: center;
    color: var(--text-muted);
    font-size: 13px;
  }
</style>

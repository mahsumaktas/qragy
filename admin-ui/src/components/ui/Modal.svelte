<script>
  let { open = $bindable(false), title = "", width = "520px", children } = $props();

  function handleOverlay(e) {
    if (e.target === e.currentTarget) open = false;
  }

  function handleKeydown(e) {
    if (e.key === "Escape") open = false;
  }
</script>

<svelte:window onkeydown={open ? handleKeydown : undefined} />

{#if open}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="modal-overlay" onclick={handleOverlay}>
    <div class="modal-box" style:width role="dialog" aria-label={title}>
      <div class="modal-header">
        <h3>{title}</h3>
        <button class="modal-close" onclick={() => (open = false)}>&times;</button>
      </div>
      <div class="modal-body">
        {@render children()}
      </div>
    </div>
  </div>
{/if}

<style>
  .modal-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.4);
    z-index: 9000;
    display: flex;
    align-items: center;
    justify-content: center;
    backdrop-filter: blur(2px);
  }
  .modal-box {
    background: var(--bg-card);
    border-radius: var(--radius);
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.2);
    border: 1px solid var(--border);
    max-height: 85vh;
    display: flex;
    flex-direction: column;
  }
  .modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 16px 20px;
    border-bottom: 1px solid var(--border-light);
  }
  .modal-header h3 {
    font-size: 15px;
    font-weight: 600;
  }
  .modal-close {
    background: none;
    border: none;
    font-size: 20px;
    cursor: pointer;
    color: var(--text-muted);
    line-height: 1;
    padding: 4px;
  }
  .modal-close:hover { color: var(--text); }
  .modal-body {
    padding: 20px;
    overflow-y: auto;
  }
</style>

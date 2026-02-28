<script>
  import { getConfirm } from "../../lib/confirm.svelte.js";

  let dialog = $derived(getConfirm());
</script>

{#if dialog}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="confirm-overlay" onclick={() => dialog.resolve(false)}>
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="confirm-box" onclick={(e) => e.stopPropagation()}>
      <h3>{dialog.title}</h3>
      <p>{dialog.message}</p>
      <div class="confirm-actions">
        <button class="btn btn-secondary" onclick={() => dialog.resolve(false)}>
          {dialog.cancelText}
        </button>
        <button
          class="btn"
          class:btn-danger={dialog.danger}
          class:btn-primary={!dialog.danger}
          onclick={() => dialog.resolve(true)}
        >
          {dialog.confirmText}
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .confirm-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.4);
    z-index: 9998;
    display: flex;
    align-items: center;
    justify-content: center;
    backdrop-filter: blur(2px);
  }

  .confirm-box {
    background: var(--bg-card);
    border-radius: var(--radius);
    padding: 24px;
    width: 400px;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.2);
    border: 1px solid var(--border);
  }

  h3 {
    font-size: 15px;
    font-weight: 600;
    margin-bottom: 8px;
  }

  p {
    font-size: 13px;
    color: var(--text-secondary);
    margin-bottom: 20px;
    line-height: 1.5;
  }

  .confirm-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }

  .btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 8px 16px;
    border-radius: 8px;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s;
    border: none;
    font-family: inherit;
  }
  .btn-primary {
    background: var(--accent);
    color: #fff;
  }
  .btn-primary:hover {
    background: var(--accent-hover);
  }
  .btn-secondary {
    background: var(--bg-card);
    color: var(--text);
    border: 1px solid var(--border);
  }
  .btn-secondary:hover {
    background: var(--bg-hover);
  }
  .btn-danger {
    background: var(--error-bg);
    color: var(--error);
  }
  .btn-danger:hover {
    background: var(--error);
    color: #fff;
  }
</style>

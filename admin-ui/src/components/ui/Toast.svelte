<script>
  import { getToasts, removeToast } from "../../lib/toast.svelte.js";
</script>

<div class="toast-container">
  {#each getToasts() as toast (toast.id)}
    <div
      class="toast toast-{toast.type}"
      class:removing={toast.removing}
      role="alert"
    >
      <p>{toast.message}</p>
      <button class="toast-close" onclick={() => removeToast(toast.id)}>&times;</button>
    </div>
  {/each}
</div>

<style>
  .toast-container {
    position: fixed;
    top: 16px;
    right: 16px;
    z-index: 10000;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .toast {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 16px;
    border-radius: var(--radius-sm);
    font-size: 13px;
    box-shadow: var(--shadow-md);
    transition: all 0.3s ease;
    min-width: 280px;
    max-width: 420px;
  }
  .toast p {
    flex: 1;
    margin: 0;
  }

  .toast-info {
    background: var(--accent-light);
    color: var(--accent);
    border: 1px solid var(--accent);
  }
  .toast-success {
    background: var(--success-bg);
    color: var(--success);
    border: 1px solid var(--success);
  }
  .toast-warning {
    background: var(--warning-bg);
    color: var(--warning);
    border: 1px solid var(--warning);
  }
  .toast-error {
    background: var(--error-bg);
    color: var(--error);
    border: 1px solid var(--error);
  }

  .toast.removing {
    opacity: 0;
    transform: translateX(100%);
  }

  .toast-close {
    background: none;
    border: none;
    font-size: 18px;
    cursor: pointer;
    color: inherit;
    opacity: 0.6;
    line-height: 1;
    padding: 0;
  }
  .toast-close:hover {
    opacity: 1;
  }
</style>

<script>
  let { onsend, placeholder = "Mesaj yazin...", disabled = false } = $props();
  let text = $state("");

  function handleSubmit() {
    const trimmed = text.trim();
    if (!trimmed) return;
    onsend?.(trimmed);
    text = "";
  }

  function handleKeydown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }
</script>

<div class="chat-input">
  <textarea
    bind:value={text}
    {placeholder}
    {disabled}
    rows="1"
    onkeydown={handleKeydown}
  ></textarea>
  <button class="send-btn" onclick={handleSubmit} disabled={disabled || !text.trim()} aria-label="Gonder">
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
  </button>
</div>

<style>
  .chat-input {
    display: flex;
    align-items: flex-end;
    gap: 8px;
    padding: 12px 16px;
    border-top: 1px solid var(--border-light);
    background: var(--bg-card);
  }
  textarea {
    flex: 1;
    padding: 8px 12px;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    font-size: 13px;
    font-family: inherit;
    color: var(--text);
    resize: none;
    outline: none;
    background: var(--bg);
    max-height: 120px;
  }
  textarea:focus { border-color: var(--accent); }
  .send-btn {
    width: 36px;
    height: 36px;
    border-radius: 8px;
    background: var(--accent);
    color: #fff;
    border: none;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    transition: background 0.15s;
  }
  .send-btn:hover:not(:disabled) { background: var(--accent-hover); }
  .send-btn:disabled { opacity: 0.5; cursor: not-allowed; }
</style>

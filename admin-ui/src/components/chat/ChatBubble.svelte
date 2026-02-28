<script>
  let { sender = "bot", message = "", timestamp = "" } = $props();
</script>

<div class="bubble-wrap" class:user={sender === "user"}>
  <div class="bubble bubble-{sender}">
    {message}
  </div>
  {#if timestamp}
    <div class="bubble-time">{timestamp}</div>
  {/if}
</div>

<style>
  .bubble-wrap {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    margin-bottom: 8px;
  }
  .bubble-wrap.user {
    align-items: flex-end;
  }
  .bubble {
    max-width: 80%;
    padding: 10px 14px;
    border-radius: 14px;
    font-size: 13px;
    line-height: 1.5;
    word-break: break-word;
  }
  .bubble-user {
    background: var(--accent);
    color: #fff;
    border-bottom-right-radius: 4px;
  }
  .bubble-bot {
    background: var(--bg);
    color: var(--text);
    border-bottom-left-radius: 4px;
  }
  .bubble-system {
    background: var(--warning-bg);
    color: var(--warning);
    font-size: 12px;
    border-radius: 8px;
  }
  .bubble-time {
    font-size: 10px;
    color: var(--text-muted);
    margin-top: 2px;
    padding: 0 4px;
  }
</style>

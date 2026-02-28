<script>
  import ChatBubble from "./ChatBubble.svelte";
  import { onMount } from "svelte";

  let { messages = [] } = $props();
  let container;

  function scrollToBottom() {
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
  }

  onMount(scrollToBottom);

  $effect(() => {
    // eslint-disable-next-line no-unused-expressions
    messages.length;
    setTimeout(scrollToBottom, 50);
  });
</script>

<div class="chat-thread" bind:this={container}>
  {#each messages as msg}
    <ChatBubble sender={msg.sender || msg.role} message={msg.text || msg.content || msg.message} timestamp={msg.timestamp || ""} />
  {:else}
    <div class="empty-chat">Henuz mesaj yok</div>
  {/each}
</div>

<style>
  .chat-thread {
    flex: 1;
    overflow-y: auto;
    padding: 16px;
    display: flex;
    flex-direction: column;
  }
  .empty-chat {
    text-align: center;
    color: var(--text-muted);
    font-size: 13px;
    padding: 40px;
  }
</style>

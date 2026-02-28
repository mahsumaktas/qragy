<script>
  import { onMount, onDestroy } from "svelte";
  import { api } from "../../lib/api.js";
  import { createSSE } from "../../lib/sse.js";
  import { showToast } from "../../lib/toast.svelte.js";
  import { fmtRelative } from "../../lib/format.js";
  import ChatBubble from "../../components/chat/ChatBubble.svelte";
  import ChatInput from "../../components/chat/ChatInput.svelte";
  import Badge from "../../components/ui/Badge.svelte";
  import Button from "../../components/ui/Button.svelte";
  import LoadingSpinner from "../../components/ui/LoadingSpinner.svelte";

  let loading = $state(true);
  let pending = $state([]);
  let active = $state([]);
  let selectedId = $state(null);
  let chatMessages = $state([]);
  let sseHandle = null;

  let selected = $derived(
    [...pending, ...active].find((i) => i.sessionId === selectedId)
  );

  onMount(() => {
    loadInbox();
    sseHandle = createSSE("admin/inbox/stream", {
      onEvent: {
        claimed: () => loadInbox(),
        released: () => loadInbox(),
        message: (data) => {
          if (data.sessionId === selectedId) loadChat(selectedId);
        },
      },
      onError: () => {
        // SSE disconnected
      },
    });
  });

  onDestroy(() => {
    sseHandle?.close();
  });

  async function loadInbox() {
    try {
      const res = await api.get("admin/inbox");
      pending = res.pending || [];
      active = res.active || [];
    } catch (e) {
      showToast("Inbox yuklenemedi: " + e.message, "error");
    } finally {
      loading = false;
    }
  }

  async function loadChat(sessionId) {
    try {
      const res = await api.get("admin/conversations");
      const conv = (res.conversations || []).find((c) => c.sessionId === sessionId);
      chatMessages = conv?.chatHistory || [];
    } catch {
      chatMessages = [];
    }
  }

  async function selectItem(sessionId) {
    selectedId = sessionId;
    await loadChat(sessionId);
  }

  async function claimItem(id) {
    try {
      await api.post("admin/inbox/" + id + "/claim", { agentName: "admin" });
      showToast("Talep alindi", "success");
      await loadInbox();
    } catch (e) {
      showToast("Hata: " + e.message, "error");
    }
  }

  async function releaseItem(id) {
    try {
      await api.post("admin/inbox/" + id + "/release", {});
      showToast("Talep serbest birakildi", "success");
      selectedId = null;
      await loadInbox();
    } catch (e) {
      showToast("Hata: " + e.message, "error");
    }
  }

  async function sendMessage(text) {
    if (!selected) return;
    try {
      await api.post("admin/inbox/" + selected.id + "/message", { message: text });
      await loadChat(selectedId);
    } catch (e) {
      showToast("Mesaj gonderilemedi: " + e.message, "error");
    }
  }
</script>

<div class="page-header">
  <div>
    <h1>Agent Inbox</h1>
    <p>Insan temsilci kuyruğu</p>
  </div>
  <Button onclick={loadInbox} variant="ghost" size="sm">Yenile</Button>
</div>

{#if loading}
  <LoadingSpinner message="Yukleniyor..." />
{:else}
  <div class="inbox-layout">
    <!-- Queue List -->
    <div class="queue-panel">
      {#if pending.length}
        <div class="queue-group">Bekleyen ({pending.length})</div>
        {#each pending as item}
          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div class="queue-item" class:active={selectedId === item.sessionId} onclick={() => selectItem(item.sessionId)}>
            <div class="qi-top">
              <span class="qi-name">{item.customerName || "Misafir"}</span>
              <Badge variant="yellow">bekliyor</Badge>
            </div>
            <div class="qi-topic">{item.topic || item.summary || "..."}</div>
            <div class="qi-meta">{fmtRelative(item.createdAt)}</div>
            <Button onclick={(e) => { e.stopPropagation(); claimItem(item.id); }} variant="primary" size="sm">Talep Al</Button>
          </div>
        {/each}
      {/if}

      {#if active.length}
        <div class="queue-group">Aktif ({active.length})</div>
        {#each active as item}
          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div class="queue-item" class:active={selectedId === item.sessionId} onclick={() => selectItem(item.sessionId)}>
            <div class="qi-top">
              <span class="qi-name">{item.customerName || "Misafir"}</span>
              <Badge variant="green">aktif</Badge>
            </div>
            <div class="qi-topic">{item.topic || item.summary || "..."}</div>
            <div class="qi-meta">{item.assignedTo || "admin"} &middot; {fmtRelative(item.createdAt)}</div>
          </div>
        {/each}
      {/if}

      {#if !pending.length && !active.length}
        <div class="queue-empty">Kuyruk bos</div>
      {/if}
    </div>

    <!-- Chat Panel -->
    <div class="chat-panel">
      {#if selected}
        <div class="chat-header">
          <div>
            <strong>{selected.customerName || "Misafir"}</strong>
            <span class="chat-meta">{selected.topic || ""}</span>
          </div>
          {#if selected.assignedTo}
            <Button onclick={() => releaseItem(selected.id)} variant="ghost" size="sm">Serbest Birak</Button>
          {/if}
        </div>
        <div class="chat-body">
          {#each chatMessages as msg}
            <ChatBubble sender={msg.role === "user" ? "user" : "bot"} message={msg.content || ""} />
          {:else}
            <div class="empty-chat">Mesaj yok</div>
          {/each}
        </div>
        {#if selected.assignedTo}
          <ChatInput onsend={sendMessage} />
        {/if}
      {:else}
        <div class="no-selection">Bir talep secin</div>
      {/if}
    </div>
  </div>
{/if}

<style>
  .page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
  .page-header h1 { font-size: 22px; font-weight: 700; }
  .page-header p { font-size: 13px; color: var(--text-muted); margin-top: 2px; }

  .inbox-layout {
    display: grid;
    grid-template-columns: 320px 1fr;
    height: calc(100vh - 140px);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    overflow: hidden;
    background: var(--bg-card);
  }

  .queue-panel { border-right: 1px solid var(--border); overflow-y: auto; }
  .queue-group { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .8px; color: var(--text-muted); padding: 12px 14px 4px; }
  .queue-item { padding: 12px 14px; border-bottom: 1px solid var(--border-light); cursor: pointer; transition: background .1s; }
  .queue-item:hover { background: var(--bg-hover); }
  .queue-item.active { background: var(--accent-light); border-left: 3px solid var(--accent); }
  .qi-top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; }
  .qi-name { font-weight: 600; font-size: 13px; }
  .qi-topic { font-size: 12px; color: var(--text-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .qi-meta { font-size: 11px; color: var(--text-muted); margin: 4px 0 6px; }
  .queue-empty { padding: 32px; text-align: center; color: var(--text-muted); font-size: 13px; }

  .chat-panel { display: flex; flex-direction: column; overflow: hidden; }
  .chat-header { padding: 12px 16px; border-bottom: 1px solid var(--border-light); display: flex; justify-content: space-between; align-items: center; flex-shrink: 0; }
  .chat-meta { color: var(--text-muted); font-size: 12px; margin-left: 8px; }
  .chat-body { flex: 1; overflow-y: auto; padding: 16px; display: flex; flex-direction: column; }
  .empty-chat, .no-selection { display: flex; align-items: center; justify-content: center; height: 100%; color: var(--text-muted); font-size: 13px; }

  @media (max-width: 768px) {
    .inbox-layout { grid-template-columns: 1fr; height: auto; }
    .queue-panel { max-height: 40vh; border-right: none; border-bottom: 1px solid var(--border); }
  }
</style>

<script>
  import { onMount } from "svelte";
  import { api } from "../../lib/api.js";
  import { showToast } from "../../lib/toast.svelte.js";
  import { showConfirm } from "../../lib/confirm.svelte.js";
  import { fmtRelative } from "../../lib/format.js";
  import ChatBubble from "../../components/chat/ChatBubble.svelte";
  import LoadingSpinner from "../../components/ui/LoadingSpinner.svelte";
  import Badge from "../../components/ui/Badge.svelte";
  import Button from "../../components/ui/Button.svelte";

  let loading = $state(true);
  let conversations = $state([]);
  let selectedId = $state(null);
  let selected = $derived(conversations.find((c) => c.sessionId === selectedId));

  onMount(() => loadConversations());

  async function loadConversations() {
    loading = true;
    try {
      const res = await api.get("admin/conversations");
      conversations = (res.conversations || []).filter(
        (c) => c.status === "active" || c.status === "ticketed"
      );
    } catch (e) {
      showToast("Sohbetler yuklenemedi: " + e.message, "error");
    } finally {
      loading = false;
    }
  }

  async function closeAll() {
    const ok = await showConfirm({
      title: "Tum sohbetleri kapat",
      message: "Tum aktif sohbetler kapatilacak. Emin misiniz?",
      confirmText: "Kapat",
      danger: true,
    });
    if (!ok) return;
    try {
      const res = await api.post("admin/conversations/close-all", {});
      showToast(res.closedCount + " sohbet kapatildi", "success");
      await loadConversations();
      selectedId = null;
    } catch (e) {
      showToast("Hata: " + e.message, "error");
    }
  }
</script>

<div class="page-header">
  <div>
    <h1>Canli Sohbetler <Badge variant="blue">{conversations.length}</Badge></h1>
    <p>Aktif ve ticketed sohbetler</p>
  </div>
  <div class="header-actions">
    <Button onclick={loadConversations} variant="ghost" size="sm">Yenile</Button>
    {#if conversations.length}
      <Button onclick={closeAll} variant="danger" size="sm">Tumunu Kapat</Button>
    {/if}
  </div>
</div>

{#if loading}
  <LoadingSpinner message="Yukleniyor..." />
{:else}
  <div class="live-layout">
    <!-- Conversation List -->
    <div class="conv-list">
      {#each conversations as conv}
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div
          class="conv-item"
          class:active={selectedId === conv.sessionId}
          onclick={() => (selectedId = conv.sessionId)}
        >
          <div class="conv-top">
            <span class="conv-session">{conv.sessionId?.slice(-8) || "?"}</span>
            <Badge variant={conv.status === "active" ? "green" : "yellow"}>{conv.status}</Badge>
          </div>
          <div class="conv-msg">{conv.lastUserMessage || "..."}</div>
          <div class="conv-meta">
            <span>{conv.messageCount || 0} mesaj</span>
            <span>{fmtRelative(conv.updatedAt)}</span>
          </div>
        </div>
      {:else}
        <div class="empty-list">Aktif sohbet yok</div>
      {/each}
    </div>

    <!-- Chat Thread -->
    <div class="chat-panel">
      {#if selected}
        <div class="chat-header">
          <strong>{selected.sessionId?.slice(-8)}</strong>
          <span class="chat-meta">{selected.source || "web"} &middot; {selected.messageCount} mesaj</span>
        </div>
        <div class="chat-body">
          {#each selected.chatHistory || [] as msg}
            <ChatBubble
              sender={msg.role === "user" ? "user" : "bot"}
              message={msg.content || ""}
            />
          {:else}
            <div class="empty-chat">Mesaj yok</div>
          {/each}
        </div>
      {:else}
        <div class="no-selection">Bir sohbet secin</div>
      {/if}
    </div>

    <!-- Context Panel -->
    <div class="context-panel">
      {#if selected}
        <h3>Detaylar</h3>
        <div class="detail-rows">
          <div class="detail-row">
            <span class="detail-label">Oturum</span>
            <span class="detail-val mono">{selected.sessionId?.slice(0, 16)}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Durum</span>
            <span class="detail-val">{selected.status}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Kaynak</span>
            <span class="detail-val">{selected.source || "web"}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Olusturma</span>
            <span class="detail-val">{fmtRelative(selected.createdAt)}</span>
          </div>
          {#if selected.memory}
            <h4>Hafiza</h4>
            {#each Object.entries(selected.memory) as [k, v]}
              {#if v}
                <div class="detail-row">
                  <span class="detail-label">{k}</span>
                  <span class="detail-val">{v}</span>
                </div>
              {/if}
            {/each}
          {/if}
        </div>
      {:else}
        <div class="no-selection-ctx">Detay icin sohbet secin</div>
      {/if}
    </div>
  </div>
{/if}

<style>
  .page-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 16px;
  }
  .page-header h1 { font-size: 22px; font-weight: 700; display: flex; align-items: center; gap: 8px; }
  .page-header p { font-size: 13px; color: var(--text-muted); margin-top: 2px; }
  .header-actions { display: flex; gap: 8px; }

  .live-layout {
    display: grid;
    grid-template-columns: 300px 1fr 280px;
    gap: 0;
    height: calc(100vh - 140px);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    overflow: hidden;
    background: var(--bg-card);
  }

  .conv-list {
    border-right: 1px solid var(--border);
    overflow-y: auto;
  }
  .conv-item {
    padding: 12px 14px;
    border-bottom: 1px solid var(--border-light);
    cursor: pointer;
    transition: background 0.1s;
  }
  .conv-item:hover { background: var(--bg-hover); }
  .conv-item.active { background: var(--accent-light); border-left: 3px solid var(--accent); }
  .conv-top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; }
  .conv-session { font-weight: 600; font-size: 13px; font-family: "JetBrains Mono", monospace; }
  .conv-msg { font-size: 12px; color: var(--text-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .conv-meta { display: flex; justify-content: space-between; font-size: 11px; color: var(--text-muted); margin-top: 4px; }
  .empty-list { padding: 32px; text-align: center; color: var(--text-muted); font-size: 13px; }

  .chat-panel {
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .chat-header {
    padding: 12px 16px;
    border-bottom: 1px solid var(--border-light);
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 13px;
    flex-shrink: 0;
  }
  .chat-meta { color: var(--text-muted); font-size: 12px; }
  .chat-body { flex: 1; overflow-y: auto; padding: 16px; display: flex; flex-direction: column; }
  .empty-chat, .no-selection { display: flex; align-items: center; justify-content: center; height: 100%; color: var(--text-muted); font-size: 13px; }

  .context-panel {
    border-left: 1px solid var(--border);
    padding: 16px;
    overflow-y: auto;
  }
  .context-panel h3 { font-size: 13px; font-weight: 600; margin-bottom: 12px; text-transform: uppercase; letter-spacing: 0.5px; color: var(--text-muted); }
  .context-panel h4 { font-size: 12px; font-weight: 600; margin: 12px 0 6px; color: var(--text-secondary); }
  .detail-rows { display: flex; flex-direction: column; gap: 6px; }
  .detail-row { display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; }
  .detail-label { font-size: 11px; color: var(--text-muted); flex-shrink: 0; }
  .detail-val { font-size: 12px; color: var(--text); text-align: right; word-break: break-all; }
  .no-selection-ctx { text-align: center; color: var(--text-muted); font-size: 13px; padding: 32px 0; }

  .mono { font-family: "JetBrains Mono", monospace; font-size: 11px; }

  @media (max-width: 1024px) {
    .live-layout { grid-template-columns: 260px 1fr; }
    .context-panel { display: none; }
  }
  @media (max-width: 768px) {
    .live-layout { grid-template-columns: 1fr; height: auto; }
    .conv-list { max-height: 40vh; }
  }
</style>

<script>
  import { onMount } from "svelte";
  import { api } from "../../lib/api.js";
  import { showToast } from "../../lib/toast.svelte.js";
  import { t } from "../../lib/i18n.svelte.js";
  import { fmtRelative, truncate } from "../../lib/format.js";
  import { formatMessageCount, translateSource, translateStatus } from "../../lib/labels.js";
  import LoadingSpinner from "../../components/ui/LoadingSpinner.svelte";
  import Badge from "../../components/ui/Badge.svelte";
  import Button from "../../components/ui/Button.svelte";
  import ChatBubble from "../../components/chat/ChatBubble.svelte";

  let loading = $state(true);
  let conversations = $state([]);
  let selectedId = $state(null);
  let selected = $derived(conversations.find((c) => c.sessionId === selectedId));

  onMount(() => loadClosed());

  async function loadClosed() {
    loading = true;
    try {
      const res = await api.get("admin/conversations");
      conversations = (res.conversations || []).filter((c) => c.status === "closed");
    } catch (e) {
      showToast(t("closedChats.loadError", { msg: e.message }), "error");
    } finally {
      loading = false;
    }
  }
</script>

<div class="page-header">
  <div>
    <h1>{t("closedChats.title")} <Badge variant="gray">{conversations.length}</Badge></h1>
    <p>{t("closedChats.subtitle")}</p>
  </div>
  <Button onclick={loadClosed} variant="ghost" size="sm">{t("common.refresh")}</Button>
</div>

{#if loading}
  <LoadingSpinner message={t("common.loading")} />
{:else if !selected}
  <div class="card">
    <table>
      <thead>
        <tr>
          <th>{t("closedChats.session")}</th>
          <th>{t("closedChats.messages")}</th>
          <th>{t("closedChats.source")}</th>
          <th>{t("closedChats.lastMessage")}</th>
          <th>{t("closedChats.closedAt")}</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {#each conversations as conv}
          <tr>
            <td class="mono">{conv.sessionId?.slice(-8) || "?"}</td>
            <td>{conv.messageCount || 0}</td>
            <td>{translateSource(conv.source)}</td>
            <td>{truncate(conv.lastUserMessage || "", 50)}</td>
            <td>{fmtRelative(conv.updatedAt)}</td>
            <td>
              <Button onclick={() => (selectedId = conv.sessionId)} variant="ghost" size="sm">{t("common.open")}</Button>
            </td>
          </tr>
        {:else}
          <tr><td colspan="6" class="empty-row">{t("closedChats.noChats")}</td></tr>
        {/each}
      </tbody>
    </table>
  </div>
{:else}
  <div class="detail-view">
    <Button onclick={() => (selectedId = null)} variant="ghost" size="sm">{t("common.back")}</Button>

    <div class="detail-header">
      <h2>{selected.sessionId?.slice(-8)}</h2>
      <Badge variant="gray">{translateStatus("closed")}</Badge>
    </div>

    <div class="detail-meta">
      <span>{t("common.sourceLabel")}: {translateSource(selected.source)}</span>
      <span>{formatMessageCount(selected.messageCount)}</span>
      <span>{fmtRelative(selected.createdAt)}</span>
    </div>

    {#if selected.memory && Object.keys(selected.memory).length}
      <div class="memory-card">
        <h3>{t("closedChats.memory")}</h3>
        {#each Object.entries(selected.memory) as [k, v]}
          {#if v}
            <div class="memory-row">
              <span class="memory-key">{k}</span>
              <span>{v}</span>
            </div>
          {/if}
        {/each}
      </div>
    {/if}

    <div class="chat-card">
      <h3>{t("closedChats.messagesTitle")}</h3>
      {#each selected.chatHistory || [] as msg}
        <ChatBubble sender={msg.role === "user" ? "user" : "bot"} message={msg.content || ""} />
      {:else}
        <p class="no-msg">{t("closedChats.noHistory")}</p>
      {/each}
    </div>
  </div>
{/if}

<style>
  .page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
  .page-header h1 { font-size: 22px; font-weight: 700; display: flex; align-items: center; gap: 8px; }
  .page-header p { font-size: 13px; color: var(--text-muted); margin-top: 2px; }

  .card {
    background: var(--bg-card); border-radius: var(--radius); box-shadow: var(--shadow); border: 1px solid var(--border-light); overflow: hidden;
  }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th { text-align: left; padding: 10px 12px; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: var(--text-muted); border-bottom: 1px solid var(--border); background: var(--bg); }
  td { padding: 10px 12px; border-bottom: 1px solid var(--border-light); color: var(--text-secondary); }
  tr:hover td { background: var(--bg-hover); }
  td:first-child { color: var(--text); font-weight: 500; }
  .empty-row { text-align: center; color: var(--text-muted); padding: 32px; }
  .mono { font-family: "JetBrains Mono", monospace; font-size: 12px; }

  .detail-view { display: flex; flex-direction: column; gap: 16px; }
  .detail-header { display: flex; align-items: center; gap: 10px; }
  .detail-header h2 { font-size: 18px; font-weight: 700; }
  .detail-meta { display: flex; gap: 16px; font-size: 12px; color: var(--text-muted); }

  .memory-card, .chat-card {
    background: var(--bg-card); border-radius: var(--radius); padding: 16px; box-shadow: var(--shadow); border: 1px solid var(--border-light);
  }
  .memory-card h3, .chat-card h3 { font-size: 13px; font-weight: 600; margin-bottom: 10px; }
  .memory-row { display: flex; justify-content: space-between; padding: 4px 0; font-size: 12px; border-bottom: 1px solid var(--border-light); }
  .memory-key { color: var(--text-muted); }
  .no-msg { text-align: center; color: var(--text-muted); font-size: 13px; padding: 20px; }
</style>

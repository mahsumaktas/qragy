<script>
  import { onMount } from "svelte";
  import { api } from "../../lib/api.js";
  import { showToast } from "../../lib/toast.svelte.js";
  import { showConfirm } from "../../lib/confirm.svelte.js";
  import Button from "../../components/ui/Button.svelte";
  import Modal from "../../components/ui/Modal.svelte";
  import Tag from "../../components/ui/Tag.svelte";
  import Badge from "../../components/ui/Badge.svelte";
  import Toggle from "../../components/ui/Toggle.svelte";
  import LoadingSpinner from "../../components/ui/LoadingSpinner.svelte";

  let loading = $state(true);
  let topics = $state([]);
  let editOpen = $state(false);
  let editTopic = $state({ title: "", description: "", keywords: [], enabled: true, requiresEscalation: false, canResolveDirectly: true, requiredInfo: [] });
  let editId = $state(null);
  let newKeyword = $state("");
  let requiredInfoText = $state("");

  onMount(() => loadTopics());

  async function loadTopics() {
    loading = true;
    try {
      const res = await api.get("admin/agent/topics");
      topics = res.topics || res || [];
    } catch (e) {
      showToast("Failed to load topics: " + e.message, "error");
    } finally {
      loading = false;
    }
  }

  function openNew() {
    editId = null;
    editTopic = { title: "", description: "", keywords: [], enabled: true, requiresEscalation: false, canResolveDirectly: true, requiredInfo: [] };
    requiredInfoText = "";
    editOpen = true;
  }

  function openEdit(t) {
    editId = t.id || t._id;
    editTopic = {
      title: t.title,
      description: t.description || "",
      keywords: [...(t.keywords || [])],
      enabled: t.enabled !== false,
      requiresEscalation: t.requiresEscalation || false,
      canResolveDirectly: t.canResolveDirectly !== false,
      requiredInfo: [...(t.requiredInfo || [])]
    };
    requiredInfoText = (t.requiredInfo || []).join(", ");
    editOpen = true;
  }

  async function save() {
    if (!editTopic.title.trim()) return;
    editTopic.requiredInfo = requiredInfoText.split(",").map(s => s.trim()).filter(Boolean);
    try {
      if (editId) {
        await api.put("admin/agent/topics/" + editId, editTopic);
        showToast("Updated", "success");
      } else {
        await api.post("admin/agent/topics", editTopic);
        showToast("Created", "success");
      }
      editOpen = false;
      await loadTopics();
    } catch (e) {
      showToast("Error: " + e.message, "error");
    }
  }

  async function deleteTopic(id) {
    const ok = await showConfirm({ title: "Delete Topic", message: "This topic will be deleted. Are you sure?", confirmText: "Delete", danger: true });
    if (!ok) return;
    try {
      await api.delete("admin/agent/topics/" + id);
      showToast("Deleted", "success");
      await loadTopics();
    } catch (e) {
      showToast("Error: " + e.message, "error");
    }
  }

  function addKeyword() {
    const kw = newKeyword.trim();
    if (kw && !editTopic.keywords.includes(kw)) {
      editTopic.keywords = [...editTopic.keywords, kw];
    }
    newKeyword = "";
  }

  function removeKeyword(kw) {
    editTopic.keywords = editTopic.keywords.filter((k) => k !== kw);
  }

  async function suggestKeywords() {
    if (!editTopic.title.trim()) return;
    try {
      const res = await api.post("admin/topics/suggest-keywords", { title: editTopic.title });
      const suggested = res.keywords || [];
      const merged = [...new Set([...editTopic.keywords, ...suggested])];
      editTopic.keywords = merged;
      showToast(suggested.length + " keywords suggested", "info");
    } catch (e) {
      showToast("Suggestion error: " + e.message, "error");
    }
  }
</script>

<div class="page-header">
  <div>
    <h1>Topics <Badge variant="blue">{topics.length}</Badge></h1>
    <p>Bot knowledge topics</p>
  </div>
  <Button onclick={openNew} variant="primary" size="sm">+ New Topic</Button>
</div>

{#if loading}
  <LoadingSpinner message="Loading..." />
{:else}
  <div class="topics-grid">
    {#each topics as t}
      <div class="topic-card">
        <div class="topic-header">
          <h3>{t.title}</h3>
          <Badge variant={t.enabled !== false ? "green" : "gray"}>{t.enabled !== false ? "active" : "inactive"}</Badge>
        </div>
        {#if t.description}
          <p class="topic-desc">{t.description}</p>
        {/if}
        <div class="topic-meta">
          {#if t.requiresEscalation}
            <Badge variant="orange">Escalation</Badge>
          {/if}
          {#if t.canResolveDirectly !== false}
            <Badge variant="blue">Direct resolution</Badge>
          {/if}
        </div>
        {#if t.requiredInfo?.length}
          <p class="topic-info">Required: {t.requiredInfo.join(", ")}</p>
        {/if}
        {#if t.keywords?.length}
          <div class="topic-tags">
            {#each t.keywords.slice(0, 5) as kw}
              <Tag>{kw}</Tag>
            {/each}
            {#if t.keywords.length > 5}
              <span class="more">+{t.keywords.length - 5}</span>
            {/if}
          </div>
        {/if}
        <div class="topic-actions">
          <Button onclick={() => openEdit(t)} variant="ghost" size="sm">Edit</Button>
          <Button onclick={() => deleteTopic(t.id || t._id)} variant="ghost" size="sm">Delete</Button>
        </div>
      </div>
    {:else}
      <div class="empty-state">No topics yet</div>
    {/each}
  </div>
{/if}

<Modal bind:open={editOpen} title={editId ? "Edit Topic" : "New Topic"}>
  <div class="form-group">
    <label>Title
      <input class="input" bind:value={editTopic.title} placeholder="Topic title" />
    </label>
  </div>
  <div class="form-group">
    <label>Description
      <textarea class="textarea" bind:value={editTopic.description} rows="3" placeholder="Topic description..."></textarea>
    </label>
  </div>
  <div class="form-group">
    <label>Keywords
      <div class="kw-input-row">
        <input class="input" bind:value={newKeyword} placeholder="Add keyword..." onkeydown={(e) => { if (e.key === "Enter") { e.preventDefault(); addKeyword(); } }} />
        <Button onclick={addKeyword} variant="secondary" size="sm">Add</Button>
        <Button onclick={suggestKeywords} variant="ghost" size="sm">AI Suggest</Button>
      </div>
    </label>
    <div class="kw-tags">
      {#each editTopic.keywords as kw}
        <Tag removable onremove={() => removeKeyword(kw)}>{kw}</Tag>
      {/each}
    </div>
  </div>
  <div class="form-group">
    <label>Required Information (comma separated)
      <input class="input" bind:value={requiredInfoText} placeholder="full name, phone, order no..." />
    </label>
  </div>
  <div class="form-row">
    <label>Requires Escalation
      <Toggle bind:checked={editTopic.requiresEscalation} />
    </label>
  </div>
  <div class="form-row">
    <label>Can Resolve Directly
      <Toggle bind:checked={editTopic.canResolveDirectly} />
    </label>
  </div>
  <div class="modal-actions">
    <Button onclick={() => (editOpen = false)} variant="secondary">Cancel</Button>
    <Button onclick={save} variant="primary">Save</Button>
  </div>
</Modal>

<style>
  .page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
  .page-header h1 { font-size: 22px; font-weight: 700; display: flex; align-items: center; gap: 8px; }
  .page-header p { font-size: 13px; color: var(--text-muted); margin-top: 2px; }

  .topics-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
  .topic-card { background: var(--bg-card); border-radius: var(--radius); padding: 16px; box-shadow: var(--shadow); border: 1px solid var(--border-light); }
  .topic-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
  .topic-header h3 { font-size: 14px; font-weight: 600; }
  .topic-desc { font-size: 12px; color: var(--text-secondary); margin-bottom: 8px; }
  .topic-meta { display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 6px; }
  .topic-info { font-size: 11px; color: var(--text-muted); margin-bottom: 6px; }
  .topic-tags { display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 10px; }
  .more { font-size: 11px; color: var(--text-muted); }
  .topic-actions { display: flex; gap: 4px; }
  .empty-state { grid-column: 1 / -1; text-align: center; padding: 40px; color: var(--text-muted); }

  .form-group { margin-bottom: 14px; }
  .form-group label { display: block; font-size: 12px; font-weight: 600; color: var(--text-secondary); margin-bottom: 4px; }
  .input { width: 100%; padding: 8px 12px; border: 1px solid var(--border); border-radius: var(--radius-sm); font-size: 13px; font-family: inherit; color: var(--text); outline: none; }
  .input:focus { border-color: var(--accent); }
  .textarea { width: 100%; padding: 8px 12px; border: 1px solid var(--border); border-radius: var(--radius-sm); font-size: 13px; font-family: inherit; color: var(--text); resize: vertical; outline: none; }
  .form-row { display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; }
  .form-row label { font-size: 12px; font-weight: 600; color: var(--text-secondary); display: flex; align-items: center; justify-content: space-between; width: 100%; }
  .kw-input-row { display: flex; gap: 8px; margin-bottom: 8px; }
  .kw-tags { display: flex; flex-wrap: wrap; gap: 4px; }
  .modal-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 16px; }

  @media (max-width: 1024px) { .topics-grid { grid-template-columns: repeat(2, 1fr); } }
  @media (max-width: 768px) { .topics-grid { grid-template-columns: 1fr; } }
</style>

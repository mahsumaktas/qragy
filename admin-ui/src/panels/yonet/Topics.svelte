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
      showToast("Konular yuklenemedi: " + e.message, "error");
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
        showToast("Guncellendi", "success");
      } else {
        await api.post("admin/agent/topics", editTopic);
        showToast("Olusturuldu", "success");
      }
      editOpen = false;
      await loadTopics();
    } catch (e) {
      showToast("Hata: " + e.message, "error");
    }
  }

  async function deleteTopic(id) {
    const ok = await showConfirm({ title: "Konuyu Sil", message: "Bu konu silinecek. Emin misiniz?", confirmText: "Sil", danger: true });
    if (!ok) return;
    try {
      await api.delete("admin/agent/topics/" + id);
      showToast("Silindi", "success");
      await loadTopics();
    } catch (e) {
      showToast("Hata: " + e.message, "error");
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
      showToast(suggested.length + " keyword onerildi", "info");
    } catch (e) {
      showToast("Oneri hatasi: " + e.message, "error");
    }
  }
</script>

<div class="page-header">
  <div>
    <h1>Konular <Badge variant="blue">{topics.length}</Badge></h1>
    <p>Bot'un bilgi konulari</p>
  </div>
  <Button onclick={openNew} variant="primary" size="sm">+ Yeni Konu</Button>
</div>

{#if loading}
  <LoadingSpinner message="Yukleniyor..." />
{:else}
  <div class="topics-grid">
    {#each topics as t}
      <div class="topic-card">
        <div class="topic-header">
          <h3>{t.title}</h3>
          <Badge variant={t.enabled !== false ? "green" : "gray"}>{t.enabled !== false ? "aktif" : "pasif"}</Badge>
        </div>
        {#if t.description}
          <p class="topic-desc">{t.description}</p>
        {/if}
        <div class="topic-meta">
          {#if t.requiresEscalation}
            <Badge variant="orange">Eskalasyon</Badge>
          {/if}
          {#if t.canResolveDirectly !== false}
            <Badge variant="blue">Dogrudan cozum</Badge>
          {/if}
        </div>
        {#if t.requiredInfo?.length}
          <p class="topic-info">Gerekli: {t.requiredInfo.join(", ")}</p>
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
          <Button onclick={() => openEdit(t)} variant="ghost" size="sm">Duzenle</Button>
          <Button onclick={() => deleteTopic(t.id || t._id)} variant="ghost" size="sm">Sil</Button>
        </div>
      </div>
    {:else}
      <div class="empty-state">Henuz konu yok</div>
    {/each}
  </div>
{/if}

<Modal bind:open={editOpen} title={editId ? "Konu Duzenle" : "Yeni Konu"}>
  <div class="form-group">
    <label>Baslik
      <input class="input" bind:value={editTopic.title} placeholder="Konu basligi" />
    </label>
  </div>
  <div class="form-group">
    <label>Aciklama
      <textarea class="textarea" bind:value={editTopic.description} rows="3" placeholder="Konu aciklamasi..."></textarea>
    </label>
  </div>
  <div class="form-group">
    <label>Anahtar Kelimeler
      <div class="kw-input-row">
        <input class="input" bind:value={newKeyword} placeholder="Kelime ekle..." onkeydown={(e) => { if (e.key === "Enter") { e.preventDefault(); addKeyword(); } }} />
        <Button onclick={addKeyword} variant="secondary" size="sm">Ekle</Button>
        <Button onclick={suggestKeywords} variant="ghost" size="sm">AI Oner</Button>
      </div>
    </label>
    <div class="kw-tags">
      {#each editTopic.keywords as kw}
        <Tag removable onremove={() => removeKeyword(kw)}>{kw}</Tag>
      {/each}
    </div>
  </div>
  <div class="form-group">
    <label>Gerekli Bilgiler (virgul ile ayirin)
      <input class="input" bind:value={requiredInfoText} placeholder="ad soyad, telefon, siparis no..." />
    </label>
  </div>
  <div class="form-row">
    <label>Eskalasyon Gerektirir
      <Toggle bind:checked={editTopic.requiresEscalation} />
    </label>
  </div>
  <div class="form-row">
    <label>Dogrudan Cozulebilir
      <Toggle bind:checked={editTopic.canResolveDirectly} />
    </label>
  </div>
  <div class="modal-actions">
    <Button onclick={() => (editOpen = false)} variant="secondary">Iptal</Button>
    <Button onclick={save} variant="primary">Kaydet</Button>
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

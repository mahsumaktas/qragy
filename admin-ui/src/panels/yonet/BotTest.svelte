<script>
  import ChatThread from "../../components/chat/ChatThread.svelte";
  import ChatInput from "../../components/chat/ChatInput.svelte";
  import Button from "../../components/ui/Button.svelte";

  let sessions = $state([{ id: 1, messages: [], sessionId: crypto.randomUUID() }]);
  let nextId = 2;

  function addSession() {
    if (sessions.length >= 4) return;
    sessions = [...sessions, { id: nextId++, messages: [], sessionId: crypto.randomUUID() }];
  }

  function removeSession(id) {
    sessions = sessions.filter((s) => s.id !== id);
  }

  async function sendMessage(session, text) {
    session.messages = [...session.messages, { role: "user", content: text, sender: "user" }];

    try {
      const res = await fetch("../api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Bypass-Tunnel-Reminder": "true" },
        body: JSON.stringify({ message: text, sessionId: session.sessionId }),
      });
      const data = await res.json();
      session.messages = [...session.messages, { role: "assistant", content: data.reply || data.message || "...", sender: "bot" }];
    } catch {
      session.messages = [...session.messages, { role: "assistant", content: "Hata olustu", sender: "system" }];
    }
  }

  function clearSession(session) {
    session.messages = [];
    session.sessionId = crypto.randomUUID();
  }
</script>

<div class="page-header">
  <div>
    <h1>Bot Test</h1>
    <p>Canli bot testi — multi-session</p>
  </div>
  <Button onclick={addSession} variant="primary" size="sm" disabled={sessions.length >= 4}>+ Oturum Ekle</Button>
</div>

<div class="test-grid" class:single={sessions.length === 1} class:double={sessions.length === 2}>
  {#each sessions as session (session.id)}
    <div class="test-card">
      <div class="test-header">
        <span class="test-label">Oturum #{session.id}</span>
        <div class="test-actions">
          <Button onclick={() => clearSession(session)} variant="ghost" size="sm">Temizle</Button>
          {#if sessions.length > 1}
            <Button onclick={() => removeSession(session.id)} variant="ghost" size="sm">Kapat</Button>
          {/if}
        </div>
      </div>
      <ChatThread messages={session.messages} />
      <ChatInput onsend={(text) => sendMessage(session, text)} />
    </div>
  {/each}
</div>

<style>
  .page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
  .page-header h1 { font-size: 22px; font-weight: 700; }
  .page-header p { font-size: 13px; color: var(--text-muted); margin-top: 2px; }

  .test-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 16px;
    height: calc(100vh - 160px);
  }
  .test-grid.single { grid-template-columns: 1fr; }

  .test-card {
    background: var(--bg-card);
    border-radius: var(--radius);
    border: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .test-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 12px;
    border-bottom: 1px solid var(--border-light);
    background: var(--bg);
    flex-shrink: 0;
  }
  .test-label { font-size: 12px; font-weight: 600; color: var(--text-muted); }
  .test-actions { display: flex; gap: 4px; }
</style>

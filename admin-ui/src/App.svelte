<script>
  import { onMount, onDestroy } from "svelte";
  import Shell from "./components/shell/Shell.svelte";
  import Toast from "./components/ui/Toast.svelte";
  import ConfirmDialog from "./components/ui/ConfirmDialog.svelte";
  import { getPanel, initRouter } from "./lib/router.svelte.js";
  import { getToken, setToken } from "./lib/auth.svelte.js";

  // Panels — Izle
  import Dashboard from "./panels/izle/Dashboard.svelte";
  import LiveChats from "./panels/izle/LiveChats.svelte";
  import ClosedChats from "./panels/izle/ClosedChats.svelte";
  import Search from "./panels/izle/Search.svelte";
  // Panels — Yonet
  import AgentInbox from "./panels/yonet/AgentInbox.svelte";
  import KnowledgeBase from "./panels/yonet/KnowledgeBase.svelte";
  import Topics from "./panels/yonet/Topics.svelte";
  import BotSettings from "./panels/yonet/BotSettings.svelte";
  import BotTest from "./panels/yonet/BotTest.svelte";
  import ChatFlow from "./panels/yonet/ChatFlow.svelte";
  // Panels — Ayarla
  import SiteSettings from "./panels/ayarla/SiteSettings.svelte";
  import Zendesk from "./panels/ayarla/Zendesk.svelte";
  import WhatsApp from "./panels/ayarla/WhatsApp.svelte";
  import Webhooks from "./panels/ayarla/Webhooks.svelte";
  import EnvVars from "./panels/ayarla/EnvVars.svelte";
  import AgentFiles from "./panels/ayarla/AgentFiles.svelte";
  import MemoryTemplates from "./panels/ayarla/MemoryTemplates.svelte";
  // Panels — Analiz
  import Analytics from "./panels/analiz/Analytics.svelte";
  import Eval from "./panels/analiz/Eval.svelte";
  import FaqSuggestions from "./panels/analiz/FaqSuggestions.svelte";
  import Feedback from "./panels/analiz/Feedback.svelte";
  import ContentGaps from "./panels/analiz/ContentGaps.svelte";
  import PromptHistory from "./panels/analiz/PromptHistory.svelte";
  import SystemStatus from "./panels/analiz/SystemStatus.svelte";

  let cleanupRouter;

  onMount(() => {
    cleanupRouter = initRouter();
  });

  onDestroy(() => {
    cleanupRouter?.();
  });

  let panel = $derived(getPanel());
</script>

{#if !getToken()}
  <div class="login-page">
    <div class="login-card">
      <div class="login-logo">Q</div>
      <h2>Qragy Admin</h2>
      <p>Devam etmek icin admin token girin.</p>
      <input
        type="password"
        class="login-input"
        placeholder="Admin Token"
        onkeydown={(e) => {
          if (e.key === "Enter" && e.target.value.trim()) {
            setToken(e.target.value);
            window.location.reload();
          }
        }}
      />
      <button
        class="login-btn"
        onclick={() => {
          const inp = document.querySelector(".login-input");
          if (inp?.value.trim()) {
            setToken(inp.value);
            window.location.reload();
          }
        }}
      >Giris Yap</button>
    </div>
  </div>
{:else}
<Shell>
  {#if panel === "dashboard"}
    <Dashboard />
  {:else if panel === "live-chats"}
    <LiveChats />
  {:else if panel === "closed-chats"}
    <ClosedChats />
  {:else if panel === "search"}
    <Search />
  {:else if panel === "agent-inbox"}
    <AgentInbox />
  {:else if panel === "knowledge-base"}
    <KnowledgeBase />
  {:else if panel === "topics"}
    <Topics />
  {:else if panel === "bot-settings"}
    <BotSettings />
  {:else if panel === "bot-test"}
    <BotTest />
  {:else if panel === "chat-flow"}
    <ChatFlow />
  {:else if panel === "site-settings"}
    <SiteSettings />
  {:else if panel === "zendesk"}
    <Zendesk />
  {:else if panel === "whatsapp"}
    <WhatsApp />
  {:else if panel === "webhooks"}
    <Webhooks />
  {:else if panel === "env-vars"}
    <EnvVars />
  {:else if panel === "agent-files"}
    <AgentFiles />
  {:else if panel === "memory-templates"}
    <MemoryTemplates />
  {:else if panel === "analytics"}
    <Analytics />
  {:else if panel === "eval"}
    <Eval />
  {:else if panel === "faq-suggestions"}
    <FaqSuggestions />
  {:else if panel === "feedback"}
    <Feedback />
  {:else if panel === "content-gaps"}
    <ContentGaps />
  {:else if panel === "prompt-history"}
    <PromptHistory />
  {:else if panel === "system-status"}
    <SystemStatus />
  {:else}
    <div class="coming-soon">
      <div class="coming-soon-icon">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="8" rx="2" ry="2"/><rect x="2" y="14" width="20" height="8" rx="2" ry="2"/><line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/></svg>
      </div>
      <h2>Yapilandiriliyor</h2>
      <p><strong>{panel}</strong> paneli henuz hazir degil.</p>
    </div>
  {/if}
</Shell>
{/if}

<Toast />
<ConfirmDialog />

<style>
  .login-page {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100vh;
    background: var(--bg, #0f1117);
    font-family: "Inter", -apple-system, sans-serif;
  }

  .login-card {
    background: var(--bg-card, #1a1b23);
    border-radius: 12px;
    padding: 40px 36px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
    border: 1px solid var(--border, #2a2b35);
    width: 380px;
    text-align: center;
  }
  .login-logo {
    width: 48px;
    height: 48px;
    border-radius: 12px;
    background: var(--accent, #2563eb);
    color: #fff;
    font-size: 22px;
    font-weight: 800;
    display: flex;
    align-items: center;
    justify-content: center;
    margin: 0 auto 16px;
  }
  .login-card h2 {
    font-size: 20px;
    font-weight: 700;
    margin-bottom: 6px;
    color: var(--text, #e5e7eb);
  }
  .login-card p {
    font-size: 13px;
    color: var(--text-muted, #6b7280);
    margin-bottom: 24px;
  }

  .login-input {
    width: 100%;
    padding: 11px 14px;
    border: 1px solid var(--border, #2a2b35);
    border-radius: 8px;
    font-size: 14px;
    color: var(--text, #e5e7eb);
    font-family: inherit;
    background: var(--bg, #0f1117);
    outline: none;
    transition: border 0.15s;
    box-sizing: border-box;
    margin-bottom: 12px;
  }
  .login-input:focus {
    border-color: var(--accent, #2563eb);
    box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.15);
  }

  .login-btn {
    width: 100%;
    padding: 11px;
    border: none;
    border-radius: 8px;
    background: var(--accent, #2563eb);
    color: #fff;
    font-size: 14px;
    font-weight: 600;
    font-family: inherit;
    cursor: pointer;
    transition: opacity 0.15s;
  }
  .login-btn:hover {
    opacity: 0.9;
  }

  .coming-soon {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 60%;
    text-align: center;
    color: var(--text-muted);
  }
  .coming-soon-icon {
    margin-bottom: 16px;
    opacity: 0.4;
  }
  .coming-soon h2 {
    font-size: 18px;
    font-weight: 600;
    color: var(--text-secondary);
    margin-bottom: 4px;
  }
  .coming-soon p {
    font-size: 13px;
  }
</style>

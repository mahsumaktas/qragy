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

<Shell>
  {#if !getToken()}
    <div class="login-prompt">
      <div class="login-card">
        <h2>Admin Giris</h2>
        <p>Devam etmek icin admin token girin.</p>
        <input
          type="password"
          class="input"
          placeholder="Admin Token"
          onchange={(e) => {
            setToken(e.target.value);
            window.location.reload();
          }}
        />
      </div>
    </div>
  {:else if panel === "dashboard"}
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

<Toast />
<ConfirmDialog />

<style>
  .login-prompt {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
  }

  .login-card {
    background: var(--bg-card);
    border-radius: var(--radius);
    padding: 32px;
    box-shadow: var(--shadow-md);
    border: 1px solid var(--border);
    width: 380px;
    text-align: center;
  }
  .login-card h2 {
    font-size: 18px;
    font-weight: 700;
    margin-bottom: 8px;
  }
  .login-card p {
    font-size: 13px;
    color: var(--text-muted);
    margin-bottom: 20px;
  }

  .input {
    width: 100%;
    padding: 10px 14px;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    font-size: 14px;
    color: var(--text);
    font-family: inherit;
    background: var(--bg-card);
    outline: none;
    transition: border 0.15s;
  }
  .input:focus {
    border-color: var(--accent);
    box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
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

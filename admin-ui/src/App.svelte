<script>
  import { onMount, onDestroy } from "svelte";
  import Shell from "./components/shell/Shell.svelte";
  import AdminAssistant from "./components/shell/AdminAssistant.svelte";
  import Toast from "./components/ui/Toast.svelte";
  import ConfirmDialog from "./components/ui/ConfirmDialog.svelte";
  import { api } from "./lib/api.js";
  import { getPanel, initRouter } from "./lib/router.svelte.js";
  import { getToken, setToken } from "./lib/auth.svelte.js";
  import { t } from "./lib/i18n.svelte.js";

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
  // Panels — Analiz
  import Analytics from "./panels/analiz/Analytics.svelte";
  import Eval from "./panels/analiz/Eval.svelte";
  import FaqSuggestions from "./panels/analiz/FaqSuggestions.svelte";
  import Feedback from "./panels/analiz/Feedback.svelte";
  import ContentGaps from "./panels/analiz/ContentGaps.svelte";
  import PromptHistory from "./panels/analiz/PromptHistory.svelte";
  import SystemStatus from "./panels/analiz/SystemStatus.svelte";

  let cleanupRouter;
  let authState = $state({
    checking: true,
    authenticated: false,
    ssoAvailable: false,
    candidateEmail: "",
    errorCode: "",
    bootError: "",
  });

  const LOGIN_ERROR_KEYS = {
    workspace_access_denied: "login.errorAccessDenied",
    cf_email_mismatch: "login.errorSsoMismatch",
    invalid_cf_token: "login.errorSsoToken",
    missing_cf_headers: "login.errorMissingSso",
    sso_not_configured: "login.errorSsoUnavailable",
    workspace_authz_failed: "login.errorWorkspaceCheck",
    login_failed: "login.errorGeneric",
  };

  const SSO_SKIP_KEY = "qragy-admin-sso-skip";

  function isCorpCxAdminPath() {
    return typeof window !== "undefined" && window.location.pathname.startsWith("/corpcx/admin");
  }

  function hasSsoSkip() {
    if (typeof window === "undefined") return false;
    return window.sessionStorage.getItem(SSO_SKIP_KEY) === "1";
  }

  function clearSsoSkip() {
    if (typeof window === "undefined") return;
    window.sessionStorage.removeItem(SSO_SKIP_KEY);
  }

  function currentRedirectPath() {
    if (typeof window === "undefined") return "/corpcx/admin/";
    return `${window.location.pathname}${window.location.search}${window.location.hash}`;
  }

  async function bootstrapAuth() {
    if (getToken()) {
      authState = { ...authState, checking: false, authenticated: true };
      return;
    }

    const params = new URLSearchParams(window.location.search);
    const errorCode = params.get("auth_error") || "";

    try {
      const session = await api.get("admin/session");
      authState = {
        checking: false,
        authenticated: Boolean(session?.authenticated),
        ssoAvailable: Boolean(session?.ssoAvailable),
        candidateEmail: session?.candidateEmail || session?.user?.email || "",
        errorCode,
        bootError: "",
      };
      if (session?.authenticated) {
        clearSsoSkip();
      }
    } catch (error) {
      authState = {
        checking: false,
        authenticated: false,
        ssoAvailable: false,
        candidateEmail: "",
        errorCode,
        bootError: error?.message || "",
      };
    }
  }

  function startSsoLogin() {
    clearSsoSkip();
    const redirect = encodeURIComponent(currentRedirectPath());
    window.location.href = `../api/admin/sso/login?redirect=${redirect}`;
  }

  function getLoginErrorMessage() {
    if (authState.errorCode && LOGIN_ERROR_KEYS[authState.errorCode]) {
      return t(LOGIN_ERROR_KEYS[authState.errorCode]);
    }
    if (authState.bootError) {
      return authState.bootError;
    }
    return "";
  }

  onMount(() => {
    cleanupRouter = initRouter();
    bootstrapAuth();
  });

  $effect(() => {
    if (authState.checking || authState.authenticated || getToken()) return;
    if (!authState.ssoAvailable || authState.errorCode || authState.bootError) return;
    if (!isCorpCxAdminPath() || hasSsoSkip()) return;
    startSsoLogin();
  });

  onDestroy(() => {
    cleanupRouter?.();
  });

  let panel = $derived(getPanel());
  let hasAccess = $derived(Boolean(getToken()) || Boolean(authState.authenticated));
  let loginErrorMessage = $derived(getLoginErrorMessage());
</script>

{#if authState.checking}
  <div class="login-page">
    <div class="login-card">
      <div class="login-logo">Q</div>
      <h2>{t("login.title")}</h2>
      <p>{t("common.loading")}</p>
    </div>
  </div>
{:else if !hasAccess}
  <div class="login-page">
    <div class="login-card">
      <div class="login-logo">Q</div>
      <h2>{t("login.title")}</h2>
      <p>{t("login.subtitle")}</p>
      {#if loginErrorMessage}
        <div class="login-error">{loginErrorMessage}</div>
      {/if}
      {#if authState.ssoAvailable}
        <button class="login-sso-btn" onclick={startSsoLogin}>{t("login.ssoButton")}</button>
        <p class="login-note">
          {t("login.ssoHint", {
            email: authState.candidateEmail || t("login.currentAccount"),
          })}
        </p>
        <div class="login-divider">{t("login.orFallback")}</div>
      {/if}
      <input
        type="password"
        class="login-input"
        placeholder={t("login.placeholder")}
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
      >{t("login.button")}</button>
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
      <h2>{t("common.underConstruction")}</h2>
      <p>{t("common.panelNotReady", { panel })}</p>
    </div>
  {/if}
</Shell>
  <AdminAssistant />
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

  .login-error {
    margin-bottom: 14px;
    padding: 10px 12px;
    border-radius: 8px;
    background: rgba(185, 28, 28, 0.08);
    border: 1px solid rgba(185, 28, 28, 0.2);
    color: #fecaca;
    font-size: 13px;
    text-align: left;
  }

  .login-sso-btn {
    width: 100%;
    padding: 11px;
    border: 1px solid var(--border, #2a2b35);
    border-radius: 8px;
    background: #111827;
    color: #f9fafb;
    font-size: 14px;
    font-weight: 600;
    font-family: inherit;
    cursor: pointer;
    transition: opacity 0.15s, border-color 0.15s;
    margin-bottom: 10px;
  }

  .login-sso-btn:hover {
    opacity: 0.94;
    border-color: var(--accent, #2563eb);
  }

  .login-note {
    margin: 0 0 16px;
    font-size: 12px;
    color: var(--text-muted, #9ca3af);
  }

  .login-divider {
    margin: 0 0 14px;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--text-muted, #6b7280);
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

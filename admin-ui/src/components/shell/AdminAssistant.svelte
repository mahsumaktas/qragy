<script>
  import { tick } from "svelte";
  import { getToken } from "../../lib/auth.svelte.js";
  import { getLocale, t } from "../../lib/i18n.svelte.js";
  import { getPanel } from "../../lib/router.svelte.js";
  import { getAssistantContext, openCopilotRequest } from "../../lib/copilotBridge.svelte.js";

  let open = $state(false);
  let sending = $state(false);
  let input = $state("");
  let file = $state(null);
  let messages = $state([]);
  let history = $state([]);
  let messageSeq = 0;
  let scrollEl = $state(null);
  let starterPrompts = $derived([
    t("assistant.suggestionKb"),
    t("assistant.suggestionTopics"),
    t("assistant.suggestionBot"),
    t("assistant.suggestionCoverage"),
  ]);

  function nextId() {
    messageSeq += 1;
    return messageSeq;
  }

  async function scrollToBottom() {
    await tick();
    if (scrollEl) {
      scrollEl.scrollTop = scrollEl.scrollHeight;
    }
  }

  function appendMessage(message) {
    messages = [...messages, { id: nextId(), ...message }];
    scrollToBottom();
  }

  function setMessagePatch(id, patch) {
    messages = messages.map((message) => (
      message.id === id ? { ...message, ...patch } : message
    ));
  }

  function buildHeaders() {
    const headers = { "Bypass-Tunnel-Reminder": "true" };
    const token = getToken();
    if (token) headers["x-admin-token"] = token;
    return headers;
  }

  async function sendRequest({ message, displayMessage, pendingActions = null, upload = null }) {
    const trimmedMessage = (message || "").trim();
    if (!trimmedMessage && !upload && !pendingActions) return;

    if (displayMessage) {
      appendMessage({ role: "user", text: displayMessage });
    }

    history = [
      ...history,
      { role: "user", content: trimmedMessage || (upload ? "(file uploaded)" : displayMessage || "") },
    ];

    const loadingId = nextId();
    messages = [...messages, { id: loadingId, role: "loading", text: t("assistant.thinking") }];
    await scrollToBottom();

    sending = true;

    try {
      const formData = new FormData();
      formData.append("message", trimmedMessage);
      formData.append("history", JSON.stringify(history.slice(-10)));
      const panel = getPanel();
      formData.append("panel", panel);
      formData.append("locale", getLocale());
      const context = getAssistantContext();
      if (context?.panel === panel && context?.selection) {
        formData.append("selection", JSON.stringify(context.selection));
      }
      if (pendingActions) {
        formData.append("pendingActions", JSON.stringify(pendingActions));
      }
      if (upload) {
        formData.append("file", upload);
      }

      const response = await fetch("../api/admin/assistant", {
        method: "POST",
        headers: buildHeaders(),
        body: formData,
      });
      const payload = await response.json().catch(() => ({}));

      messages = messages.filter((messageItem) => messageItem.id !== loadingId);

      if (!response.ok || payload?.error) {
        appendMessage({
          role: "assistant",
          text: t("assistant.error", { msg: payload?.error || ("HTTP " + response.status) }),
        });
        return;
      }

      const reply = payload.reply || "";
      if (payload.copilot_request) {
        openCopilotRequest(payload.copilot_request);
      }
      appendMessage({
        role: "assistant",
        text: reply,
        actions: payload.actions_executed || [],
        pendingActions: payload.pending_actions || null,
      });
      history = [...history, { role: "assistant", content: reply }];
    } catch (error) {
      messages = messages.filter((messageItem) => messageItem.id !== loadingId);
      appendMessage({ role: "assistant", text: t("assistant.error", { msg: error.message }) });
    } finally {
      sending = false;
      await tick();
      const inputEl = document.querySelector(".assistant-input");
      inputEl?.focus();
    }
  }

  async function sendMessage() {
    const trimmed = input.trim();
    const selectedFile = file;
    if (!trimmed && !selectedFile) return;

    const displayMessage = trimmed || "";
    const fileLabel = selectedFile ? `[${selectedFile.name}]` : "";
    input = "";
    file = null;

    await sendRequest({
      message: trimmed,
      displayMessage: [displayMessage, fileLabel].filter(Boolean).join(" ").trim(),
      upload: selectedFile,
    });
  }

  async function sendPreset(prompt) {
    if (sending) return;
    input = "";
    file = null;
    await sendRequest({ message: prompt, displayMessage: prompt });
  }

  async function confirmActions(messageId, pendingActions) {
    setMessagePatch(messageId, { pendingActions: null, pendingResolved: true });
    await sendRequest({
      message: "__confirm_actions__",
      displayMessage: t("assistant.confirmed"),
      pendingActions,
    });
  }

  async function cancelActions(messageId) {
    setMessagePatch(messageId, { pendingActions: null, pendingResolved: true });
    await sendRequest({
      message: "__cancel_actions__",
      displayMessage: t("assistant.cancelled"),
    });
  }

  function onKeydown(event) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      sendMessage();
    }
  }
</script>

<div class="assistant-root">
  {#if open}
    <div class="assistant-panel">
      <div class="assistant-header">
        <div>
          <div class="assistant-title">{t("assistant.title")}</div>
          <div class="assistant-subtitle">{t("assistant.subtitle")}</div>
        </div>
        <button class="assistant-close" onclick={() => (open = false)} aria-label={t("common.close")}>×</button>
      </div>

      <div class="assistant-messages" bind:this={scrollEl}>
        {#if !messages.length}
          <div class="assistant-empty">
            <div>{t("assistant.empty")}</div>
            <div class="assistant-starters">
              {#each starterPrompts as prompt}
                <button class="starter-chip" onclick={() => sendPreset(prompt)} disabled={sending}>
                  {prompt}
                </button>
              {/each}
            </div>
          </div>
        {/if}

        {#each messages as message}
          <div class:message-row={true} class:user={message.role === "user"} class:assistant={message.role === "assistant"} class:loading={message.role === "loading"}>
            <div class="bubble">
              <div class="bubble-text">{message.text}</div>

              {#if message.actions?.length}
                <div class="action-list">
                  {#each message.actions as action}
                    <div class:action-pill={true} class:success={action.status === "success"} class:error={action.status !== "success"}>
                      {action.status === "success" ? "✓" : "×"} {action.result || action.action}
                    </div>
                  {/each}
                </div>
              {/if}

              {#if message.pendingActions?.length}
                <div class="pending-box">
                  <div class="pending-label">{t("assistant.pending")}</div>
                  <ul>
                    {#each message.pendingActions as action}
                      <li>{action.action}{action.params?.filename ? ` (${action.params.filename})` : ""}</li>
                    {/each}
                  </ul>
                  <div class="pending-actions">
                    <button class="btn-confirm" disabled={sending} onclick={() => confirmActions(message.id, message.pendingActions)}>{t("assistant.confirm")}</button>
                    <button class="btn-cancel" disabled={sending} onclick={() => cancelActions(message.id)}>{t("assistant.cancel")}</button>
                  </div>
                </div>
              {/if}
            </div>
          </div>
        {/each}
      </div>

      {#if file}
        <div class="assistant-file">
          <span>{file.name}</span>
          <button onclick={() => (file = null)} aria-label={t("common.delete")}>×</button>
        </div>
      {/if}

      <div class="assistant-input-row">
        <label class="file-btn" title={t("assistant.attach")}>
          +
          <input
            type="file"
            hidden
            accept=".txt,.pdf,.docx,.xlsx,.xls"
            onchange={(event) => {
              file = event.currentTarget.files?.[0] || null;
            }}
          />
        </label>
        <input
          class="assistant-input"
          bind:value={input}
          placeholder={t("assistant.placeholder")}
          onkeydown={onKeydown}
          disabled={sending}
        />
        <button class="send-btn" onclick={sendMessage} disabled={sending}>{t("assistant.send")}</button>
      </div>
    </div>
  {/if}

  <button class="assistant-toggle" onclick={() => (open = !open)} aria-label={t("assistant.title")}>
    AI
  </button>
</div>

<style>
  .assistant-root {
    position: fixed;
    right: 20px;
    bottom: 20px;
    z-index: 9500;
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 12px;
  }

  .assistant-toggle {
    width: 56px;
    height: 56px;
    border: none;
    border-radius: 50%;
    background: linear-gradient(135deg, var(--accent), #0f7ae5);
    color: #fff;
    font-weight: 800;
    letter-spacing: 0.03em;
    box-shadow: 0 12px 30px rgba(37, 99, 235, 0.28);
    cursor: pointer;
  }

  .assistant-panel {
    width: min(420px, calc(100vw - 32px));
    height: min(560px, calc(100vh - 110px));
    display: flex;
    flex-direction: column;
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: 18px;
    box-shadow: 0 18px 50px rgba(17, 24, 39, 0.18);
    overflow: hidden;
  }

  .assistant-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 16px;
    border-bottom: 1px solid var(--border);
    background: linear-gradient(180deg, #ffffff, #f8fafc);
  }

  .assistant-title {
    font-size: 14px;
    font-weight: 700;
    color: var(--text);
  }

  .assistant-subtitle {
    font-size: 12px;
    color: var(--text-muted);
  }

  .assistant-close {
    width: 32px;
    height: 32px;
    border: none;
    border-radius: 50%;
    background: var(--bg-hover);
    color: var(--text-secondary);
    cursor: pointer;
  }

  .assistant-messages {
    flex: 1;
    overflow-y: auto;
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    background:
      radial-gradient(circle at top right, rgba(37, 99, 235, 0.06), transparent 28%),
      linear-gradient(180deg, #f8fafc 0%, #f3f4f6 100%);
  }

  .assistant-empty {
    margin: auto;
    color: var(--text-muted);
    font-size: 13px;
    text-align: center;
    max-width: 280px;
    display: grid;
    gap: 12px;
  }

  .assistant-starters {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    justify-content: center;
  }

  .starter-chip {
    border: 1px solid rgba(37, 99, 235, 0.18);
    background: rgba(37, 99, 235, 0.06);
    color: var(--text);
    border-radius: 999px;
    padding: 8px 12px;
    font-size: 12px;
    line-height: 1.2;
    cursor: pointer;
    transition: background 0.15s ease, border-color 0.15s ease, transform 0.15s ease;
  }

  .starter-chip:hover {
    background: rgba(37, 99, 235, 0.11);
    border-color: rgba(37, 99, 235, 0.28);
    transform: translateY(-1px);
  }

  .starter-chip:disabled {
    opacity: 0.6;
    cursor: not-allowed;
    transform: none;
  }

  .message-row {
    display: flex;
  }

  .message-row.user {
    justify-content: flex-end;
  }

  .message-row.assistant,
  .message-row.loading {
    justify-content: flex-start;
  }

  .bubble {
    max-width: 88%;
    padding: 12px 14px;
    border-radius: 16px;
    background: #fff;
    color: var(--text);
    border: 1px solid rgba(148, 163, 184, 0.18);
    box-shadow: var(--shadow-sm);
  }

  .message-row.user .bubble {
    background: var(--accent);
    color: #fff;
    border-color: transparent;
  }

  .message-row.loading .bubble {
    color: var(--text-muted);
  }

  .bubble-text {
    white-space: pre-wrap;
    word-break: break-word;
    font-size: 13px;
  }

  .action-list {
    margin-top: 10px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .action-pill {
    padding: 7px 9px;
    border-radius: 999px;
    font-size: 11px;
    line-height: 1.3;
  }

  .action-pill.success {
    background: #dcfce7;
    color: #166534;
  }

  .action-pill.error {
    background: #fee2e2;
    color: #991b1b;
  }

  .pending-box {
    margin-top: 12px;
    padding-top: 10px;
    border-top: 1px dashed var(--border);
  }

  .pending-label {
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--text-muted);
    margin-bottom: 8px;
  }

  .pending-box ul {
    margin-left: 16px;
    color: var(--text-secondary);
    font-size: 12px;
  }

  .pending-actions {
    display: flex;
    gap: 8px;
    margin-top: 10px;
  }

  .btn-confirm,
  .btn-cancel,
  .send-btn,
  .file-btn {
    border: none;
    border-radius: 10px;
    cursor: pointer;
    font: inherit;
  }

  .btn-confirm {
    background: #16a34a;
    color: #fff;
    padding: 8px 12px;
  }

  .btn-cancel {
    background: #e5e7eb;
    color: var(--text);
    padding: 8px 12px;
  }

  .assistant-file {
    margin: 0 16px 12px;
    padding: 8px 12px;
    border-radius: 12px;
    background: var(--accent-light);
    color: var(--text-secondary);
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    font-size: 12px;
  }

  .assistant-file button {
    border: none;
    background: transparent;
    color: var(--text-secondary);
    cursor: pointer;
  }

  .assistant-input-row {
    display: flex;
    gap: 10px;
    align-items: center;
    padding: 14px 16px 16px;
    border-top: 1px solid var(--border);
    background: #fff;
  }

  .file-btn {
    width: 40px;
    height: 40px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: var(--bg-hover);
    color: var(--text-secondary);
    font-size: 20px;
    flex-shrink: 0;
  }

  .assistant-input {
    flex: 1;
    min-width: 0;
    height: 40px;
    padding: 0 12px;
    border-radius: 10px;
    border: 1px solid var(--border);
    font: inherit;
    color: var(--text);
    background: var(--bg);
  }

  .send-btn {
    height: 40px;
    padding: 0 14px;
    background: var(--accent);
    color: #fff;
    font-weight: 600;
  }

  .send-btn:disabled,
  .btn-confirm:disabled,
  .btn-cancel:disabled,
  .assistant-input:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  @media (max-width: 768px) {
    .assistant-root {
      right: 14px;
      bottom: 14px;
    }

    .assistant-panel {
      width: min(100vw - 20px, 420px);
      height: min(70vh, 520px);
    }
  }
</style>

<script lang="ts">
  import { DEFAULT_WORKSPACE_SESSION_NAME, isDefaultWorkspaceSessionName } from "@sonik-agent-ui/workspace-session";
  import { tick } from "svelte";
  interface WorkspaceSessionSummary {
    id: string;
    name: string;
    mode: "chat" | "artifact" | "document" | "research";
    message_count: number;
    updated_at: string;
    last_message_at: string | null;
  }

  interface Props {
    sessions: WorkspaceSessionSummary[];
    currentSession: WorkspaceSessionSummary | null;
    activeSessionId: string | null;
    busy?: boolean;
    error?: string | null;
    onCreate: () => void;
    onSwitch: (sessionId: string) => void;
    onArchive: (sessionId: string) => void;
    onDelete: (sessionId: string) => void;
  }

  let {
    sessions,
    currentSession,
    activeSessionId,
    busy = false,
    error = null,
    onCreate,
    onSwitch,
    onArchive,
    onDelete,
  }: Props = $props();

  let contextMenu = $state<{ sessionId: string; sessionName: string; x: number; y: number } | null>(null);
  let contextMenuElement = $state<HTMLDivElement | null>(null);
  let contextMenuTrigger: HTMLElement | null = null;

  function displaySessionName(session: WorkspaceSessionSummary | null): string {
    if (!session) return DEFAULT_WORKSPACE_SESSION_NAME;
    return isDefaultWorkspaceSessionName(session.name) ? DEFAULT_WORKSPACE_SESSION_NAME : session.name.trim();
  }

  function sessionKind(session: WorkspaceSessionSummary): string {
    if (session.mode === "artifact") return "Live artifact";
    if (session.mode === "document") return "Document";
    if (session.mode === "research") return "Research";
    return "Chat";
  }

  function formatSessionTime(value: string | null): string {
    if (!value) return "No messages yet";
    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(value));
  }

  function openContextMenu(event: MouseEvent, session: WorkspaceSessionSummary): void {
    event.preventDefault();
    if (busy) return;
    contextMenuTrigger = event.currentTarget instanceof HTMLElement ? event.currentTarget : null;
    contextMenu = {
      sessionId: session.id,
      sessionName: displaySessionName(session),
      x: event.clientX,
      y: event.clientY,
    };
    void focusContextMenu();
  }

  function openActionMenu(event: MouseEvent, session: WorkspaceSessionSummary): void {
    event.preventDefault();
    event.stopPropagation();
    if (busy) return;
    const trigger = event.currentTarget instanceof HTMLElement ? event.currentTarget : null;
    const rect = trigger?.getBoundingClientRect();
    contextMenuTrigger = trigger;
    contextMenu = {
      sessionId: session.id,
      sessionName: displaySessionName(session),
      x: rect ? rect.right - 190 : event.clientX,
      y: rect ? rect.bottom + 4 : event.clientY,
    };
    void focusContextMenu();
  }

  async function focusContextMenu(): Promise<void> {
    await tick();
    contextMenuElement?.querySelector("button")?.focus();
  }

  function closeContextMenu(restoreFocus = false): void {
    contextMenu = null;
    if (restoreFocus) contextMenuTrigger?.focus();
    contextMenuTrigger = null;
  }

  function archiveContextSession(): void {
    if (!contextMenu) return;
    const sessionId = contextMenu.sessionId;
    closeContextMenu(true);
    onArchive(sessionId);
  }

  function deleteContextSession(): void {
    if (!contextMenu) return;
    const sessionId = contextMenu.sessionId;
    closeContextMenu(true);
    onDelete(sessionId);
  }
</script>

<div class="session-rail-shell" onclick={() => closeContextMenu()} role="presentation">
  <div class="session-rail-header">
    <div>
      <p class="session-rail-eyebrow">Recents</p>
      <h2>Chats</h2>
    </div>
    <button type="button" class="new-chat-button" onclick={onCreate} disabled={busy}>+ New chat</button>
  </div>

  {#if error}
    <p class="session-rail-error">{error}</p>
  {/if}

  <div class="session-rail-list" aria-busy={busy}>
    {#each sessions as session (session.id)}
      <article class:active-session={session.id === activeSessionId} oncontextmenu={(event) => openContextMenu(event, session)}>
        <button
          type="button"
          class="session-select"
          onclick={() => onSwitch(session.id)}
          disabled={busy || session.id === activeSessionId}
          title={`${displaySessionName(session)} · ${sessionKind(session)}`}
        >
          <span>{displaySessionName(session)}</span>
          <small>{formatSessionTime(session.last_message_at ?? session.updated_at)}</small>
        </button>
        <button
          type="button"
          class="session-actions-button"
          aria-haspopup="menu"
          aria-expanded={contextMenu?.sessionId === session.id}
          aria-label={`Actions for ${displaySessionName(session)}`}
          onclick={(event) => openActionMenu(event, session)}
          disabled={busy}
        >
          ⋯
        </button>
      </article>
    {:else}
      <p class="session-empty">No chats yet. Start one when you are ready.</p>
    {/each}
  </div>

  {#if currentSession}
    <footer>
      <span>Current chat</span>
      <strong>{displaySessionName(currentSession)}</strong>
    </footer>
  {/if}

  {#if contextMenu}
    <div
      bind:this={contextMenuElement}
      class="session-context-menu"
      style={`left: ${contextMenu.x}px; top: ${contextMenu.y}px;`}
      role="menu"
      tabindex="-1"
      aria-label={`Actions for ${contextMenu.sessionName}`}
      onclick={(event) => event.stopPropagation()}
      onkeydown={(event) => {
        if (event.key === "Escape") closeContextMenu(true);
      }}
    >
      <p>{contextMenu.sessionName}</p>
      <button type="button" role="menuitem" onclick={archiveContextSession} disabled={busy}>Archive chat</button>
      <button type="button" role="menuitem" class="danger-action" onclick={deleteContextSession} disabled={busy}>Delete chat</button>
    </div>
  {/if}
</div>

<style>
  .session-rail-shell {
    position: relative;
    display: flex;
    height: 100%;
    min-height: 0;
    flex-direction: column;
    gap: 0.7rem;
    padding: 0.7rem;
    color: #332f2a;
  }

  .session-rail-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
  }

  .session-rail-header h2 {
    margin: 0;
    font-size: 0.96rem;
    line-height: 1.2;
  }

  .session-rail-eyebrow {
    margin: 0 0 0.12rem;
    color: #8a8174;
    font-size: 0.66rem;
    font-weight: 800;
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }

  .new-chat-button {
    border: 1px solid #ded6ca;
    border-radius: 999px;
    background: #fffdf8;
    color: #332f2a;
    cursor: pointer;
    font: inherit;
    padding: 0.42rem 0.7rem;
    font-size: 0.76rem;
    font-weight: 800;
    transition:
      background 0.15s ease,
      border-color 0.15s ease,
      color 0.15s ease;
  }

  .new-chat-button:hover {
    border-color: #c9bbaa;
    background: #f8f2e9;
  }

  .new-chat-button:disabled,
  .session-select:disabled,
  .session-actions-button:disabled,
  .session-context-menu button:disabled {
    cursor: wait;
    opacity: 0.55;
  }

  .session-rail-error {
    margin: 0;
    border: 1px solid color-mix(in srgb, #ef4444 55%, #ded6ca);
    border-radius: 0.75rem;
    padding: 0.6rem;
    background: #fff7f7;
    color: #b42318;
    font-size: 0.75rem;
  }

  .session-rail-list {
    display: flex;
    min-height: 0;
    flex: 1;
    flex-direction: column;
    gap: 0.12rem;
    overflow: auto;
    padding-right: 0.1rem;
  }

  .session-rail-list article {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    border-radius: 0.6rem;
  }

  .session-rail-list article:hover {
    background: #f3ede3;
  }

  .session-rail-list article.active-session {
    background: #fffdf8;
    box-shadow: inset 0 0 0 1px #ded6ca;
  }

  .session-select {
    display: grid;
    width: 100%;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 0.5rem;
    border: 0;
    border-radius: 0.6rem;
    background: transparent;
    color: inherit;
    cursor: pointer;
    padding: 0.46rem 0.55rem;
    text-align: left;
  }

  .session-select span {
    overflow: hidden;
    font-size: 0.83rem;
    font-weight: 750;
    line-height: 1.2;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .session-actions-button {
    width: 1.85rem;
    height: 1.85rem;
    margin-right: 0.18rem;
    border: 0;
    border-radius: 999px;
    background: transparent;
    color: #8a8174;
    cursor: pointer;
    font: inherit;
    font-size: 1.05rem;
    line-height: 1;
    opacity: 0.75;
  }

  .session-actions-button:hover,
  .session-actions-button:focus-visible {
    background: #eee8dd;
    color: #332f2a;
    opacity: 1;
  }

  .session-select small,
  footer,
  .session-empty {
    color: #8a8174;
    font-size: 0.7rem;
  }

  .session-empty {
    margin: 0;
    border: 1px dashed #d8d0c4;
    border-radius: 0.85rem;
    padding: 0.8rem;
  }

  footer {
    display: grid;
    gap: 0.2rem;
    border-top: 1px solid #ded6ca;
    padding-top: 0.75rem;
  }

  footer strong {
    overflow: hidden;
    color: #332f2a;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .session-context-menu {
    position: fixed;
    z-index: 80;
    display: grid;
    min-width: 12rem;
    gap: 0.18rem;
    border: 1px solid #d8d0c4;
    border-radius: 0.85rem;
    padding: 0.32rem;
    background: #fffdf8;
    box-shadow: 0 18px 50px rgb(45 38 28 / 18%);
  }

  .session-context-menu p {
    overflow: hidden;
    margin: 0;
    padding: 0.45rem 0.55rem 0.3rem;
    color: #8a8174;
    font-size: 0.7rem;
    font-weight: 800;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .session-context-menu button {
    border: 0;
    border-radius: 0.58rem;
    background: transparent;
    color: #332f2a;
    cursor: pointer;
    font: inherit;
    padding: 0.48rem 0.55rem;
    text-align: left;
  }

  .session-context-menu button:hover {
    background: #f3ede3;
  }

  .session-context-menu .danger-action {
    color: #b42318;
  }
</style>

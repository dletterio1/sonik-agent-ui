<script lang="ts">
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
  }: Props = $props();

  function displaySessionName(session: WorkspaceSessionSummary | null): string {
    if (!session) return "New chat";
    const name = session.name.trim();
    if (!name || name === "Sonik workspace") return "New chat";
    return name;
  }

  function sessionKind(session: WorkspaceSessionSummary): string {
    if (session.mode === "artifact") return "Live artifact";
    if (session.mode === "document") return "Document";
    if (session.mode === "research") return "Research";
    return "Chat";
  }

  function messageCountLabel(count: number): string {
    return count === 1 ? "1 message" : `${count} messages`;
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
</script>

<div class="session-rail-shell">
  <div class="mode-switch" aria-label="Workspace mode">
    <span class="mode-pill mode-pill--active">Chat</span>
    <span class="mode-pill" title="Live artifact workspaces will graduate into this lane">Workspaces</span>
  </div>

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
      <article class:active-session={session.id === activeSessionId}>
        <button
          type="button"
          class="session-select"
          onclick={() => onSwitch(session.id)}
          disabled={busy || session.id === activeSessionId}
        >
          <span>{displaySessionName(session)}</span>
          <small>{formatSessionTime(session.last_message_at ?? session.updated_at)}</small>
        </button>
        <div class="session-meta">
          <span>{sessionKind(session)}</span>
          <span>{messageCountLabel(session.message_count)}</span>
        </div>
        <button
          type="button"
          class="session-archive"
          onclick={() => onArchive(session.id)}
          aria-label={`Archive ${displaySessionName(session)}`}
          disabled={busy}
        >
          Archive
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
</div>

<style>
  .session-rail-shell {
    display: flex;
    height: 100%;
    min-height: 0;
    flex-direction: column;
    gap: 0.85rem;
    padding: 0.8rem;
    color: #332f2a;
  }

  .mode-switch {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.2rem;
    border: 1px solid #ded6ca;
    border-radius: 999px;
    padding: 0.2rem;
    background: #eee8dd;
  }

  .mode-pill {
    display: inline-flex;
    min-width: 0;
    align-items: center;
    justify-content: center;
    border-radius: 999px;
    padding: 0.4rem 0.45rem;
    color: #81776c;
    font-size: 0.75rem;
    font-weight: 700;
    white-space: nowrap;
  }

  .mode-pill--active {
    background: #fffdf8;
    color: #2d2923;
    box-shadow: 0 1px 4px rgb(45 38 28 / 10%);
  }

  .session-rail-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
  }

  .session-rail-header h2 {
    margin: 0;
    font-size: 1rem;
    line-height: 1.2;
  }

  .session-rail-eyebrow {
    margin: 0 0 0.15rem;
    color: #8a8174;
    font-size: 0.68rem;
    font-weight: 800;
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }

  .new-chat-button,
  .session-archive {
    border: 1px solid #ded6ca;
    border-radius: 999px;
    background: #fffdf8;
    color: #332f2a;
    cursor: pointer;
    font: inherit;
    transition:
      background 0.15s ease,
      border-color 0.15s ease,
      color 0.15s ease;
  }

  .new-chat-button {
    padding: 0.42rem 0.7rem;
    font-size: 0.78rem;
    font-weight: 800;
  }

  .new-chat-button:hover,
  .session-archive:hover {
    border-color: #c9bbaa;
    background: #f8f2e9;
  }

  .new-chat-button:disabled,
  .session-select:disabled,
  .session-archive:disabled {
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
    gap: 0.3rem;
    overflow: auto;
    padding-right: 0.1rem;
  }

  .session-rail-list article {
    display: grid;
    gap: 0.4rem;
    border: 1px solid transparent;
    border-radius: 0.85rem;
    padding: 0.65rem;
    background: transparent;
  }

  .session-rail-list article:hover {
    background: #f3ede3;
  }

  .session-rail-list article.active-session {
    border-color: #ded6ca;
    background: #fffdf8;
    box-shadow: 0 1px 8px rgb(45 38 28 / 7%);
  }

  .session-select {
    display: grid;
    gap: 0.24rem;
    width: 100%;
    border: 0;
    background: transparent;
    color: inherit;
    cursor: pointer;
    padding: 0;
    text-align: left;
  }

  .session-select span {
    overflow: hidden;
    font-weight: 800;
    line-height: 1.2;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .session-select small,
  .session-meta,
  footer,
  .session-empty {
    color: #8a8174;
    font-size: 0.73rem;
  }

  .session-meta {
    display: flex;
    justify-content: space-between;
    gap: 0.5rem;
  }

  .session-archive {
    justify-self: start;
    padding: 0.26rem 0.55rem;
    color: #746b60;
    font-size: 0.7rem;
    font-weight: 700;
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
</style>

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

  function formatSessionTime(value: string | null): string {
    if (!value) return "No messages";
    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(value));
  }
</script>

<div class="session-rail-shell">
  <div class="session-rail-header">
    <div>
      <p class="session-rail-eyebrow">Workspace</p>
      <h2>Sessions</h2>
    </div>
    <button type="button" onclick={onCreate} disabled={busy}>New</button>
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
          <span>{session.name}</span>
          <small>{formatSessionTime(session.last_message_at ?? session.updated_at)}</small>
        </button>
        <div class="session-meta">
          <span>{session.mode}</span>
          <span>{session.message_count} msgs</span>
        </div>
        <button
          type="button"
          class="session-archive"
          onclick={() => onArchive(session.id)}
          aria-label={`Archive ${session.name}`}
          disabled={busy}
        >
          Archive
        </button>
      </article>
    {:else}
      <p class="session-empty">No sessions yet.</p>
    {/each}
  </div>

  {#if currentSession}
    <footer>
      <span>Active</span>
      <strong>{currentSession.name}</strong>
    </footer>
  {/if}
</div>

<style>
  .session-rail-shell {
    display: flex;
    height: 100%;
    min-height: 0;
    flex-direction: column;
    gap: 0.75rem;
    padding: 0.75rem;
    color: var(--foreground);
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
    color: var(--muted-foreground);
    font-size: 0.7rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .session-rail-header button,
  .session-archive {
    border: 1px solid var(--border);
    border-radius: 0.55rem;
    background: var(--background);
    color: var(--foreground);
    cursor: pointer;
    font: inherit;
  }

  .session-rail-header button {
    padding: 0.4rem 0.65rem;
    font-weight: 700;
  }

  .session-rail-header button:disabled,
  .session-select:disabled,
  .session-archive:disabled {
    cursor: wait;
    opacity: 0.55;
  }

  .session-rail-error {
    margin: 0;
    border: 1px solid color-mix(in srgb, #ef4444 55%, var(--border));
    border-radius: 0.5rem;
    padding: 0.5rem;
    color: #ef4444;
    font-size: 0.75rem;
  }

  .session-rail-list {
    display: flex;
    min-height: 0;
    flex: 1;
    flex-direction: column;
    gap: 0.5rem;
    overflow: auto;
  }

  .session-rail-list article {
    display: grid;
    gap: 0.45rem;
    border: 1px solid var(--border);
    border-radius: 0.75rem;
    padding: 0.55rem;
    background: color-mix(in srgb, var(--background) 88%, var(--foreground) 12%);
  }

  .session-rail-list article.active-session {
    border-color: color-mix(in srgb, var(--primary) 70%, var(--border));
    background: color-mix(in srgb, var(--primary) 10%, var(--background));
  }

  .session-select {
    display: grid;
    gap: 0.2rem;
    border: 0;
    background: transparent;
    color: inherit;
    cursor: pointer;
    padding: 0;
    text-align: left;
  }

  .session-select span {
    overflow: hidden;
    font-weight: 700;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .session-select small,
  .session-meta,
  footer,
  .session-empty {
    color: var(--muted-foreground);
    font-size: 0.75rem;
  }

  .session-meta {
    display: flex;
    justify-content: space-between;
    gap: 0.5rem;
    text-transform: capitalize;
  }

  .session-archive {
    justify-self: start;
    padding: 0.25rem 0.5rem;
    color: var(--muted-foreground);
    font-size: 0.72rem;
  }

  .session-empty {
    margin: 0;
  }

  footer {
    display: grid;
    gap: 0.2rem;
    border-top: 1px solid var(--border);
    padding-top: 0.7rem;
  }

  footer strong {
    overflow: hidden;
    color: var(--foreground);
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>

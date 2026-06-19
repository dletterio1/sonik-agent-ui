<script lang="ts">
  import type { Snippet } from "svelte";

  interface Props {
    chat: Snippet;
    artifact: Snippet;
    title?: string;
    artifactOpen?: boolean;
  }

  let { chat, artifact, title = "Agent workspace", artifactOpen = true }: Props = $props();
</script>

<div class="workspace-root" data-artifact-open={artifactOpen}>
  <div class="workspace-grid" class:workspace-grid--artifact-open={artifactOpen}>
    <section class="workspace-pane workspace-pane--chat" aria-label={`${title} chat pane`}>
      {@render chat()}
    </section>

    {#if artifactOpen}
      <aside class="workspace-pane workspace-pane--artifact" aria-label={`${title} artifact pane`}>
        {@render artifact()}
      </aside>
    {/if}
  </div>
</div>

<style>
  .workspace-root {
    height: 100vh;
    min-height: 0;
    overflow: hidden;
    background: var(--background);
  }

  .workspace-grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 0.5rem;
    height: 100%;
    min-height: 0;
    padding: 0.5rem;
  }

  .workspace-pane {
    min-height: 0;
    overflow: hidden;
    border: 1px solid var(--border);
    background: var(--background);
  }

  .workspace-pane--chat {
    border-radius: 0.75rem;
  }

  .workspace-pane--artifact {
    border-radius: 0.75rem;
  }

  @media (min-width: 1024px) {
    .workspace-grid--artifact-open {
      grid-template-columns: minmax(360px, 0.92fr) minmax(420px, 1.08fr);
    }
  }
</style>

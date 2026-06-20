<script lang="ts">
  import { onMount } from "svelte";
  import "../app.css";
  import { initializeTheme } from "$lib/theme/theme-runtime";
  import favicon from "$lib/assets/favicon.svg";

  let { children } = $props();

  onMount(() => {
    initializeTheme();
  });
</script>

<svelte:head>
  <link rel="icon" href={favicon} />
  <title>Sonik Chat</title>
</svelte:head>

{@render children()}

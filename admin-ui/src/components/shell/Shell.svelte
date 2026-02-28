<script>
  import Sidebar from "./Sidebar.svelte";
  import Header from "./Header.svelte";
  import CommandPalette from "./CommandPalette.svelte";
  import { onMount, onDestroy } from "svelte";

  let { children } = $props();
  let cmdOpen = $state(false);
  let mobileMenuOpen = $state(false);

  function handleKeydown(e) {
    if ((e.metaKey || e.ctrlKey) && e.key === "k") {
      e.preventDefault();
      cmdOpen = !cmdOpen;
    }
    if (e.key === "Escape" && cmdOpen) {
      cmdOpen = false;
    }
  }

  onMount(() => {
    window.addEventListener("keydown", handleKeydown);
  });

  onDestroy(() => {
    window.removeEventListener("keydown", handleKeydown);
  });
</script>

<div class="shell">
  <Sidebar bind:mobileOpen={mobileMenuOpen} />
  <div class="main">
    <Header onOpenCommandPalette={() => (cmdOpen = true)} onToggleMobile={() => (mobileMenuOpen = !mobileMenuOpen)} />
    <div class="content">
      {@render children()}
    </div>
  </div>
</div>

<CommandPalette bind:open={cmdOpen} />

<style>
  .shell {
    display: flex;
    height: 100vh;
  }

  .main {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .content {
    flex: 1;
    overflow-y: auto;
    padding: 24px;
    scroll-behavior: smooth;
  }

  @media (max-width: 768px) {
    .content {
      padding: 16px;
    }
  }
</style>

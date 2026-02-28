<script>
  let { children, padding = "20px", class: className = "" } = $props();
</script>

<div class="card {className}" style:padding>
  {@render children()}
</div>

<style>
  .card {
    background: var(--bg-card);
    border-radius: var(--radius);
    box-shadow: var(--shadow);
    border: 1px solid var(--border-light);
  }
</style>

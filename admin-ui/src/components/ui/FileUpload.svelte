<script>
  let { accept = "", multiple = false, onfiles, label = "Dosya sec veya surukle" } = $props();
  let dragging = $state(false);
  let inputRef;

  function handleDrop(e) {
    e.preventDefault();
    dragging = false;
    const files = Array.from(e.dataTransfer.files);
    if (files.length) onfiles?.(multiple ? files : [files[0]]);
  }

  function handleChange(e) {
    const files = Array.from(e.target.files);
    if (files.length) onfiles?.(multiple ? files : [files[0]]);
    e.target.value = "";
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="file-upload"
  class:dragging
  ondragover={(e) => { e.preventDefault(); dragging = true; }}
  ondragleave={() => (dragging = false)}
  ondrop={handleDrop}
  onclick={() => inputRef?.click()}
>
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
  <p>{label}</p>
  <input bind:this={inputRef} type="file" {accept} {multiple} onchange={handleChange} hidden />
</div>

<style>
  .file-upload {
    border: 2px dashed var(--border);
    border-radius: var(--radius);
    padding: 32px;
    text-align: center;
    cursor: pointer;
    color: var(--text-muted);
    transition: all 0.15s;
  }
  .file-upload:hover,
  .file-upload.dragging {
    border-color: var(--accent);
    background: var(--accent-light);
    color: var(--accent);
  }
  p { font-size: 13px; margin-top: 8px; }
</style>

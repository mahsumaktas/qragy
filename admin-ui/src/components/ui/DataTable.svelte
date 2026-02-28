<script>
  let {
    columns = [],
    rows = [],
    sortKey = $bindable(""),
    sortDir = $bindable("asc"),
    selectable = false,
    selected = $bindable([]),
    emptyText = "Veri bulunamadi",
    onrowclick,
  } = $props();

  function toggleSort(key) {
    if (!key) return;
    if (sortKey === key) {
      sortDir = sortDir === "asc" ? "desc" : "asc";
    } else {
      sortKey = key;
      sortDir = "asc";
    }
  }

  let sortedRows = $derived(() => {
    if (!sortKey) return rows;
    return [...rows].sort((a, b) => {
      const va = a[sortKey] ?? "";
      const vb = b[sortKey] ?? "";
      const cmp = typeof va === "number" ? va - vb : String(va).localeCompare(String(vb), "tr");
      return sortDir === "asc" ? cmp : -cmp;
    });
  });

  function toggleAll(e) {
    if (e.target.checked) {
      selected = rows.map((_, i) => i);
    } else {
      selected = [];
    }
  }

  function toggleRow(idx) {
    if (selected.includes(idx)) {
      selected = selected.filter((i) => i !== idx);
    } else {
      selected = [...selected, idx];
    }
  }
</script>

<div class="table-wrap">
  <table>
    <thead>
      <tr>
        {#if selectable}
          <th class="th-check">
            <input type="checkbox" onchange={toggleAll} checked={selected.length === rows.length && rows.length > 0} />
          </th>
        {/if}
        {#each columns as col}
          <th
            class:sortable={col.sortable}
            onclick={() => col.sortable && toggleSort(col.key)}
            style:width={col.width || "auto"}
          >
            {col.label}
            {#if col.sortable && sortKey === col.key}
              <span class="sort-arrow">{sortDir === "asc" ? "↑" : "↓"}</span>
            {/if}
          </th>
        {/each}
      </tr>
    </thead>
    <tbody>
      {#each sortedRows() as row, idx}
        <tr
          class:clickable={!!onrowclick}
          class:selected={selectable && selected.includes(idx)}
          onclick={() => onrowclick?.(row, idx)}
        >
          {#if selectable}
            <td class="td-check">
              <input
                type="checkbox"
                checked={selected.includes(idx)}
                onclick={(e) => e.stopPropagation()}
                onchange={() => toggleRow(idx)}
              />
            </td>
          {/if}
          {#each columns as col}
            <td>
              {#if col.render}
                {@html col.render(row[col.key], row)}
              {:else}
                {row[col.key] ?? "-"}
              {/if}
            </td>
          {/each}
        </tr>
      {:else}
        <tr>
          <td colspan={columns.length + (selectable ? 1 : 0)} class="empty-row">
            {emptyText}
          </td>
        </tr>
      {/each}
    </tbody>
  </table>
</div>

<style>
  .table-wrap {
    overflow-x: auto;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
  }
  th {
    text-align: left;
    padding: 10px 12px;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--text-muted);
    border-bottom: 1px solid var(--border);
    background: var(--bg);
    user-select: none;
  }
  th.sortable { cursor: pointer; }
  th.sortable:hover { color: var(--text-secondary); }
  .sort-arrow { font-size: 10px; margin-left: 2px; }
  td {
    padding: 10px 12px;
    border-bottom: 1px solid var(--border-light);
    color: var(--text-secondary);
  }
  tr:hover td { background: var(--bg-hover); }
  tr.clickable { cursor: pointer; }
  tr.selected td { background: var(--accent-light); }
  td:first-child { color: var(--text); font-weight: 500; }
  .th-check, .td-check { width: 36px; text-align: center; }
  .empty-row {
    text-align: center;
    padding: 32px 12px;
    color: var(--text-muted);
  }
</style>

<!--
  Tabular View viewport (doc/module-table.rst), registered via
  modules/table/index.js as the "table" data type's viewportComponent
  (doc/ui-session.rst's "Extension points").

  Phase-3: TanStack Virtual drives row rendering -- the scroll container
  (.table-viewport__scroll) only ever mounts the rows actually in view
  (plus overscan), via a virtualized <tbody> using the "spacer row" pattern
  (two <tr> placeholders sized to the offscreen space before/after the
  visible window) rather than absolutely-positioned rows, since `position:
  absolute` on a `display: table-row` breaks native table column alignment.
  Nearing the end of what's loaded auto-fetches the next page (controller
  .js's load_more()) instead of Phase 2's manual "Load more rows" button --
  this is what "efficient row scrolling" (doc's "Rendering" section)
  actually means for a random-access source. Hierarchical columns, column
  visibility/resizing, selection, sorting, and export are still later
  slices -- see the doc's "Initial implementation scope".

  Also renders whatever has landed via the cross-module "selection sink"
  mechanism (doc/ui-session.rst's "Selection sinks") in this context's own
  sinkInbox sub-state (store/sinkInbox.js) -- the "Selection view" use
  case, this module's real styled sink-target consumer, as opposed to
  modules/sink-view/'s raw-JSON dev stub. sinkInbox only holds references;
  resolve_incoming_sink_items (store/sinkResolve.js) resolves each one's
  current data fresh on every render. Deliberately origin-agnostic: it
  only ever assumes the generic {itemId, srcID, payloadType, snapshot}
  envelope resolveSinkItem produces (modules/registry.js), never anything
  specific to geo3d or any other one origin type.
-->
<template>
  <div class="table-viewport">
    <template v-if="tableState.schema">
      <div v-if="allLeafColumns.length > 1" class="table-viewport__column-toggle">
        <label v-for="col in allLeafColumns" :key="col.id">
          <input
            type="checkbox"
            :checked="!hiddenColumnIds.has(col.id)"
            @change="toggle_column(col.id)"
          >{{ col.label ?? col.id }}
        </label>
      </div>

      <div ref="scrollEl" class="table-viewport__scroll">
        <table class="table-viewport__table">
          <colgroup>
            <col class="table-viewport__row-selector-col">
            <col v-for="col in visibleLeafColumns" :key="col.id" :style="column_style(col.id)">
          </colgroup>
          <thead>
            <tr v-for="(headerRow, i) in headerRows" :key="i">
              <th v-if="i === 0" :rowspan="headerRows.length" class="table-viewport__row-selector-col" />
              <th
                v-for="cell in headerRow"
                :key="cell.key"
                :colspan="cell.colSpan"
                :rowspan="cell.rowSpan"
                :class="{'table-viewport__th--sortable': cell.id && tableState.capabilities?.sort}"
                @click="cell.id && on_header_click(cell.id)"
              >
                {{ cell.label }}
                <span v-if="cell.units" class="table-viewport__units">({{ cell.units }})</span>
                <span v-if="sort_indicator(cell.id)" class="table-viewport__sort-indicator">{{ sort_indicator(cell.id) }}</span>
                <span
                  v-if="cell.id"
                  class="table-viewport__resize-handle"
                  @mousedown="start_resize(cell.id, $event)"
                  @click.stop
                />
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="topSpacerHeight > 0" :style="{height: `${topSpacerHeight}px`}">
              <td :colspan="visibleLeafColumns.length + 1" />
            </tr>
            <tr
              v-for="vRow in virtualRows"
              :key="tableState.rows[vRow.index]._id"
              :class="{'table-viewport__row--selected': selectedItemIDs.has(tableState.rows[vRow.index]._id)}"
            >
              <td
                class="table-viewport__row-selector-col"
                :title="selectedItemIDs.has(tableState.rows[vRow.index]._id) ? 'Deselect row' : 'Select row'"
                @click="toggle_row(tableState.rows[vRow.index]._id)"
              >{{ selectedItemIDs.has(tableState.rows[vRow.index]._id) ? '●' : '○' }}</td>
              <td
                v-for="col in visibleLeafColumns"
                :key="col.id"
                :class="{'table-viewport__cell--selected': is_cell_selected(tableState.rows[vRow.index]._id, col.id)}"
                @click="toggle_cell(tableState.rows[vRow.index]._id, col.id)"
              >{{ tableState.rows[vRow.index][col.id] }}</td>
            </tr>
            <tr v-if="bottomSpacerHeight > 0" :style="{height: `${bottomSpacerHeight}px`}">
              <td :colspan="visibleLeafColumns.length + 1" />
            </tr>
          </tbody>
        </table>
      </div>

      <div v-if="tableState.capabilities?.export" class="table-viewport__toolbar">
        <button type="button" @click="export_csv">Export CSV</button>
      </div>

      <p class="table-viewport__status">
        {{ tableState.rows.length }}{{ tableState.total !== null ? ` of ${tableState.total}` : '' }} rows loaded
        <span v-if="tableState.sourceKind === 'random-access'">(random-access{{ tableState.loading ? ', loading…' : '' }})</span>
      </p>
      <p v-if="tableState.error" class="table-viewport__error">{{ tableState.error }}</p>
    </template>
    <p v-else class="table-viewport__empty">
      No table data loaded yet -- add a tabular source and connect it to this scene.
    </p>

    <div v-if="incomingList.length" class="table-viewport__sink-section">
      <h4 v-for="entry in incomingList" :key="entry.originContextId">
        Routed in from {{ entry.originContextId }} ({{ entry.payloadType }})
      </h4>
      <table class="table-viewport__table">
        <thead>
          <tr><th>Item</th><th>Source</th><th>Snapshot</th></tr>
        </thead>
        <tbody>
          <tr v-for="row in incomingRows" :key="`${row.originContextId}:${row.itemId}`">
            <td>{{ row.itemId }}</td>
            <td>{{ row.srcID }}</td>
            <td class="table-viewport__snapshot">{{ compact(row.snapshot) }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import { useStore } from 'vuex';
import { useVirtualizer } from '@tanstack/vue-virtual';
import { use_table_controller } from './controller';
import { leaf_columns, header_rows, filter_columns } from './schema';
import { to_csv } from './export';
import { download_text } from '@/download';
import { resolve_incoming_sink_items } from '@/store/sinkResolve';

// Estimate only -- rows aren't individually measured (dynamic sizing via
// the virtualizer's own measureElement is unnecessary here: every row is a
// single line of plain text, never wrapped, so a fixed estimate is exact
// in practice). Keep in sync with .table-viewport__table td's padding/
// font-size/border below if that ever changes.
const ROW_HEIGHT_PX = 24;
// How many rows of headroom before the end of what's loaded triggers the
// next page fetch -- large enough that overscan rows (rendered but not yet
// visible) don't get seen blank before the fetch resolves.
const PREFETCH_ROW_THRESHOLD = 20;

const props = defineProps({
    instanceId: {type: String, required: true}
});

const store = useStore();

// A viewport doesn't own a context, it's handed one at creation
// (sceneCreation.js) and looks it up by its own instanceId -- generic
// per doc/ui-session.rst, not specific to this module.
const contextId = computed(() => store.getters['widgetInstances/instance'](props.instanceId)?.contextId ?? null);

const {state: tableState, load_more, set_sort} = use_table_controller(store, contextId);

// Sorting (doc/module-table.rst's "Sorting"): clicking a sortable leaf
// header cycles asc -> desc -> unsorted for that column, replacing any
// previous sort (single-column, matching the doc's own example -- see
// controller.js's note on why the spec stays an array regardless).
function on_header_click(colId) {
    if(!tableState.capabilities?.sort) return;
    const current = tableState.sort?.[0];
    if(!current || current.column !== colId) {
        set_sort([{column: colId, direction: 'asc'}]);
    } else if(current.direction === 'asc') {
        set_sort([{column: colId, direction: 'desc'}]);
    } else {
        set_sort(null);
    }
}

function sort_indicator(colId) {
    const current = tableState.sort?.[0];
    if(!colId || !current || current.column !== colId) return '';
    return current.direction === 'asc' ? '▲' : '▼';
}

// CSV export (doc's "Export"): only ever offered for a `capabilities.export`
// source (currently `local` only, export.js's own scoping note) --
// exports whichever *visible* leaf columns and *currently loaded* rows are
// on screen, not the full unfiltered schema.
function export_csv() {
    const csv = to_csv(visibleLeafColumns.value, tableState.rows);
    download_text(csv, 'table-export.csv', 'text/csv');
}

// Column visibility/width are view state (doc/module-table.rst's "Table
// state"), owned locally per viewport -- not persisted, not shared with
// any other component, the same reasoning controller.js's own row cache
// uses for staying out of Vuex.
const hiddenColumnIds = ref(new Set());
const columnWidths = ref({}); // columnId -> px, only for explicitly resized columns

const allLeafColumns = computed(() => leaf_columns(tableState.schema?.columns ?? []));
const visibleColumnTree = computed(() =>
    filter_columns(tableState.schema?.columns ?? [], id => !hiddenColumnIds.value.has(id))
);
const visibleLeafColumns = computed(() => leaf_columns(visibleColumnTree.value));
const headerRows = computed(() => header_rows(visibleColumnTree.value));

function toggle_column(id) {
    const next = new Set(hiddenColumnIds.value);
    if(next.has(id)) next.delete(id);
    else next.add(id);
    hiddenColumnIds.value = next;
}

function column_style(id) {
    const width = columnWidths.value[id];
    return width ? {width: `${width}px`} : {};
}

// Selection (doc/module-table.rst's "Selection"): the generic `selection`
// context module (doc/ui-session.rst's "Selection model") this context
// registers alongside tableDesk/sinkInbox above -- row = whole item, cell
// = a sub-item of its row keyed by column id. Clicking the row-selector
// column toggles the row; clicking any data cell toggles just that cell,
// independent of the row's own selection (mirrors three-view's own
// "markers and whole items are mutually exclusive selection targets"
// precedent, modules/three-view/three/index.js).
const selectionNS = computed(() => contextId.value ? `selection_${contextId.value}` : null);

const selectedItemIDs = computed(() =>
    selectionNS.value ? store.getters[`${selectionNS.value}/selectedItemIDs`] : new Set()
);
const selectedSubItems = computed(() =>
    selectionNS.value ? store.getters[`${selectionNS.value}/selectedSubItems`] : new Map()
);

function toggle_row(rowId) {
    if(!selectionNS.value) return;
    const mutation = selectedItemIDs.value.has(rowId) ? 'unselect_items' : 'select_items';
    store.commit(`${selectionNS.value}/${mutation}`, [rowId]);
}

function is_cell_selected(rowId, colId) {
    return selectedSubItems.value.get(rowId)?.has(colId) ?? false;
}

function toggle_cell(rowId, colId) {
    if(!selectionNS.value) return;
    const current = new Set(selectedSubItems.value.get(rowId) ?? []);
    if(current.has(colId)) current.delete(colId);
    else current.add(colId);

    if(current.size) {
        store.commit(`${selectionNS.value}/select_sub_items`, {itemID: rowId, indices: current});
    } else {
        store.commit(`${selectionNS.value}/clear_selected_sub_items`, rowId);
    }
}

// Drag-resize (doc's "column resizing"): starts from the header cell's own
// current rendered width (not a hardcoded default), so the first drag
// doesn't visibly jump before adjusting.
function start_resize(id, event) {
    event.preventDefault();
    const th = event.target.closest('th');
    const startWidth = columnWidths.value[id] ?? th?.getBoundingClientRect().width ?? 100;
    const startX = event.clientX;

    function on_move(moveEvent) {
        const next = Math.max(30, startWidth + (moveEvent.clientX - startX));
        columnWidths.value = {...columnWidths.value, [id]: next};
    }
    function on_up() {
        window.removeEventListener('mousemove', on_move);
        window.removeEventListener('mouseup', on_up);
    }
    window.addEventListener('mousemove', on_move);
    window.addEventListener('mouseup', on_up);
}

const scrollEl = ref(null);

const rowVirtualizer = useVirtualizer(computed(() => ({
    count: tableState.rows.length,
    getScrollElement: () => scrollEl.value,
    estimateSize: () => ROW_HEIGHT_PX,
    overscan: 8
})));

const virtualRows = computed(() => rowVirtualizer.value.getVirtualItems());
const totalScrollHeight = computed(() => rowVirtualizer.value.getTotalSize());
const topSpacerHeight = computed(() => virtualRows.value[0]?.start ?? 0);
const bottomSpacerHeight = computed(() =>
    Math.max(0, totalScrollHeight.value - (virtualRows.value[virtualRows.value.length - 1]?.end ?? 0))
);

// Auto-fetches the next page once the visible window nears the end of
// what's cached -- replaces Phase 2's manual "Load more rows" button;
// use_table_controller's own loading/exhausted guards make this safe to
// call speculatively on every virtual-range change.
watch(virtualRows, rows => {
    const last = rows[rows.length - 1];
    if(!last) return;
    if(last.index >= tableState.rows.length - PREFETCH_ROW_THRESHOLD) {
        load_more();
    }
});

const incomingList = computed(() => {
    if(!contextId.value) return [];
    return store.getters[`sinkInbox_${contextId.value}/incomingList`] ?? [];
});

// Resolves every origin's routed-in *references* into current data
// (store/sinkResolve.js) and flattens them into one row list -- the
// generic {originContextId, itemId, srcID, payloadType, snapshot} shape
// resolveSinkItem produces (modules/registry.js), regardless of which
// module. Recomputes fresh on every read, so an origin that's removed (or
// an item that's been deleted there) simply drops out on its own.
const incomingRows = computed(() => resolve_incoming_sink_items(store, incomingList.value));

function compact(snapshot) {
    if(snapshot === null || snapshot === undefined) return '';
    try {
        return JSON.stringify(snapshot);
    } catch {
        return String(snapshot);
    }
}
</script>

<style scoped>
.table-viewport {
    height: 100%;
    display: flex;
    flex-direction: column;
    padding: 8px;
    font-size: 9pt;
    background: var(--clr-bg-panel);
    color: var(--clr-fg-panel);
}

.table-viewport__column-toggle {
    flex: 0 0 auto;
    display: flex;
    flex-wrap: wrap;
    gap: 4pt 10pt;
    margin-bottom: 6pt;
    font-size: 8pt;
    color: var(--clr-fg-main-muted);
}

.table-viewport__column-toggle label {
    display: inline-flex;
    align-items: center;
    gap: 3pt;
    white-space: nowrap;
}

.table-viewport__toolbar {
    flex: 0 0 auto;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6pt;
    margin-top: 6pt;
    font-size: 8pt;
}

.table-viewport__toolbar label {
    display: inline-flex;
    align-items: center;
    gap: 3pt;
    color: var(--clr-fg-main-muted);
}

.table-viewport__scroll {
    flex: 1 1 auto;
    min-height: 80px;
    overflow-y: auto;
    overflow-x: auto;
}

.table-viewport__table {
    border-collapse: collapse;
    width: 100%;
}

.table-viewport__table th,
.table-viewport__table td {
    border: 1px solid var(--clr-border-inactive);
    padding: 3pt 6pt;
    text-align: left;
    white-space: nowrap;
    box-sizing: border-box;
}

.table-viewport__table th {
    background: var(--clr-bg-panel-header);
    color: var(--clr-fg-panel-header);
    position: sticky;
    top: 0;
    z-index: 1;
}

/*
 * Stacked sticky header rows (hierarchical columns, schema.js's
 * header_rows()) -- each row after the first must stick just below the
 * ones above it, or they'd all pile up at the same top:0 offset. A
 * rowspanning cell (e.g. a shallow leaf beside a deeper group) only ever
 * appears in its own starting row's markup, so this only needs one rule
 * per row index, not per column.
 */
.table-viewport__table thead tr:nth-child(2) th { top: 24px; }
.table-viewport__table thead tr:nth-child(3) th { top: 48px; }

.table-viewport__units {
    color: var(--clr-fg-main-muted);
    font-weight: normal;
}

.table-viewport__th--sortable {
    cursor: pointer;
}

.table-viewport__sort-indicator {
    margin-left: 3pt;
    color: var(--clr-fg-highlight2);
}

.table-viewport__resize-handle {
    position: absolute;
    top: 0;
    right: 0;
    bottom: 0;
    width: 5px;
    cursor: col-resize;
    user-select: none;
}

.table-viewport__resize-handle:hover {
    background: var(--clr-border-active);
}

.table-viewport__row-selector-col {
    width: 1.4em;
    text-align: center;
    cursor: pointer;
    color: var(--clr-fg-main-muted);
}

.table-viewport__row--selected {
    background: var(--clr-bg-highlight2);
    color: var(--clr-fg-highlight2);
}

.table-viewport__row--selected td {
    border-color: var(--clr-border-active);
}

.table-viewport__cell--selected {
    outline: 2px solid var(--clr-border-active);
    outline-offset: -2px;
}

.table-viewport__empty {
    color: var(--clr-fg-main-muted);
    font-style: italic;
}

.table-viewport__status {
    flex: 0 0 auto;
    color: var(--clr-fg-main-muted);
    font-size: 8pt;
    margin: 6pt 0 0;
}

.table-viewport__error {
    flex: 0 0 auto;
    color: var(--clr-fg-main-highlighted);
    margin: 4pt 0 0;
}

.table-viewport__sink-section {
    flex: 0 0 auto;
    margin-top: 8pt;
}

.table-viewport__sink-section h4 {
    margin: 8pt 0 4pt;
}

.table-viewport__snapshot {
    max-width: 40ch;
    overflow: hidden;
    text-overflow: ellipsis;
    font-family: var(--font-data);
    font-size: 8pt;
}
</style>

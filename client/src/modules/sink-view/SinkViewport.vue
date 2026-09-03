<!--
  Bare-bones viewport for the "sink-view" dev stub (modules/sink-view/
  index.js) -- lists whatever has landed in this context's own sinkInbox
  sub-state, one JsonTree.js (jjsontree.js) tree per origin
  (SinkInboxEntry.vue), resolved to current data (store/sinkResolve.js --
  sinkInbox itself only holds references, resolution is always live).
  Exists only to prove the cross-module "selection sink" mechanism end to
  end, not as a real consumer -- see index.js's header comment.
-->
<template>
  <div class="sink-viewport">
    <p v-if="!incomingList.length" class="sink-viewport__empty">Nothing routed in yet.</p>
    <div v-for="entry in incomingList" :key="entry.originContextId" class="sink-viewport__entry">
      <div class="sink-viewport__entry-toolbar toolbar-floating">
        <div class="button-group">
          <button type="button" class="icon-button" title="Expand all" @click="expand_all(entry)">
            <span class="vi vi-plus-framed" aria-hidden="true" />
          </button>
          <button type="button" class="icon-button" title="Collapse all" @click="collapse_all(entry)">
            <span class="vi vi-minus-framed" aria-hidden="true" />
          </button>
          <button type="button" class="icon-button" title="Copy all" @click="copy_all(entry)">
            <span class="vi vi-clipboard" aria-hidden="true" />
          </button>
        </div>
      </div>

      <div class="sink-viewport__entry-label">From {{ entry.originContextId }} ({{ entry.payloadType }})</div>
      <SinkInboxEntry :element-id="element_id(entry)" :data="resolved_items(entry)" />
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { useStore } from 'vuex';
import { resolve_incoming_sink_items } from '@/store/sinkResolve';
import SinkInboxEntry from './SinkInboxEntry.vue';
// Side-effect imports: sets window.$jsontree (jjsontree.js has no ESM
// exports of its own -- see SinkInboxEntry.vue) and its base stylesheet.
// Scoped to this module's own entry component, same as SinkWiringPanel.vue
// importing '@vue-flow/core/dist/style.css' directly rather than from
// main.js -- main.js only knows about registering modules generically.
import 'jjsontree.js/dist/jsontree.esm.js';
import 'jjsontree.js/dist/jsontree.js.css';

const props = defineProps({
    instanceId: {type: String, required: true}
});

const store = useStore();

const contextId = computed(() => store.getters['widgetInstances/instance'](props.instanceId)?.contextId ?? null);
const ns = computed(() => `sinkInbox_${contextId.value}`);
const incomingList = computed(() => contextId.value ? store.getters[`${ns.value}/incomingList`] : []);

// Prefixed by this widget instance, not just the origin context id -- two
// "Sink Inbox (dev)" viewports open at once could otherwise both try to
// render into the same DOM id.
function element_id(entry) {
    return `sink-tree-${props.instanceId}-${entry.originContextId}`;
}

function resolved_items(entry) {
    return resolve_incoming_sink_items(store, [entry]);
}

// The three actions JsonTree.js's own (now switched-off, see
// SinkInboxEntry.vue) title bar used to offer, driven through the
// library's public API by this entry's own element id instead -- openAll/
// closeAll are direct API calls; copy has no dedicated "copy to clipboard"
// entry point, so this re-serializes getJson's result itself. That's safe
// here specifically because resolve_incoming_sink_items always hands the
// library already-parsed JSON (never a Date/Map/Set/etc. instance
// JSON.parse could never produce), which is exactly the one case the
// library's own copy path does extra work for that this skips.
function expand_all(entry) {
    window.$jsontree.openAll(element_id(entry));
}

function collapse_all(entry) {
    window.$jsontree.closeAll(element_id(entry));
}

function copy_all(entry) {
    const json = window.$jsontree.getJson(element_id(entry));
    navigator.clipboard.writeText(JSON.stringify(json, null, 2));
}
</script>

<style scoped>
.sink-viewport {
    height: 100%;
    overflow: auto;
    padding: 8px;
    font-size: 9pt;
    background: var(--clr-bg-panel);
    color: var(--clr-fg-panel);
}

.sink-viewport__empty {
    margin: 0;
    color: var(--clr-fg-main-muted);
    font-style: italic;
}

.sink-viewport__entry {
    position: relative;
    margin-bottom: 12px;
    /* Clears the hovering toolbar below, positioned absolute at this
       entry's own top-left corner -- without it, a short enough payload's
       label and root node would render right underneath the toolbar
       instead of below it. Sized to the toolbar's own footprint
       (--hover-toolbar-top + its buttons' height) plus a small gap. */
    padding-top: calc(var(--hover-toolbar-top) + 1.8rem + var(--um2));
}

.sink-viewport__entry-toolbar {
    position: absolute;
    top: var(--hover-toolbar-top);
    left: var(--hover-toolbar-left);
    z-index: 10;
}

.icon-button {
    display: inline-grid;
    place-items: center;
    width: 1.8rem;
    height: 1.8rem;
    padding: 0;
}

.sink-viewport__entry-label {
    margin-bottom: 2px;
    font-size: 8pt;
    color: var(--clr-fg-main-muted);
}

/*
 * jjsontree.js ships one fixed dark palette (node_modules/jjsontree.js/
 * dist/jsontree.js.css's own :root block) with no variant wired to this
 * app's own [data-theme] toggle. Rather than also import its separate
 * (equally unconditional) light theme stylesheet and fight the resulting
 * cascade, re-point the vars that matter at this app's own already
 * theme-aware tokens instead:
 *
 * - `display: block` kills the classic "a few stray pixels below an
 *   inline-block element" gap -- the library's own container is
 *   `display: inline-block` (dist/jsontree.js.css), which is what read as
 *   unexplained extra margin around the widget with nothing to point to.
 * - `--json-tree-js-color-snow-white` is this library's own general
 *   "light text/icon" color, not just a container text color -- among
 *   other things it's what the collapse/expand triangles
 *   (button.expander's border-triangle trick) and the base container text
 *   are hardcoded to. On this app's bright theme that's near-white text
 *   and near-white triangles on a light panel background -- invisible.
 *   Redefining the var itself (not just this element's own `color`) fixes
 *   every one of those call sites in one shot, not just the ones this
 *   rule happens to touch directly.
 * - Per-JSON-type syntax colors are re-mapped onto this app's own
 *   --clr-legendN supplementary palette (style.css's "Basic palette"
 *   section, 8 slots per theme) instead of the library's own unrelated
 *   defaults, so this reads as one more consumer of the app's existing
 *   color-legend vocabulary rather than its own separate palette. Rarer
 *   types (null/undefined/symbol/guid/regexp/url/email/link/html/
 *   function/lambda/unknown) are left at the library's own reasonably
 *   neutral defaults rather than stretching 8 colors over ~20 categories.
 * - `--font-data` (style.css's "Typography" section -- monospace, for
 *   data/code-like display) replaces the library's own default UI font.
 *
 * Spacing otherwise is left as the library's own default for now -- see
 * index.js's header comment, this is still a dev stub, not a polished
 * module.
 */
.sink-viewport :deep(.json-tree-js) {
    display: block;
    max-width: none;

    --json-tree-js-default-font: var(--font-data);
    --json-tree-js-container-background-color: var(--clr-bg-panel);
    --json-tree-js-container-border-color: var(--clr-border-inactive);
    --json-tree-js-color-snow-white: var(--clr-fg-panel);

    --json-tree-js-color-object: var(--clr-legend1);   /* property names */
    --json-tree-js-color-array: var(--clr-legend2);
    --json-tree-js-color-string: var(--clr-legend3);
    --json-tree-js-color-number: var(--clr-legend4);
    --json-tree-js-color-float: var(--clr-legend4);
    --json-tree-js-color-bigint: var(--clr-legend4);
    --json-tree-js-color-boolean: var(--clr-legend5);
    --json-tree-js-color-date: var(--clr-legend6);
    --json-tree-js-color-map: var(--clr-legend7);
    --json-tree-js-color-set: var(--clr-legend8);
}

/* SinkInboxEntry.vue's render() call switches off every title-bar
   button/text/menu it can, but leaves `paging` itself at its default (a
   library crash otherwise, see that file's own comment) -- which alone is
   still enough to make an empty `.title-bar` div get created. Hidden here
   instead, rather than fought via more render options: a solid-colored,
   padded bar with nothing in it is exactly the leftover "native design"
   chrome peeling this widget down was for. */
.sink-viewport :deep(.json-tree-js) > .title-bar {
    display: none;
}
</style>

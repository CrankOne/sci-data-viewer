<!--
  One resolved sink-inbox entry (SinkViewport.vue), rendered as a
  JsonTree.js (jjsontree.js) tree instead of SinkViewport.vue's former flat
  `<pre>{{ JSON.stringify(...) }}` dump -- same underlying data (store/
  sinkResolve.js's resolve_incoming_sink_items), now navigable/collapsible
  instead of a wall of text. Deliberately dumb about payload shape:
  whatever JSON `data` holds renders as-is, which is the whole point of
  this dev stub (modules/sink-view/index.js's own header comment) and of
  switching to a real tree view -- a future sink-forwarded arbitrary JSON
  payload (e.g. a plotter selection, not built yet) needs nothing new here
  to display correctly.

  JsonTree.js owns this component's own container element's DOM entirely
  once rendered (its own expand state) -- Vue never patches inside it, only
  mounts/updates/unmounts the whole thing via the library's own imperative
  API (window.$jsontree.render/setJson/destroy), the same "hand a ref to an
  imperative library, let it own that subtree" pattern DiagramViewport.vue's
  SVG or PlotViewport.vue's <canvas> use for their own reasons.

  Rendered peeled of the library's own title bar/footer chrome (see the
  render() options below) -- against this app's design guidelines
  (desktop-optimized, condensed) that native chrome read as a second,
  visually incoherent widget-within-a-widget on top of an already-chromed
  panel. Its copy/expand/collapse-all actions aren't gone, just relocated
  onto SinkViewport.vue's own hovering toolbar (one per entry, same
  .toolbar-floating language every other module viewport's corner controls
  use), driving this same library through its public API instead of its
  own now-absent buttons.
-->
<template>
  <div :id="elementId" class="sink-inbox-entry" />
</template>

<script setup>
import { onMounted, onBeforeUnmount, watch } from 'vue';

const props = defineProps({
    elementId: {type: String, required: true},
    data: {type: null, required: true}
});

// `data` must stay a real array/object, never a JSON *string* -- the
// library's own string-input path falls back to eval() when JSON.parse()
// rejects a string (Vite's build flags this eval() as a security smell in
// that dependency), so passing a string here would put arbitrary sink
// content through it. resolve_incoming_sink_items already returns parsed
// data, never a string, so this is inert today; keep it that way rather
// than ever JSON.stringify-then-pass a string.
function render_options(data) {
    return {
        id: props.elementId,
        data,
        showObjectSizes: true,
        // Read-only display, same as every other viewer module (doc/
        // module-plotter.rst's "The module is read-only") -- this is a
        // dev stub for the sink mechanism, not a JSON editor.
        allowEditing: false,
        // Peeled down to just the tree itself (line numbers, collapsible
        // nodes) -- its copy/expand/collapse-all actions move to
        // SinkViewport.vue's own hovering toolbar instead, which drives
        // this same library via its public API (openAll/closeAll/getJson)
        // rather than needing the native buttons to exist.
        //
        // `paging` is deliberately left at its default (enabled) rather
        // than switched off alongside everything else here: doing so
        // throws inside the library itself (confirmed against v4.7.1) --
        // with every other title-bar-triggering condition below also off,
        // jsontree.ts's own paging setup assumes a title-bar element that,
        // in that combination, was never created. Harmless to leave on:
        // `controlPanel.enabled: false` already kills the inline per-page
        // copy/open/close-all buttons paging would otherwise add to the
        // content itself (a *different* set from the title bar's, and the
        // one that actually mattered for multi-item payloads); paging
        // being on just means the title bar still gets created, empty (0
        // buttons, 0 text) -- SinkViewport.vue's own :deep(.title-bar)
        // rule hides that leftover div rather than another render option
        // fighting to remove it.
        title: {
            text: '',
            showCopyButton: false,
            showCloseOpenAllButtons: false,
            enableFullScreenToggling: false
        },
        // Also feeds the title bar's own existence check -- defaults to
        // *on*, offering an import/export/clear-JSON menu that's all
        // editing-flow chrome, irrelevant to a read-only display
        // (allowEditing: false above).
        sideMenu: {enabled: false},
        footer: {enabled: false},
        controlPanel: {enabled: false}
    };
}

onMounted(() => {
    window.$jsontree.render(document.getElementById(props.elementId), render_options(props.data));
});

// setJson (not a re-render) so the library's own expand/collapse state
// survives a data refresh -- sinkResolve.js's own "never cached, read
// fresh every time" means `data` gets a new array/object identity on
// every recompute even when nothing in it actually changed.
//
// Except when the new data is an empty array: jjsontree.js v4.7.1's own
// setJson silently no-ops for one (confirmed against the shipped dist) --
// its internal "is this defined" check is `value.toString() !== ""`, and
// `[].toString()` *is* `""`, so an empty array reads as "not defined" and
// the whole call, `data` assignment included, is skipped. That's exactly
// the case a cleared/de-propagated selection (store/sinkAutoDispatch.js's
// prune_selection_after_inbox_update) produces, so it can't be shrugged
// off as unlikely -- destroy+re-render sidesteps the bug entirely (a fresh
// render() call's own "is this defined" check runs on the *options object*,
// not on `data` inside it, so it never sees the empty array directly).
// Losing expand/collapse state on this one transition is a non-issue:
// there's nothing displayed to have had state worth keeping.
watch(() => props.data, newData => {
    if(Array.isArray(newData) && newData.length === 0) {
        window.$jsontree.destroy(props.elementId);
        window.$jsontree.render(document.getElementById(props.elementId), render_options(newData));
    } else {
        window.$jsontree.setJson(props.elementId, newData);
    }
});

onBeforeUnmount(() => {
    window.$jsontree.destroy(props.elementId);
});
</script>

<!-- No scoped <style> here: this wrapper div holds no visual styling of its
     own (SinkViewport.vue's .sink-viewport__entry owns the inter-entry
     spacing) -- it exists only as JsonTree.js's own render target. -->

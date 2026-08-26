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
  once rendered (its own title bar/footer/expand state) -- Vue never
  patches inside it, only mounts/updates/unmounts the whole thing via the
  library's own imperative API (window.$jsontree.render/setJson/destroy),
  the same "hand a ref to an imperative library, let it own that subtree"
  pattern DiagramViewport.vue's SVG or PlotViewport.vue's <canvas> use for
  their own reasons.
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

onMounted(() => {
    // `data` must stay a real array/object, never a JSON *string* -- the
    // library's own string-input path falls back to eval() when
    // JSON.parse() rejects a string (Vite's build flags this eval() as a
    // security smell in that dependency), so passing a string here would
    // put arbitrary sink content through it. resolve_incoming_sink_items
    // already returns parsed data, never a string, so this is inert today;
    // keep it that way rather than ever JSON.stringify-then-pass a string.
    window.$jsontree.render(document.getElementById(props.elementId), {
        id: props.elementId,
        data: props.data,
        showObjectSizes: true,
        // Read-only display, same as every other viewer module (doc/
        // module-plotter.rst's "The module is read-only") -- this is a
        // dev stub for the sink mechanism, not a JSON editor.
        allowEditing: false
    });
});

// setJson (not a re-render) so the library's own expand/collapse state
// survives a data refresh -- sinkResolve.js's own "never cached, read
// fresh every time" means `data` gets a new array/object identity on
// every recompute even when nothing in it actually changed.
watch(() => props.data, newData => {
    window.$jsontree.setJson(props.elementId, newData);
});

onBeforeUnmount(() => {
    window.$jsontree.destroy(props.elementId);
});
</script>

<!-- No scoped <style> here: this wrapper div holds no visual styling of its
     own (SinkViewport.vue's .sink-viewport__entry owns the inter-entry
     spacing) -- it exists only as JsonTree.js's own render target. -->

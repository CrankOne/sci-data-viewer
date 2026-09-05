<!--
  CodeFlask-based editor for one transform record (store/modules/
  transforms.js) -- stage 1 of the user-authored-transform feature (see
  components/SinkWiringPanel.vue's header comment, doc/data-model.rst).
  CodeFlask itself owns the mounted <div>'s DOM entirely (imperative API,
  same "hand a ref to a library, let it own that subtree" pattern
  modules/sink-view/SinkInboxEntry.vue uses for jjsontree.js) -- Vue never
  patches inside it.

  Chosen over vue-prism-editor: that library's only Vue-3-targeting release
  is a five-year-old, never-stabilized alpha (last published 2020, still at
  2.0.0-alpha.2) -- a real risk for a feature meant to stick around.
  CodeFlask has no Vue binding to go stale against in the first place (a
  plain JS class over a DOM element, exactly the same shape as jjsontree.js
  above), with prismjs -- actively maintained -- as its only dependency.
-->
<template>
  <div class="transform-editor-modal">
    <h3>Edit transform</h3>

    <p v-if="!transform" class="modal-error">Transform not found (it may have just been deleted).</p>
    <template v-else>
      <p class="transform-editor-name">
        <label for="transform-editor-name-input">Name</label>
        <input id="transform-editor-name-input" type="text" v-model.trim="nameDraft" @blur="commit_name">
      </p>

      <!-- Imported from a session file (sessionExport.js's own
           disable_imported_transforms) -- forced disabled regardless of
           who exported it, since there's no way to tell "my own file,
           reimported" from "someone else's". Stays disabled -- and this
           banner keeps showing -- until explicitly re-enabled below, no
           matter how many times the source is edited. -->
      <p v-if="!transform.enabled" class="transform-editor-warning">
        Imported and disabled pending review -- read the code below, then Enable it to let it run.
      </p>

      <div ref="editorMount" class="transform-editor-code"></div>

      <p class="transform-editor-hint">
        Function body: receives <code>item</code> (the selected payload) and <code>ctx</code>
        (<code>{itemId, srcID, payloadType}</code>). Must <code>return</code> the transformed value.
        Runs once per selected item, result logged to the browser console (no delivery target yet).
      </p>

      <p class="transform-editor-actions">
        <button v-if="!transform.enabled" type="button" @click="enable">Enable</button>
        <button type="button" @click="$emit('close')">Close</button>
      </p>
    </template>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useStore } from 'vuex';
import CodeFlask from 'codeflask';

const props = defineProps({
    transformId: {type: String, required: true}
});
defineEmits(['close']);

const store = useStore();
const transform = computed(() => store.getters['transforms/transform'](props.transformId));

const nameDraft = ref(transform.value?.name ?? '');
const editorMount = ref(null);
let flask = null;

function commit_name() {
    if(nameDraft.value) store.commit('transforms/rename_transform', {id: props.transformId, name: nameDraft.value});
}

function enable() {
    store.commit('transforms/set_transform_enabled', {id: props.transformId, enabled: true});
}

onMounted(() => {
    if(!editorMount.value || !transform.value) return;
    flask = new CodeFlask(editorMount.value, {language: 'js', lineNumbers: true, defaultTheme: false});
    flask.updateCode(transform.value.source);
    flask.onUpdate(source => store.commit('transforms/set_transform_source', {id: props.transformId, source}));
});

// CodeFlask has no destroy()/teardown of its own -- it only ever owns
// elements inside editorMount, which Vue itself unmounts along with the
// rest of this component's tree, so there's nothing left to clean up here
// beyond dropping the reference.
onBeforeUnmount(() => {
    flask = null;
});
</script>

<style scoped>
.transform-editor-modal {
  font-size: 9pt;
  width: 26rem;
  max-width: 100%;
}

.transform-editor-modal h3 {
  margin: 0 0 0.5rem;
}

.transform-editor-modal p {
  margin: 4pt 0;
}

.transform-editor-name label {
  display: block;
  margin-bottom: 2pt;
  color: var(--clr-fg-main-muted);
}

.transform-editor-name input {
  width: 100%;
}

.transform-editor-warning {
  padding: 4pt 6pt;
  border: 1px solid var(--clr-border-active);
  border-radius: 2pt;
  color: var(--clr-fg-main-highlighted);
}

.transform-editor-hint {
  color: var(--clr-fg-main-muted);
  font-size: 0.9em;
}

.transform-editor-actions {
  display: flex;
  gap: 5pt;
}

.modal-error {
  color: var(--clr-fg-main-highlighted);
}

.transform-editor-code {
  position: relative;
  height: 12rem;
  border: 1px solid var(--clr-border-inactive);
  border-radius: 2pt;
  overflow: hidden;
}

/* CodeFlask injects one global, unscoped <style id="codeflask-style"> the
   first time any instance mounts (node_modules/codeflask's own
   injectCss()) -- with `defaultTheme: false` above, that stylesheet is
   purely structural (position/overflow/font-family), no colors, so
   nothing here fights an existing rule; these :deep() selectors are simply
   more specific than that plain-class stylesheet and win without
   `!important`. Colors re-mapped onto this app's own --clr-legendN
   palette, same convention as modules/sink-view/SinkViewport.vue's own
   jjsontree.js re-theme. */
.transform-editor-modal :deep(.codeflask) {
  background: var(--clr-bg-panel);
  color: var(--clr-fg-panel);
  font-family: var(--font-data);
}

.transform-editor-modal :deep(.codeflask__lines) {
  background: var(--clr-bg-panel);
  border-right: 1px solid var(--clr-border-inactive);
}

.transform-editor-modal :deep(.codeflask__textarea) {
  caret-color: var(--clr-fg-panel);
}

.transform-editor-modal :deep(.codeflask .token.keyword) { color: var(--clr-legend1); }
.transform-editor-modal :deep(.codeflask .token.string) { color: var(--clr-legend3); }
.transform-editor-modal :deep(.codeflask .token.number),
.transform-editor-modal :deep(.codeflask .token.boolean) { color: var(--clr-legend4); }
.transform-editor-modal :deep(.codeflask .token.function) { color: var(--clr-legend2); }
.transform-editor-modal :deep(.codeflask .token.comment) { color: var(--clr-fg-main-muted); font-style: italic; }
</style>

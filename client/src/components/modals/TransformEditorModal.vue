<!--
  CodeMirror 6-based editor for one transform record (store/modules/
  transforms.js) -- stage 1 of the user-authored-transform feature (see
  components/SinkWiringPanel.vue's header comment, doc/data-model.rst).
  CodeMirror owns the mounted <div>'s DOM entirely (imperative API, same
  "hand a ref to a library, let it own that subtree" pattern modules/
  sink-view/SinkInboxEntry.vue uses for jjsontree.js) -- Vue never patches
  inside it.

  Replaced CodeFlask (see git history for the previous version) after
  todo.md recorded two independent Firefox-only failures from it: broken
  arrow-key/Home/End/Ctrl+C/Ctrl+V navigation, and visible text/coloring
  glitches with line numbers on once a line outgrows the viewport
  (kazzkiq/CodeFlask#102, never fixed upstream). Both trace to the same
  root cause -- CodeFlask is a transparent <textarea> stacked over a
  syntax-highlighted <pre>, plus a third line-number layer, kept in sync
  purely by mirroring scroll position via `transform: translate3d` on every
  scroll event (exactly the pattern behind Firefox's own "scroll-linked
  positioning effect" warning) -- rather than two unrelated bugs, so
  patching around each symptom wasn't worth it. CodeMirror 6 has no
  overlay/mirroring of that kind: a single real editable surface handles
  selection, IME and clipboard natively, and is what todo.md's own "switch
  editor" option asked for.
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
import { EditorState } from '@codemirror/state';
import { EditorView, keymap, lineNumbers, highlightActiveLine } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { syntaxHighlighting, HighlightStyle, indentOnInput, bracketMatching } from '@codemirror/language';
import { javascript } from '@codemirror/lang-javascript';
import { tags as t } from '@lezer/highlight';

const props = defineProps({
    transformId: {type: String, required: true}
});
defineEmits(['close']);

const store = useStore();
const transform = computed(() => store.getters['transforms/transform'](props.transformId));

const nameDraft = ref(transform.value?.name ?? '');
const editorMount = ref(null);
let view = null;

function commit_name() {
    if(nameDraft.value) store.commit('transforms/rename_transform', {id: props.transformId, name: nameDraft.value});
}

function enable() {
    store.commit('transforms/set_transform_enabled', {id: props.transformId, enabled: true});
}

// Committing on every keystroke was the actual cause of todo.md's "vast and
// lengthy updates making the app unresponsive" -- `transforms/
// set_transform_source` is one of transformsPersistence.js's own
// persistMutations, so every single commit was synchronously
// JSON.stringify-ing and localStorage.setItem-ing this session's *entire*
// transforms slice (store/persistence.js's write_stored has no debounce of
// its own). Debouncing the commit itself here -- rather than touching that
// shared persistence helper, which every other persisted slice also relies
// on -- keeps the fix scoped to the one editor that actually types fast
// enough for it to matter.
const COMMIT_DEBOUNCE_MS = 400;
let commitTimer = null;
let pendingSource = null;

function schedule_commit(source) {
    pendingSource = source;
    clearTimeout(commitTimer);
    commitTimer = setTimeout(flush_commit, COMMIT_DEBOUNCE_MS);
}

// Also called on unmount (closing the modal) so a pause shorter than the
// debounce window right before closing never silently drops the last few
// keystrokes.
function flush_commit() {
    clearTimeout(commitTimer);
    commitTimer = null;
    if(pendingSource === null) return;
    store.commit('transforms/set_transform_source', {id: props.transformId, source: pendingSource});
    pendingSource = null;
}

// Re-maps CodeMirror's own generic syntax tags onto this app's existing
// --clr-legendN palette -- the same mapping (and the same rationale: reuse
// the plot/graph legend colors rather than invent a separate code-editor
// palette) the old CodeFlask `.token.*` rules used, just expressed in
// CodeMirror's own token-tag vocabulary instead of Prism's CSS classes.
const highlightStyle = HighlightStyle.define([
    {tag: t.keyword, color: 'var(--clr-legend1)'},
    {tag: t.string, color: 'var(--clr-legend3)'},
    {tag: [t.number, t.bool], color: 'var(--clr-legend4)'},
    {tag: [t.function(t.variableName), t.function(t.propertyName)], color: 'var(--clr-legend2)'},
    {tag: t.comment, color: 'var(--clr-fg-main-muted)', fontStyle: 'italic'}
]);

// Structural + color theme, entirely through CSS custom properties so it
// tracks this app's own light/dark theme switch (main.js's data-theme)
// automatically, same as every other re-themed third-party widget (e.g.
// modules/sink-view/SinkInboxEntry.vue's own jjsontree.js palette) --
// nothing here needs to change when the app's theme does. Injected by
// CodeMirror itself as a real stylesheet (a StyleModule, not scoped CSS),
// so this needs no :deep() the way overriding CodeFlask's own classes did.
const baseTheme = EditorView.theme({
    '&': {
        height: '100%',
        backgroundColor: 'var(--clr-bg-panel)',
        color: 'var(--clr-fg-panel)'
    },
    '.cm-content': {
        fontFamily: 'var(--font-data)',
        caretColor: 'var(--clr-fg-panel)'
    },
    '.cm-scroller': {
        overflow: 'auto',
        fontFamily: 'var(--font-data)'
    },
    '.cm-gutters': {
        backgroundColor: 'var(--clr-bg-panel)',
        color: 'var(--clr-fg-main-muted)',
        borderRight: '1px solid var(--clr-border-inactive)'
    },
    '&.cm-focused .cm-selectionBackground, .cm-selectionBackground': {
        backgroundColor: 'var(--clr-border-active)'
    }
});

onMounted(() => {
    if(!editorMount.value || !transform.value) return;
    const state = EditorState.create({
        doc: transform.value.source,
        extensions: [
            lineNumbers(),
            highlightActiveLine(),
            history(),
            bracketMatching(),
            indentOnInput(),
            javascript(),
            syntaxHighlighting(highlightStyle),
            baseTheme,
            keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
            EditorView.updateListener.of(update => {
                if(update.docChanged) schedule_commit(update.state.doc.toString());
            })
        ]
    });
    view = new EditorView({state, parent: editorMount.value});
});

onBeforeUnmount(() => {
    flush_commit();
    view?.destroy();
    view = null;
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
</style>

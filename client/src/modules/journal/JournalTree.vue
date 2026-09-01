<!--
  Recursive renderer for one journal tree node (doc/module-journal.rst) --
  `{log: [{level, message}, ...], children: {procedureName: <same shape>,
  ...}}`, na64umff.py's `_collect_transition_log_tree`. A separate small
  component (not inlined into JournalViewport.vue) since Vue needs a named
  component to reference itself in its own template; `defineOptions({name})`
  is what makes that self-reference resolve without an explicit import.

  Deliberately dumb "combine at the client side" rendering (doc's
  "Rendering"): every procedure's own log stays under its own labeled
  subtree rather than being flattened server-side -- this is *a* way to
  read that tree (nested indentation, in traversal order), not the only
  possible one; a future revision could offer flattened/sorted/filtered
  views over the same data without touching the server shape at all.
-->
<template>
  <div class="journal-tree" :class="{'journal-tree--nested': depth > 0}">
    <div v-if="label" class="journal-tree__label">{{ label }}</div>
    <ul v-if="tree.log && tree.log.length" class="journal-tree__messages">
      <li
        v-for="(msg, i) in tree.log"
        :key="i"
        class="journal-tree__message"
        :class="`journal-tree__message--${msg.level ?? 'debug'}`"
      >{{ msg.message }}</li>
    </ul>
    <JournalTree
      v-for="(child, name) in tree.children"
      :key="name"
      :tree="child"
      :label="name"
      :depth="depth + 1"
    />
  </div>
</template>

<script setup>
defineOptions({ name: 'JournalTree' });

defineProps({
    tree: {type: Object, required: true},
    label: {type: String, default: null},
    depth: {type: Number, default: 0}
});
</script>

<style scoped>
.journal-tree--nested {
    margin: 4px 0 4px 10px;
    padding-left: 8px;
    border-left: 1px solid var(--clr-border-inactive);
}

.journal-tree__label {
    margin-bottom: 2px;
    font-size: 8pt;
    font-weight: bold;
    color: var(--clr-fg-main-muted);
}

.journal-tree__messages {
    margin: 0;
    padding: 0;
    list-style: none;
    font-family: var(--font-data);
}

.journal-tree__message {
    padding: 1px 4px;
    white-space: pre-wrap;
    word-break: break-word;
}

.journal-tree__message--debug {
    color: var(--clr-fg-panel);
}

/* Same borrowed-slot rationale as the app's other "no dedicated error
   token yet" cases -- see JournalViewport.vue's own former comment here
   before this file existed. */
.journal-tree__message--error {
    color: var(--clr-legend1);
}
</style>

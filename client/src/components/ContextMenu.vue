<!--
  Small, generic right-click context menu: a fixed-position list of actions
  at a given (x, y), closing itself on an outside click, Escape, or after
  any item is activated. No library -- the app's own menus are always this
  small (a handful of flat items, one level, no library-fed positioning
  edge cases worth a dependency for).

  `items`: [{label, action} | {separator: true}, ...]. A `disabled: true`
  entry renders greyed-out and inert rather than being omitted, so the menu
  shape stays predictable regardless of what's currently possible.
-->
<template>
  <Teleport to="body">
    <ul ref="rootEl" class="context-menu" :style="{left: `${x}px`, top: `${y}px`}" @contextmenu.prevent>
      <template v-for="(item, index) in items" :key="index">
        <li v-if="item.separator" class="context-menu__separator" role="separator" />
        <li v-else>
          <button
            type="button"
            class="context-menu__item"
            :disabled="item.disabled"
            @click="activate(item)"
          >{{ item.label }}</button>
        </li>
      </template>
    </ul>
  </Teleport>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue';

defineProps({
    x: {type: Number, required: true},
    y: {type: Number, required: true},
    items: {type: Array, required: true}
});
const emit = defineEmits(['close']);

const rootEl = ref(null);

function activate(item) {
    if(item.disabled) return;
    item.action?.();
    emit('close');
}

// Any pointerdown/right-click landing outside this menu's own DOM, or
// Escape, closes it. Checked by containment (event.target.closest) rather
// than closing unconditionally and letting a click "outside" vs "on an
// item" sort itself out afterward -- pointerdown fires (and, via this
// listener, would close the menu) well before the item's own `click`
// handler does on mouse release, so an unconditional close here would
// remove the menu from the DOM before activate() ever got a chance to run.
function on_outside_pointer(event) {
    if(rootEl.value?.contains(event.target)) return;
    emit('close');
}
function on_key(event) {
    if(event.key === 'Escape') emit('close');
}

onMounted(() => {
    window.addEventListener('pointerdown', on_outside_pointer, {capture: true});
    window.addEventListener('contextmenu', on_outside_pointer, {capture: true});
    window.addEventListener('keydown', on_key);
});
onBeforeUnmount(() => {
    window.removeEventListener('pointerdown', on_outside_pointer, {capture: true});
    window.removeEventListener('contextmenu', on_outside_pointer, {capture: true});
    window.removeEventListener('keydown', on_key);
});
</script>

<style scoped>
.context-menu {
  position: fixed;
  z-index: 1000;
  min-width: 10rem;
  margin: 0;
  padding: 0.25rem;
  list-style: none;
  border: 1px solid var(--clr-border-inactive);
  border-radius: 4pt;
  background: var(--clr-bg-panel);
  color: var(--clr-fg-panel);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.35);
  font-size: 9pt;
}

.context-menu__separator {
  margin: 0.25rem 0.4rem;
  border-top: 1px solid var(--clr-border-inactive);
}

.context-menu__item {
  display: block;
  width: 100%;
  padding: 0.3rem 0.6rem;
  text-align: left;
  background: transparent;
  color: inherit;
  border: none;
  border-radius: 3pt;
  cursor: pointer;
}

.context-menu__item:hover:not(:disabled) {
  background: var(--clr-bg-panel-header);
}

.context-menu__item:disabled {
  opacity: 0.5;
  cursor: default;
}
</style>

<template>
  <Teleport to="body">
    <div
      v-if="modal"
      class="modal-backdrop"
      @click.self="on_backdrop_click"
    >
      <div
        ref="boxEl"
        class="modal-box"
        role="dialog"
        aria-modal="true"
        tabindex="-1"
        @keydown.esc="on_escape"
      >
        <component
          :is="resolvedComponent"
          v-if="resolvedComponent"
          v-bind="modal.props"
          @close="close"
        />
        <div v-else class="modal-fallback">
          <p>Unknown modal: "{{ modal.name }}"</p>
          <button type="button" @click="close">Close</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { computed, nextTick, ref, watch } from 'vue';
import { useStore } from 'vuex';
import { resolve_modal } from '@/modules/modals';

const store = useStore();
const boxEl = ref(null);

const modal = computed(() => store.state.ui.modal);
const resolvedComponent = computed(() => modal.value ? resolve_modal(modal.value.name) : null);

// A blocking modal (only the first-run session picker today) has no
// sensible fallback state to dismiss into -- backdrop click / Escape are
// no-ops until the flow itself closes it.
function close() {
    if(modal.value?.blocking) return;
    store.commit('ui/close_modal');
}

function on_backdrop_click() {
    close();
}

function on_escape() {
    close();
}

// Focus the dialog box itself as it opens so a subsequent Escape keydown
// (which only bubbles from whatever currently has focus) is actually
// caught by the listener above, even before the user has clicked into a
// field inside it.
watch(modal, value => {
    if(value) nextTick(() => boxEl.value?.focus());
});
</script>

<style scoped>
.modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1000;

  display: grid;
  place-items: center;

  background: rgb(0 0 0 / 45%);
}

.modal-box {
  min-width: 20rem;
  max-width: min(32rem, calc(100vw - 2rem));
  max-height: calc(100vh - 2rem);
  overflow-y: auto;

  padding: 0.9rem 1rem;

  border: 1px solid var(--clr-border-active);
  border-radius: 0.3rem;
  background: var(--clr-bg-panel);
  color: var(--clr-fg-panel);

  font-size: 9pt;
}

.modal-box:focus {
  outline: none;
}

.modal-fallback {
  color: var(--clr-fg-main-highlighted);
}
</style>

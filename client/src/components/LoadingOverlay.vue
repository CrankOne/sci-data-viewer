<template>
  <Teleport to="body">
    <div v-if="names.length" class="loading-backdrop" role="status" aria-live="polite">
      <div class="loading-box">
        <div class="loading-spinner" aria-hidden="true" />
        <p class="loading-text">{{ label }}</p>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { computed } from 'vue';
import { useStore } from 'vuex';

const store = useStore();

// Names of resources currently fetching + applying their payload (see
// connection.js's loadingResourceNames getter) -- covers both the network
// request and whatever synchronous work applying it triggers (e.g.
// GeometryManager rebuilding three.js objects), which is exactly the
// window the app is unresponsive for.
const names = computed(() => store.getters['connection/loadingResourceNames']);

const label = computed(() => {
    if(names.value.length === 1) return `Updating from source ${names.value[0]}…`;
    return `Updating from ${names.value.length} sources…`;
});
</script>

<style scoped>
.loading-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1100;

  display: grid;
  place-items: center;

  background: rgb(0 0 0 / 45%);
  /* Not dismissible (unlike ModalHost's modals) -- no click/Escape handler
     is wired up at all, and this catches pointer events so nothing
     underneath is interactable while shown. */
  cursor: wait;
}

.loading-box {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.6rem;

  padding: 1.2rem 1.6rem;

  border: 1px solid var(--clr-border-active);
  border-radius: 0.3rem;
  background: var(--clr-bg-panel);
  color: var(--clr-fg-panel);

  font-family: monospace;
  font-size: 9pt;
}

.loading-spinner {
  width: 2rem;
  height: 2rem;
  border-radius: 50%;
  border: 3px solid var(--clr-border-inactive);
  border-top-color: var(--clr-accent);
  animation: loading-spin 0.8s linear infinite;
}

.loading-text {
  margin: 0;
  white-space: nowrap;
}

@keyframes loading-spin {
  to { transform: rotate(360deg); }
}
</style>

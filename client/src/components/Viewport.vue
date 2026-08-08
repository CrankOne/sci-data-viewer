<template>
  <div class="viewport-host">
    <component :is="activeModule.viewportComponent" v-if="activeModule" />
    <p v-else class="viewport-empty">Load a data source to begin.</p>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { useStore } from 'vuex';
import { get_module } from '@/modules/registry';

const store = useStore();
const activeType = computed(() => store.getters['connection/activeType']);
const activeModule = computed(() => get_module(activeType.value));
</script>

<style scoped>
.viewport-host {
    position: relative;
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
}

.viewport-empty {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    color: var(--clr-fg-main-muted);
}
</style>

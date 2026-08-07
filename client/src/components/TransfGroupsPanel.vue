<template>
  <NavBarEntity :defaultOpenedState="true">
    <template #header>
      Transformation groups
    </template>

    <template #content>
      <div v-if="groupNames.length === 0" class="empty-state">
        No transformation groups found in loaded geometry yet.
      </div>

      <div v-else class="transf-group-editor">
        <div class="transf-group-select-row">
          <select
            class="transf-group-select"
            v-model="activeGroupName"
          >
            <option
              v-for="name in groupNames"
              :key="name"
              :value="name"
            >
              {{ name }}
            </option>
          </select>

          <button
            type="button"
            class="icon-button"
            title="Reset to identity"
            aria-label="Reset to identity"
            @click="reset_active_group"
          >
            <span class="vi vi-camera-reset" aria-hidden="true" />
          </button>
        </div>

        <div v-if="activeGroup" class="transf-group-fields">
          <Vector3Field
            label="Position"
            :model-value="activeGroup.position"
            @update:model-value="patch({ position: $event })"
          />

          <Vector3Field
            label="Rotation, deg"
            :model-value="activeGroup.rotation"
            :step="1"
            @update:model-value="patch({ rotation: $event })"
          />

          <Vector3Field
            label="Scale"
            :model-value="activeGroup.scale"
            :step="0.01"
            @update:model-value="patch({ scale: $event })"
          />
        </div>
      </div>
    </template>
  </NavBarEntity>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import { useStore } from 'vuex';
import NavBarEntity from './NavBarEntity.vue';
import Vector3Field from './Vector3Field.vue';

const store = useStore();

const groupNames = computed(() => store.getters['transfGroups/groupNames']);

const activeGroupName = ref(null);

watch(groupNames, (names) => {
    if(!names.includes(activeGroupName.value))
        activeGroupName.value = names[0] ?? null;
}, { immediate: true });

const activeGroup = computed(
    () => activeGroupName.value
        ? store.getters['transfGroups/group'](activeGroupName.value)
        : null
);

function patch(value) {
    if(!activeGroupName.value) return;
    store.commit('transfGroups/patch_group', {
        name: activeGroupName.value,
        patch: value
    });
}

function reset_active_group() {
    if(!activeGroupName.value) return;
    store.commit('transfGroups/reset_group', activeGroupName.value);
}
</script>

<style scoped>
.empty-state {
    color: var(--clr-fg-main-muted);
    font-style: italic;
    padding: 0.3rem 0;
}

.transf-group-editor {
    display: grid;
    gap: 0.4rem;
}

.transf-group-select-row {
    display: flex;
    align-items: center;
    gap: 0.3rem;
}

.transf-group-select {
    flex: 1;
    min-width: 0;
}

.icon-button {
    display: inline-grid;
    place-items: center;
    width: 1.8rem;
    height: 1.8rem;
    padding: 0;
}

.transf-group-fields {
    display: grid;
    gap: 0.4rem;
}
</style>

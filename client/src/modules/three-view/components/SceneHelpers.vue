<template>
  <NavBarEntity>
    <template #header>Scene Helpers</template>
    <template #actions><slot name="actions" /></template>
    <template #content>
      <div>Highlight invis. selection <input type="checkbox" v-model="highlightInvisibleOnHover"/></div>
      <div
        title="When off, only one item under the cursor is highlighted at a time; the scroll wheel cycles between them instead of zooming."
      >
        Highlight all items under cursor
        <input type="checkbox" v-model="highlightAllUnderCursor"/>
      </div>
    </template>
  </NavBarEntity>
</template>

<script>
import NavBarEntity from '@/components/NavBarEntity.vue'

export default {
    name: 'SceneHelpers',
    components: {NavBarEntity},
    computed: {
        // TODO(multi-scene phase 2/3): replace with an `instanceId` prop
        // resolving its own bound context via widgetInstances -- for now
        // there is exactly one bootstrap-created geo3d context.
        contextId() {
            return this.$store.getters['contexts/listForType']('geo3d')[0]?.id ?? null;
        },
        highlightInvisibleOnHover: {
            get() { return this.$store.state[`view3D_${this.contextId}`].highlightHiddenSelection; },
            set(value) { this.$store.commit(`view3D_${this.contextId}/toggle_highlight_hidden`, value); }
        },
        highlightAllUnderCursor: {
            get() { return this.$store.state[`view3D_${this.contextId}`].highlightAllUnderCursor; },
            set(value) { this.$store.commit(`view3D_${this.contextId}/toggle_highlight_all_under_cursor`, value); }
        }
    }
}
</script>

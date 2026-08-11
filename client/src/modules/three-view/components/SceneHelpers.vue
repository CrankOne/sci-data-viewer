<template>
  <NavBarEntity>
    <template #header>Scene Helpers</template>
    <template #content>
      <div>Highlight invis. selection <input type="checkbox" v-model="highlightInvisibleOnHover"/></div>
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
        }
    }
}
</script>

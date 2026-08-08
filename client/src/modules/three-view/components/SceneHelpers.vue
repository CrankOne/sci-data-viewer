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
        highlightInvisibleOnHover: {
            get() { return this.$store.state.view3D.highlightHiddenSelection; },
            set(value) { this.$store.commit('view3D/toggle_highlight_hidden', value); }
        }
    }
}
</script>

<template>
  <NavBarEntity>
    <template #header>Scene Helpers</template>
    <template #content>
      <div>X<input min="1.0e-12" max="1.0e+3"  :value.number="scaleX" @input="e => this.update_scale(e, 'x')"/></div>
      <div>Y<input min="1.0e-12" max="1.0e+3"  :value.number="scaleY" @input="e => this.update_scale(e, 'y')"/></div>
      <div>Z<input min="1.0e-12" max="1.0e+3"  :value.number="scaleZ" @input="e => this.update_scale(e, 'z')"/></div>
    </template>
  </NavBarEntity>
</template>

<script>
import {mapState} from 'vuex';
import NavBarEntity from './NavBarEntity.vue'

export default {
  name: 'SceneHelpers',
  components: {NavBarEntity},
  computed: {
    ...mapState({
        scaleX: state => state.view3D.axesScales[0],
        scaleY: state => state.view3D.axesScales[1],
        scaleZ: state => state.view3D.axesScales[2],
    }),
  },
  methods: {
    update_scale(e, vn) {
      this.$store.commit('view3D/reset_region_of_interest');
      this.$store.commit('view3D/change_axis_scale', {'var': vn, 'v': e.target.value});
    }
  }
}
</script>


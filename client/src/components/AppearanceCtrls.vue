<template>
  <NavBarEntity>
    <template #header>
      Appearance and controls
    </template>

    <template #content>

      <div class="container">
        <!-- Theme switch -->
        <div>
          <span>Theme</span>
        </div>
        <div class="control">
          <select id="theme-select" v-model="theme">
            <option
              v-for="option in themes"
              :key="option"
              :value="option"
            > {{ option }} </option>
          </select>
        </div>

        <!-- Turns on on-hover and selection highlight for invisible items -->
        <div>
          <span>Highlight invis. selection</span>
        </div>
        <div class="control">
          <input type="checkbox" v-model="highlightInvisibleOnHover"/>
        </div>

        <!-- Size of the on-hover raycasting (natural units) -->
        <div>
          <span>On-hover min ray dist.</span>
        </div>
        <div>
          <input type="number" id="onMouseHover" min="0.01" max="100" v-model="mouseHoverRayDistNU"/>
        </div>

        <!-- Size of the on-hover raycasting cursor -->
        <div>
          <span>On-hover cursor radius (px)</span>
        </div>
        <div>
          <input type="number" id="onMouseHover" min="1" max="100" v-model="mouseHoverRadiusPx"/>
        </div>

      </div>
    </template>
  </NavBarEntity>
</template>

<script>
import NavBarEntity from './NavBarEntity.vue';

export default {
  name: 'AppearanceCtrls',

  components: {
    NavBarEntity,
  },

  data() {
    return {
      themes: ['bright', 'dark'/*, 'auto'*/],
    };
  },

  computed: {
    theme: {
      get() { return this.$store.state.appCommon.theme; },
      set(value) { this.$store.commit('appCommon/set_theme', value); },
    },

    highlightInvisibleOnHover: {
      get() { return this.$store.state.view3D.highlightHidden; },
      set(value) { this.$store.commit('view3D/toggle_highlight_hidden', value); }
    },

    mouseHoverRadiusPx: {
      get() { return this.$store.state.view3D.onMouseHoverRaycastSizePx; },
      set(value) { this.$store.commit('view3D/set_on_hover_highlight_size_px', value); }
    },

    mouseHoverRayDistNU: {
      get() { return this.$store.state.view3D.onMouseHoverRaycastDist; },
      set(value) { this.$store.commit('view3D/set_on_hover_broadening', value); }
    },
  },
};
</script>

<style scoped>
.container {
  display: grid;
  grid-template-columns: auto min-content;
}

.container div {
  margin: .1em;
  text-align: right;
  align-content: center;
}

.container div.control {
  text-align: left;
}

.control input {
  width: auto;
}
</style>

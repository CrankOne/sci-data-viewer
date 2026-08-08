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

      </div>
    </template>
  </NavBarEntity>
</template>

<script>
import NavBarEntity from './NavBarEntity.vue';

export default {
  name: 'AppearanceCtrls',

  components: {
    NavBarEntity
  },

  data() {
    return {
      themes: ['bright', 'dark'/*, 'auto'*/]
    };
  },

  computed: {
    theme: {
      get() { return this.$store.state.appCommon.theme; },
      set(value) { this.$store.commit('appCommon/set_theme', value); }
    }
  }
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

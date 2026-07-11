<template>
  <NavBarEntity>
    <template #header>
      Appearance and controls
    </template>

    <template #content>
      <label for="theme-select">Theme</label>

      <select
        id="theme-select"
        v-model="theme"
      >
        <option
          v-for="option in themes"
          :key="option"
          :value="option"
        >
          {{ option }}
        </option>
      </select>
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
      get() {
        return this.$store.state.appCommon.theme;
      },

      set(value) {
        this.$store.commit('appCommon/set_theme', value);
      },
    },
  },
};
</script>

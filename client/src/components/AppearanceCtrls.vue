<template>
  <NavBarEntity>
    <template #header>
      Application Controls
    </template>
    <template #actions><slot name="actions" /></template>

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

      <div class="session-section">
        <h4 class="scenes-heading">Session</h4>
        <p class="session-name">{{ sessionName }}</p>
        <button type="button" @click="switch_session">Switch session&hellip;</button>
      </div>

      <div class="scenes-section">
        <h4 class="scenes-heading">Scenes</h4>

        <table v-if="scenes.length" class="scenes-table">
          <thead>
            <tr><th>Name</th><th>Type</th><th></th></tr>
          </thead>
          <tbody>
            <tr v-for="scene in scenes" :key="scene.id">
              <td>
                <input
                  type="text"
                  :value="scene.name"
                  @change="rename_scene(scene.id, $event.target.value)"
                >
              </td>
              <td>{{ scene.dataType }}</td>
              <td>
                <button
                  type="button"
                  class="header-action"
                  title="Remove scene"
                  aria-label="Remove scene"
                  @click="remove_scene(scene.id)"
                >
                  <span class="vi vi-trash-bin" aria-hidden="true" />
                </button>
              </td>
            </tr>
          </tbody>
        </table>
        <p v-else class="empty-state">No scenes yet.</p>

        <button v-if="contextualModule" type="button" @click="add_scene">+ Add scene</button>
      </div>
    </template>
  </NavBarEntity>
</template>

<script>
import NavBarEntity from './NavBarEntity.vue';
import { all_modules } from '@/modules/registry';
import { create_scene_with_viewport } from '@/sceneCreation';

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
    },

    sessionName() {
      return this.$store.state.session.activeName ?? '(unnamed)';
    },

    scenes() {
      return this.$store.getters['contexts/list'];
    },

    // v1 supports a single contextual module type (today: geo3d); a future
    // second one would need a type picker in add_scene() below too.
    contextualModule() {
      return all_modules().find(mod => mod.contextual) ?? null;
    }
  },

  methods: {
    switch_session() {
      this.$store.commit('ui/open_modal', {name: 'session-picker', props: {mode: 'switch'}});
    },

    rename_scene(id, name) {
      this.$store.commit('contexts/rename_context', {id, name});
    },

    async remove_scene(id) {
      const sources = this.$store.getters['connection/resourcesForContext'](id);
      if(sources.length > 0) {
        const proceed = window.confirm(
          `This scene has ${sources.length} assigned source(s), which will be reassigned elsewhere. Continue?`
        );
        if(!proceed) return;
      }
      try {
        await this.$store.dispatch('contexts/remove_context', {id});
      } catch(error) {
        window.alert(error.message);
      }
    },

    // Creates a new scene and immediately gives it a viewport -- a scene
    // can't usefully exist without one -- by wrapping the entire current
    // layout in a new split, so this always has somewhere valid to place
    // it regardless of the current tree shape. See sceneCreation.js: every
    // "New scene…" option in the app goes through the same helper.
    async add_scene() {
      const module = this.contextualModule;
      if(!module) return;
      await create_scene_with_viewport(this.$store, {dataType: module.dataType});
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

.session-section {
  margin-top: .6em;
}

.session-name {
  margin: 0 0 .3em;
  font-weight: bold;
}

.scenes-section {
  margin-top: .6em;
}

.scenes-heading {
  margin: 0 0 .3em;
  font-size: .85rem;
  color: var(--clr-fg-main-muted);
}

.scenes-table {
  width: 100%;
  border-collapse: collapse;
  font-size: .85rem;
}

.scenes-table th {
  text-align: left;
  color: var(--clr-fg-main-muted);
  font-weight: normal;
}

.scenes-table td {
  padding: .15em 0;
}

.scenes-table input {
  width: 100%;
  box-sizing: border-box;
}

.empty-state {
  color: var(--clr-fg-main-muted);
  font-style: italic;
  margin: .3em 0;
}
</style>

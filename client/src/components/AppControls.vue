<template>
  <NavBarEntity>
    <template #header>
      Application Controls
    </template>
    <template #actions><slot name="actions" /></template>

    <template #content>

      <div v-if="serverInfo" class="server-info">
        sci-viewer-server v{{ serverInfo.serverVersion }}
        <template v-if="serverInfo.plugins.length">
          &mdash; plugins: {{ pluginSummary }}
        </template>
      </div>

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

      <div class="layout-section">
        <h4 class="scenes-heading">Layout</h4>
        <div class="split-buttons">
          <!-- Enters button-triggered split mode (SplitModeOverlay.vue):
               hover a panel to preview the split line, click to apply,
               Escape to cancel. Icons are placeholders pending hand-drawn
               ones -- swap for real vi-* icon-font classes once added to
               viewer-icons.* (see components/App/viewer-icons.*). -->
          <button
            type="button"
            class="split-mode-btn"
            title="Split panel vertically"
            aria-label="Split panel vertically"
            @click="enter_split_mode('row')"
          >
            <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
              <rect x="1" y="1" width="14" height="14" rx="1" fill="none" stroke="currentColor" stroke-width="1.3"/>
              <line x1="8" y1="1" x2="8" y2="15" stroke="currentColor" stroke-width="1.3"/>
            </svg>
          </button>
          <button
            type="button"
            class="split-mode-btn"
            title="Split panel horizontally"
            aria-label="Split panel horizontally"
            @click="enter_split_mode('column')"
          >
            <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
              <rect x="1" y="1" width="14" height="14" rx="1" fill="none" stroke="currentColor" stroke-width="1.3"/>
              <line x1="1" y1="8" x2="15" y2="8" stroke="currentColor" stroke-width="1.3"/>
            </svg>
          </button>
        </div>
      </div>

      <div class="session-section">
        <h4 class="scenes-heading">Session</h4>
        <p class="session-name">{{ sessionName }}</p>
        <button type="button" @click="switch_session">Switch session&hellip;</button>
      </div>

      <div class="scenes-section">
        <h4 class="scenes-heading">Scopes</h4>

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
                  title="Remove scope"
                  aria-label="Remove scope"
                  @click="remove_scene(scene.id)"
                >
                  <span class="vi vi-trash-bin" aria-hidden="true" />
                </button>
              </td>
            </tr>
          </tbody>
        </table>
        <p v-else class="empty-state">No scopes yet.</p>

        <div v-if="contextualModules.length" class="add-scene-row">
          <select
            v-if="contextualModules.length > 1"
            v-model="addSceneType"
            aria-label="New scope type"
          >
            <option v-for="m in contextualModules" :key="m.dataType" :value="m.dataType">{{ m.label }}</option>
          </select>
          <button type="button" @click="add_scene">+ Add scope</button>
        </div>
      </div>

      <div class="share-section">
        <h4 class="scenes-heading">Share</h4>
        <button type="button" :disabled="!shareable" @click="copy_permalink">Copy permalink</button>
        <p v-if="!shareable" class="empty-state">
          Load an item from a random-access data source to enable sharing.
        </p>
        <p v-else-if="copyStatus === 'copied'" class="copy-status">Copied to clipboard.</p>
        <p v-else-if="copyStatus === 'error'" class="copy-status copy-status-error">Could not copy link.</p>
      </div>
    </template>
  </NavBarEntity>
</template>

<script>
import NavBarEntity from './NavBarEntity.vue';
import { all_modules } from '@/modules/registry';
import { create_scene_with_viewport } from '@/sceneCreation';
import { build_permalink, has_shareable_content } from '@/shareLink';
import { fetch_plugin_manifest } from '@/pluginManifest';

export default {
  name: 'AppControls',

  components: {
    NavBarEntity
  },

  data() {
    return {
      themes: ['bright', 'dark'/*, 'auto'*/],
      // 'copied' | 'error' | null -- transient feedback for copy_permalink,
      // cleared a couple seconds after either outcome.
      copyStatus: null,
      // Which contextual module's scene "+ Add scene" creates -- only
      // exposed as a picker (template above) when more than one exists.
      addSceneType: all_modules().find(mod => mod.contextual)?.dataType ?? null,
      // {serverVersion, plugins: [{id, version}]} from GET /api/plugins,
      // fetched once on mount -- purely informational, so a failed fetch
      // just leaves this null (no server-info line shown) rather than
      // surfacing an error anywhere.
      serverInfo: null
    };
  },

  computed: {
    theme: {
      get() { return this.$store.state.appCommon.theme; },
      set(value) { this.$store.commit('appCommon/set_theme', value); }
    },

    pluginSummary() {
      return this.serverInfo.plugins
        .map(p => p.version ? `${p.id} v${p.version}` : p.id)
        .join(', ');
    },

    sessionName() {
      return this.$store.state.session.activeName ?? '(unnamed)';
    },

    scenes() {
      return this.$store.getters['contexts/list'];
    },

    contextualModules() {
      return all_modules().filter(mod => mod.contextual);
    },

    // Whether there's anything a permalink could carry at all -- see
    // shareLink.js's is_shareable_resource for the precise criteria
    // (addressable+enumerable, connected to a scene, an item loaded).
    shareable() {
      return has_shareable_content(this.$store);
    }
  },

  async mounted() {
    try {
      const manifest = await fetch_plugin_manifest();
      this.serverInfo = {serverVersion: manifest.serverVersion, plugins: manifest.plugins};
    } catch(error) {
      console.error('Could not fetch server/plugin info:', error);
    }
  },

  methods: {
    enter_split_mode(direction) {
      this.$store.commit('ui/enter_split_mode', direction);
    },

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
          `This scope has ${sources.length} assigned source(s), which will be reassigned elsewhere. Continue?`
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
      if(!this.addSceneType) return;
      await create_scene_with_viewport(this.$store, {dataType: this.addSceneType});
    },

    // Builds a permalink snapshotting which items are currently loaded
    // (and selected) on this session's random-access data sources, and
    // puts it on the clipboard -- see shareLink.js for exactly what it
    // does and doesn't carry.
    async copy_permalink() {
      this.copyStatus = null;
      try {
        const url = await build_permalink(this.$store, this.$router);
        await navigator.clipboard.writeText(url);
        this.copyStatus = 'copied';
      } catch(error) {
        console.error('Could not build permalink:', error);
        this.copyStatus = 'error';
      }
      setTimeout(() => { this.copyStatus = null; }, 2500);
    }
  }
};
</script>

<style scoped>
.server-info {
  margin-bottom: .5em;
  font-size: .78rem;
  color: var(--clr-fg-main-muted);
}

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

.layout-section {
  margin-top: .6em;
}

.split-buttons {
  display: flex;
  gap: .3em;
}

.split-mode-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 4pt;
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

.add-scene-row {
  display: flex;
  align-items: center;
  gap: .3em;
}

.share-section {
  margin-top: .6em;
}

.copy-status {
  margin: .3em 0 0;
  font-size: .85rem;
  color: var(--clr-fg-main-muted);
}

.copy-status-error {
  color: var(--clr-fg-main-highlighted);
}
</style>

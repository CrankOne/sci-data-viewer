<template>
  <div class="add-source-modal">
    <!-- step 1: name + URL, resolved (manifest only, no data fetch yet). -->
    <template v-if="!pendingContextStep">
      <h3>Add data source</h3>
      <form @submit.prevent="submit_add_source">
        <p>
          <label for="add-source-name">Name</label>
          <input id="add-source-name" type="text" v-model.trim="newSourceName" placeholder="my-source">
        </p>
        <p>
          <label for="add-source-endpoint">Principal URL</label>
          <input id="add-source-endpoint" type="text" v-model.trim="newSourceEndpoint" placeholder="https://example.org/api/source/events">
        </p>
        <p v-if="error" class="modal-error">{{ error }}</p>
        <p class="add-source-actions">
          <button type="submit">Add</button>
          <button type="button" @click="cancel">Cancel</button>
        </p>
      </form>
    </template>

    <!-- step 2, only for a resolved type that needs a scene (contextual
         module, see modules/registry.js) -- the source's own type is now
         known, but nothing has been fetched beyond its (cheap) manifest. -->
    <template v-else>
      <h3>Add data source</h3>
      <form @submit.prevent="confirm_pending_context">
        <p>"{{ pendingContextStep.name }}" is a {{ pendingContextStep.dataType }} source and needs a scene to load into.</p>
        <p>
          <label for="add-source-scene">Scene</label>
          <select id="add-source-scene" v-model="pendingContextId">
            <option value="">New scene&hellip;</option>
            <option v-for="ctx in contextsForPending" :key="ctx.id" :value="ctx.id">{{ ctx.name }}</option>
          </select>
        </p>
        <p v-if="error" class="modal-error">{{ error }}</p>
        <p class="add-source-actions">
          <button type="submit">Add</button>
          <button type="button" @click="cancel">Cancel</button>
        </p>
      </form>
    </template>
  </div>
</template>

<script>
import { get_module } from '@/modules/registry';
import { create_scene_with_viewport } from '@/sceneCreation';

export default {
    name: 'AddSourceModal',

    emits: ['close'],

    data() {
        return {
            newSourceName: '',
            newSourceEndpoint: '',
            error: null,
            // {name, dataType} once the manifest resolves to a contextual
            // type and a scene choice is needed before loading data.
            pendingContextStep: null,
            pendingContextId: ''  // '' means "create a new scene"
        };
    },

    computed: {
        dataSources() {
            return this.$store.state.connection.resources;
        },
        contextsForPending() {
            if(!this.pendingContextStep) return [];
            return this.$store.getters['contexts/listForType'](this.pendingContextStep.dataType);
        }
    },

    methods: {
        // Step 1: creates the resource and resolves its (cheap) manifest --
        // deliberately not the (potentially large) data payload yet, so a
        // contextual type can be routed through step 2 below before
        // anything but the manifest is fetched.
        async submit_add_source() {
            const name = this.newSourceName;
            const endpoint = this.newSourceEndpoint;

            if(!name || !endpoint) {
                this.error = 'Both name and principal URL are required';
                return;
            }
            if(name in this.dataSources) {
                this.error = `Source "${name}" is already added`;
                return;
            }
            try {
                new URL(endpoint);
            } catch {
                this.error = 'Principal URL must be an absolute URL, e.g. https://example.org/api/source/events';
                return;
            }

            this.error = null;
            try {
                await this.$store.dispatch('connection/add_resource', {name, endpoint, load: false});
            } catch(error) {
                this.error = `Failed to add "${name}": ${error.message}`;
                return;
            }

            const resource = this.$store.state.connection.resources[name];
            if(resource.status === 'error') {
                this.error = resource.error ?? `Failed to resolve manifest for "${name}"`;
                this.$store.dispatch('connection/remove_resource', name);
                return;
            }

            const module = get_module(resource.type);
            if(module?.contextual) {
                this.pendingContextStep = {name, dataType: module.dataType};
                this.pendingContextId = '';
                return;
            }

            await this.finish_add_source(name, null);
        },

        // Step 2 (contextual types only): a scene has been picked (or "new
        // scene" left selected) -- assign it, then fetch the actual data.
        // "New scene…" goes through sceneCreation.js's shared helper, same
        // as every other "New scene…" picker in the app, so a scene never
        // ends up without a viewport.
        async confirm_pending_context() {
            const {name, dataType} = this.pendingContextStep;
            let contextId = this.pendingContextId || null;

            this.error = null;
            try {
                if(!contextId) {
                    const created = await create_scene_with_viewport(this.$store, {dataType});
                    contextId = created.contextId;
                }
                await this.finish_add_source(name, contextId);
            } catch(error) {
                this.error = `Failed to add "${name}": ${error.message}`;
            }
        },

        async finish_add_source(name, contextId) {
            await this.$store.dispatch('connection/assign_resource_context', {name, contextId});
            try {
                await this.$store.dispatch('connection/load_resource_data', {name});
            } catch(error) {
                this.error = `Failed to load "${name}": ${error.message}`;
                return;
            }
            this.$emit('close');
        },

        // User explicitly aborted -- if step 2 was reached, the resource
        // already exists (unloaded); remove it rather than leaving an
        // orphan.
        cancel() {
            if(this.pendingContextStep) this.$store.dispatch('connection/remove_resource', this.pendingContextStep.name);
            this.$emit('close');
        }
    }
}
</script>

<style scoped>
.add-source-modal {
  font-family: monospace;
  font-size: 9pt;
}

.add-source-modal h3 {
  margin: 0 0 0.5rem;
}

.add-source-modal p {
  margin: 4pt 0;
}

.add-source-modal label {
  display: block;
  margin-bottom: 2pt;
  color: var(--clr-fg-main-muted);
}

.add-source-modal input {
  width: 100%;
  box-sizing: border-box;
}

.modal-error {
  color: var(--clr-fg-main-highlighted);
}

.add-source-actions {
  display: flex;
  gap: 5pt;
}
</style>

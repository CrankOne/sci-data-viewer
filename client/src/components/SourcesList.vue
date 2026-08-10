<template>
  <NavBarEntity>
    <template #header>Data Sources</template>
    <template #content>
      <div class="dataSourceList">
        <source-list-item v-for="(pl, name) in dataSources" :name="name" :definition="pl"/>
      </div>

      <!-- add an arbitrary source by its principal URL (doc/sources.rst) -->
      <form v-if="addFormOpen" class="add-source-form" @submit.prevent="submit_add_source">
        <p>
          <label for="add-source-name">Name</label>
          <input id="add-source-name" type="text" v-model.trim="newSourceName" placeholder="my-source">
        </p>
        <p>
          <label for="add-source-endpoint">Principal URL</label>
          <input id="add-source-endpoint" type="text" v-model.trim="newSourceEndpoint" placeholder="https://example.org/api/source/events">
        </p>
        <p v-if="addError" class="add-source-error">{{ addError }}</p>
        <p class="add-source-actions">
          <button type="submit">Add</button>
          <button type="button" @click="cancel_add_source">Cancel</button>
        </p>
      </form>
      <button v-else type="button" @click="addFormOpen = true">Add</button>
    </template>
  </NavBarEntity>
</template>

<script>
import {mapState} from 'vuex'
import NavBarEntity from './NavBarEntity.vue'
import SourceListItem from './SourceListItem.vue'

export default {
    name: 'SourceList',
    components: {NavBarEntity, SourceListItem},
    data() {
        return {
            addFormOpen: false,
            newSourceName: '',
            newSourceEndpoint: '',
            addError: null
        };
    },
    computed: {
        dataSources() {
            console.debug(this.$store.state.connection.resources);  // XXX
            return this.$store.state.connection.resources;
        }
    },
    methods: {
        async submit_add_source() {
            const name = this.newSourceName;
            const endpoint = this.newSourceEndpoint;

            if(!name || !endpoint) {
                this.addError = 'Both name and principal URL are required';
                return;
            }
            if(name in this.dataSources) {
                this.addError = `Source "${name}" is already added`;
                return;
            }
            try {
                new URL(endpoint);
            } catch {
                this.addError = 'Principal URL must be an absolute URL, e.g. https://example.org/api/source/events';
                return;
            }

            this.addError = null;
            try {
                await this.$store.dispatch('connection/add_resource', {name, endpoint, load: true});
            } catch(error) {
                this.addError = `Failed to add "${name}": ${error.message}`;
                return;
            }
            this.cancel_add_source();
        },

        cancel_add_source() {
            this.addFormOpen = false;
            this.newSourceName = '';
            this.newSourceEndpoint = '';
            this.addError = null;
        }
    }
}
</script>

<style scoped>
.add-source-form {
  font-family: monospace;
  font-size: 9pt;
}

.add-source-form p {
  margin: 4pt 0;
}

.add-source-form label {
  display: block;
  margin-bottom: 2pt;
  color: var(--clr-fg-main-muted);
}

.add-source-form input {
  width: 100%;
  box-sizing: border-box;
}

.add-source-error {
  color: var(--clr-fg-main-highlighted);
}

.add-source-actions {
  display: flex;
  gap: 5pt;
}
</style>


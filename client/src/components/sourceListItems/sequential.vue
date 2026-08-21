<template>
  <div>
    <div v-if="cursorURL" class="seq-status">
      <template v-if="cursorFinished">Finished at event {{ cursorStep }} &mdash; release and start again to replay.</template>
      <template v-else>Event {{ cursorStep }}<span v-if="dataSize != null"> ({{ dataSize }} bytes)</span></template>
    </div>
    <div v-else class="seq-status seq-status-muted">No cursor &mdash; start one to begin traversing.</div>
    <!-- create_resource_cursor/advance_resource_cursor also mirror a
         failure onto resource.status/error (for LoadingOverlay's benefit --
         see connection.js), but actionError below already covers every
         action's failure with a friendlier "Failed to ..." prefix, so it's
         the only one shown here to avoid a duplicate message. -->
    <div v-if="actionError" class="seq-error">{{ actionError }}</div>

    <QueryOptionsForm :name="name" :queryOptions="queryOptions" :queryValues="queryValues"/>

    <div class="seq-actions">
      <button type="button" :disabled="Boolean(cursorURL) || busy" @click="start_cursor">Start cursor</button>
      <button type="button" :disabled="!cursorURL || cursorFinished || busy" @click="advance">Next</button>
      <button type="button" :disabled="!cursorURL || busy" @click="release">Release</button>
    </div>
  </div>
</template>

<script>
import QueryOptionsForm from './QueryOptionsForm.vue';

export default {
    name: 'SequentialSourceListItem',
    components: {QueryOptionsForm},
    props: {
        name: String,
        endpoint: String,
        status: String,
        manifest: Object,
        type: String,
        dataURL: String,
        dataSize: Number,
        error: String,
        queryValues: {type: Object, default: () => ({})},
        cursorURL: {type: String, default: null},
        cursorId: {type: String, default: null},
        cursorFinished: {type: Boolean, default: false},
        cursorStep: {type: Number, default: 0}
    },
    data() {
        return {
            busy: false,
            actionError: null
        };
    },
    computed: {
        queryOptions() {
            return this.manifest?.queryOptions ?? [];
        }
    },
    methods: {
        async start_cursor() {
            this.busy = true;
            this.actionError = null;
            try {
                await this.$store.dispatch('connection/create_resource_cursor', {name: this.name});
            } catch(error) {
                this.actionError = `Failed to start cursor: ${error.message}`;
            } finally {
                this.busy = false;
            }
        },
        async advance() {
            this.busy = true;
            this.actionError = null;
            try {
                await this.$store.dispatch('connection/advance_resource_cursor', {name: this.name});
            } catch(error) {
                this.actionError = `Failed to advance cursor: ${error.message}`;
            } finally {
                this.busy = false;
            }
        },
        async release() {
            this.busy = true;
            this.actionError = null;
            try {
                await this.$store.dispatch('connection/release_resource_cursor', {name: this.name});
            } catch(error) {
                this.actionError = `Failed to release cursor: ${error.message}`;
            } finally {
                this.busy = false;
            }
        }
    }
}
</script>

<style scoped>
.seq-status {
  font-size: .85rem;
}

.seq-status-muted {
  color: var(--clr-fg-main-muted);
}

.seq-error {
  color: var(--clr-fg-main-highlighted);
  font-size: .85rem;
}

.seq-actions {
  margin-top: 6pt;
  display: flex;
  gap: 6pt;
}
</style>

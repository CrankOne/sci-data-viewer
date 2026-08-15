<template>
  <div>
    <div v-if="sessionURL" class="seq-status">
      <template v-if="sessionFinished">Finished at event {{ sessionStep }} &mdash; release and start again to replay.</template>
      <template v-else>Event {{ sessionStep }}<span v-if="dataSize != null"> ({{ dataSize }} bytes)</span></template>
    </div>
    <div v-else class="seq-status seq-status-muted">No session &mdash; start one to begin traversing.</div>
    <!-- create_resource_session/advance_resource_session also mirror a
         failure onto resource.status/error (for LoadingOverlay's benefit --
         see connection.js), but actionError below already covers every
         action's failure with a friendlier "Failed to ..." prefix, so it's
         the only one shown here to avoid a duplicate message. -->
    <div v-if="actionError" class="seq-error">{{ actionError }}</div>

    <QueryOptionsForm :name="name" :queryOptions="queryOptions" :queryValues="queryValues"/>

    <div class="seq-actions">
      <button type="button" :disabled="Boolean(sessionURL) || busy" @click="start_session">Start session</button>
      <button type="button" :disabled="!sessionURL || sessionFinished || busy" @click="advance">Next</button>
      <button type="button" :disabled="!sessionURL || busy" @click="release">Release</button>
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
        sessionURL: {type: String, default: null},
        sessionId: {type: String, default: null},
        sessionFinished: {type: Boolean, default: false},
        sessionStep: {type: Number, default: 0}
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
        async start_session() {
            this.busy = true;
            this.actionError = null;
            try {
                await this.$store.dispatch('connection/create_resource_session', {name: this.name});
            } catch(error) {
                this.actionError = `Failed to start session: ${error.message}`;
            } finally {
                this.busy = false;
            }
        },
        async advance() {
            this.busy = true;
            this.actionError = null;
            try {
                await this.$store.dispatch('connection/advance_resource_session', {name: this.name});
            } catch(error) {
                this.actionError = `Failed to advance session: ${error.message}`;
            } finally {
                this.busy = false;
            }
        },
        async release() {
            this.busy = true;
            this.actionError = null;
            try {
                await this.$store.dispatch('connection/release_resource_session', {name: this.name});
            } catch(error) {
                this.actionError = `Failed to release session: ${error.message}`;
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

<template>
  <div>
    <div v-if="selectedItemId" class="addr-status">
      Loaded "<strong>{{ selectedItemId }}</strong>"<span v-if="dataSize != null"> ({{ dataSize }} bytes)</span>
    </div>
    <div v-else class="addr-status addr-status-muted">No file loaded yet -- pick one below.</div>
    <div v-if="status === 'error' && error" class="addr-error">{{ error }}</div>

    <QueryOptionsForm :name="name" :queryOptions="queryOptions" :queryValues="queryValues"/>

    <div v-if="listError" class="addr-error">{{ listError }}</div>
    <ul v-else class="addr-list">
      <li v-if="listLoading" class="addr-list-note">Loading files&hellip;</li>
      <li v-else-if="!items.length" class="addr-list-note">No matching files.</li>
      <li
        v-for="id in items"
        :key="id"
        class="addr-item"
        :class="{selected: id === selectedItemId}"
        :title="id"
        @click="select_item(id)"
      >{{ id }}</li>
    </ul>

    <div class="addr-pagination">
      <button type="button" :disabled="!hasPrevPage || listLoading" @click="prev_page">&lsaquo; Prev</button>
      <span class="addr-page-label">
        Page
        <input
          type="number"
          class="addr-page-input"
          min="1"
          :max="totalPages || undefined"
          :value="currentPage + 1"
          :disabled="listLoading"
          @change="jump_to_page($event)"
        >
        <template v-if="totalPages"> of {{ totalPages }}</template>
        <template v-if="total != null"> ({{ total }} files)</template>
      </span>
      <button type="button" :disabled="!hasNextPage || listLoading" @click="next_page">Next &rsaquo;</button>
    </div>
  </div>
</template>

<script>
import QueryOptionsForm from './QueryOptionsForm.vue';

export default {
    name: 'AddressableSourceListItem',
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
        // Id of the item currently applied as this resource's data, or
        // null if none has been picked yet (connection.js).
        selectedItemId: {type: String, default: null},
        // Last page the user was browsing, persisted per session
        // (connection.js/connectionPersistence.js) -- only the *initial*
        // value; live browsing state is `currentPage` below, since a prop
        // can't be reassigned directly.
        page: {type: Number, default: 0}
    },
    data() {
        return {
            items: [],
            currentPage: this.page,
            pageSize: this.manifest?.collection?.['page-size'] ?? 20,
            total: null,
            listLoading: false,
            listError: null
        };
    },
    computed: {
        queryOptions() {
            return this.manifest?.queryOptions ?? [];
        },
        totalPages() {
            return this.total != null ? Math.max(1, Math.ceil(this.total / this.pageSize)) : null;
        },
        hasPrevPage() {
            return this.currentPage > 0;
        },
        hasNextPage() {
            // Exact when the server reports `total`; otherwise fall back to
            // "this page came back full" as a heuristic.
            if(this.total != null) return (this.currentPage + 1) * this.pageSize < this.total;
            return this.items.length >= this.pageSize;
        }
    },
    mounted() {
        // Resume browsing on the page the user was last on (soft
        // persistence, see connection.js's set_resource_page) rather than
        // always resetting to the first page.
        this.fetch_page(this.currentPage);
    },
    methods: {
        async fetch_page(page) {
            this.listLoading = true;
            this.listError = null;
            try {
                const result = await this.$store.dispatch('connection/list_resource_items', {
                    name: this.name, page, pageSize: this.pageSize
                });
                this.items = result.items ?? [];
                this.currentPage = result.page ?? page;
                this.pageSize = result['page-size'] ?? this.pageSize;
                this.total = typeof result.total === 'number' ? result.total : null;
                this.$store.dispatch('connection/set_resource_page', {name: this.name, page: this.currentPage});
            } catch(error) {
                this.listError = String(error);
            } finally {
                this.listLoading = false;
            }
        },
        next_page() {
            if(this.hasNextPage) this.fetch_page(this.currentPage + 1);
        },
        prev_page() {
            if(this.hasPrevPage) this.fetch_page(this.currentPage - 1);
        },
        // Direct page-number entry (reactive pagination input): clamps to
        // the known valid range and only re-fetches on an actual change.
        // An invalid/unchanged/out-of-range entry is meant to snap back to
        // currentPage -- but since that value itself didn't change, Vue
        // won't re-patch the input's DOM value on its own, so reset it
        // explicitly.
        jump_to_page(event) {
            let target = parseInt(event.target.value, 10);
            if(!Number.isFinite(target)) target = this.currentPage + 1;
            target -= 1;
            if(target < 0) target = 0;
            if(this.totalPages != null) target = Math.min(target, this.totalPages - 1);
            if(target !== this.currentPage) {
                this.fetch_page(target);
            } else {
                event.target.value = this.currentPage + 1;
            }
        },
        // One file loaded at a time -- picking a new one replaces whatever
        // was previously loaded (see connection.js's load_resource_data /
        // GeometryManager's stale-item pruning).
        select_item(id) {
            this.$store.dispatch('connection/load_resource_data', {name: this.name, itemId: id})
                .catch(error => console.error(`Failed to load item "${id}" for resource "${this.name}":`, error));
        }
    }
}
</script>

<style scoped>
.addr-status {
  font-size: .85rem;
}

.addr-status-muted {
  color: var(--clr-fg-main-muted);
}

.addr-error {
  color: var(--clr-fg-main-highlighted);
  font-size: .85rem;
}

.addr-list {
  list-style: none;
  margin: 6pt 0 0;
  padding: 0;
  max-height: 12rem;
  overflow-y: auto;
  border: 1px solid var(--clr-border-inactive);
  border-radius: 3pt;
}

.addr-list-note {
  padding: 4pt 6pt;
  font-size: .85rem;
  color: var(--clr-fg-main-muted);
}

.addr-item {
  padding: 3pt 6pt;
  font-size: .8rem;
  font-family: var(--font-data);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  cursor: pointer;
}

.addr-item:hover {
  background-color: var(--clr-bg-highlight2);
}

.addr-item.selected {
  background-color: var(--clr-bg-highlight1);
  font-weight: 600;
}

.addr-pagination {
  margin-top: 4pt;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6pt;
  font-size: .8rem;
}

.addr-page-label {
  color: var(--clr-fg-main-muted);
  text-align: center;
  flex: 1 1 auto;
}

.addr-page-input {
  width: 3.2em;
  text-align: center;
  font-size: .8rem;
}
</style>

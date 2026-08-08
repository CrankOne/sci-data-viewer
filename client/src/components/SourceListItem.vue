<template>
  <FramedDisclosure v-model="expanded">
    <template #header>
      <span class="source-name">{{ name }}</span>
    </template>

    <template #actions>
      <button
        v-if="!noRefreshManifest"
        type="button"
        class="header-action"
        title="Reload manifest"
        aria-label="Reload manifest"
        @click="reload_manifest"
      >
        <span class="vi vi-reload" aria-hidden="true" />
      </button>

      <button
        v-if="!noRemove"
        type="button"
        class="header-action"
        title="Remove source"
        aria-label="Remove source"
        @click="remove_resource"
      >
        <span class="vi vi-trash-bin" aria-hidden="true" />
      </button>
    </template>

    <component :is="concreteSourceItemComponent" v-bind="definition"/>
  </FramedDisclosure>
</template>

<script>
import FramedDisclosure from './FramedDisclosure.vue';
import WaitingSourceListItem from './sourceListItems/waiting.vue'
import StaticSourceListItem from './sourceListItems/static.vue'

export default {
    name: 'SourceListItem',
    components: {
        FramedDisclosure,
        WaitingSourceListItem,
        StaticSourceListItem
    },
    props: {
        name: String,
        noRemove: {type: Boolean, default: false},
        noRefreshManifest: {type: Boolean, default: false},
        definition: Object
    },
    data() {
        return {
            // Unlike the (persistent) facet/selection-set editors, source
            // entries are shown expanded by default -- collapsing is an
            // option for decluttering a long list, not the normal state.
            expanded: true
        };
    },
    methods: {
        reload_manifest() {
            return this.$store.dispatch('connection/retry_resource_manifest', {name: this.name, load: true});
        },

        cancel_manifest_fetch() {
            return this.$store.dispatch('connection/cancel_resource_manifest_fetch', this.name);
        },

        remove_resource() {
            return this.$store.dispatch('connection/remove_resource', this.name);
        }
    },

    computed: {
        // NOTE: only the "static view" access model is implemented
        // end-to-end today; the richer iterable/paginated collection models
        // sketched in the project README were never fully built out
        // client-side and need a proper redesign before being reintroduced.
        concreteSourceItemComponent() {
            if(this.definition.manifest === null) {
                return 'waiting-source-list-item';
            }
            if(this.definition.manifest.accessModel == 'staticView') {
                return 'static-source-list-item';
            }
            throw new Error(`Unsupported access model type "${this.definition.manifest.accessModel}"`)
        }
    }
}
</script>

<style scoped>
.source-name {
  min-width: 0;

  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;

  font-size: .9rem;
  font-weight: 600;
}
</style>

<template>
  <FramedDisclosure v-model="expanded">
    <template #header>
      <span class="source-name">{{ name }}</span>
    </template>

    <template #actions>
      <button
        v-if="contextualDataType"
        type="button"
        class="header-action"
        title="Connect to scene"
        aria-label="Connect to scene"
        @click="open_connect_scope"
      >
        <span class="vi vi-cube" aria-hidden="true" />
      </button>

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
import AddressableSourceListItem from './sourceListItems/addressable.vue'
import SequentialSourceListItem from './sourceListItems/sequential.vue'
import { get_module } from '@/modules/registry'

export default {
    name: 'SourceListItem',
    components: {
        FramedDisclosure,
        WaitingSourceListItem,
        StaticSourceListItem,
        AddressableSourceListItem,
        SequentialSourceListItem
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
        },

        open_connect_scope() {
            this.$store.commit('ui/open_modal', {
                name: 'connect-scope',
                props: {
                    kind: 'resource',
                    name: this.name,
                    dataType: this.contextualDataType,
                    currentContextId: this.definition.contextId ?? null
                }
            });
        }
    },

    computed: {
        // Type is only known once the manifest has resolved; null (hiding
        // the "connect to scene" button) until then, and for a
        // non-contextual type.
        contextualDataType() {
            const type = this.definition.manifest?.type;
            return type && get_module(type)?.contextual ? type : null;
        },

        // NOTE: "plain" sources (sequential=false, addressable=false),
        // "addressable + enumerable" ones, and "sequential-only" ones (see
        // doc/sources.rst) are implemented end-to-end; a sequential+
        // addressable source, and an addressable source with no
        // enumeration, were never built out client-side and need a proper
        // design before being introduced.
        concreteSourceItemComponent() {
            if(this.definition.manifest === null) {
                return 'waiting-source-list-item';
            }
            const {sequential, addressable, collection} = this.definition.manifest;
            if(!sequential && !addressable) {
                return 'static-source-list-item';
            }
            if(sequential && !addressable) {
                return 'sequential-source-list-item';
            }
            if(!sequential && addressable && collection?.enumerable) {
                return 'addressable-source-list-item';
            }
            throw new Error(
                `Unsupported source capabilities (sequential=${sequential}, `
                + `addressable=${addressable}, enumerable=${collection?.enumerable}): `
                + `only plain, sequential-only, and addressable+enumerable sources are supported`
            );
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

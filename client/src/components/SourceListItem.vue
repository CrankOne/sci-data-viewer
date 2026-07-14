<template>
<div class="frame">
  <div class="frame__bar">
    <h2 class="frame__title">
        {{name}}
    </h2>

    <div class="frame__actions">
      <button
            type="button"
            title="Reload manifest"
            v-if="!noRefreshManifest"
            @click="reload_manifest">🗘</button>
      <button
            type="button"
            title="Remove source"
            v-if="!noRemove"
            @click="remove_resource">🗑</button>
    </div>
  </div>

  <div class="frame__content">
    <component :is="concreteSourceItemComponent" v-bind="definition"/>
  </div>
</div>
</template>

<script>
import WaitingSourceListItem from './sourceListItems/waiting.vue'
import StaticSourceListItem from './sourceListItems/static.vue'
// import ... (other source list items)

export default {
  name: 'SourceListItem',
  components: {
      WaitingSourceListItem,
      StaticSourceListItem,
      // ...
  },
  props: {
    name: String,
    noRemove: false,
    noRefreshManifest: false,
    definition: Object,
  },
  methods: {
    reload_manifest() {
        return this.$store.dispatch(
            'connection/retry_resource_manifest',
            {
                name: this.name,
                load: true,
            }
        );
    },

    cancel_manifest_fetch() {
        return this.$store.dispatch(
            'connection/cancel_resource_manifest_fetch',
            this.name
        );
    },

    remove_resource() {
        return this.$store.dispatch(
            'connection/remove_resource',
            this.name
        );
    },
  },
    
  computed: {
    concreteSourceItemComponent() {
      if(this.definition.manifest === null) {
        return 'waiting-source-list-item';
      }
      if(this.definition.manifest.accessModel == 'staticView') {
        return 'static-source-list-item';
      }
      if(this.definition.manifest.accessModel == 'staticViewWithPeriodicUpdates') {
        return 'static-source-list-item-with-periodic-updates';
      }
      if(this.definition.manifest.accessModel == 'fwIterableCollection') {
        return 'source-list-item-fw-iterable';
      }
      if(this.definition.manifest.accessModel == 'sparseCollection') {
        return 'static-source-list-item-sparse-collection';
      }
      if(this.definition.manifest.accessModel == 'sparseCollectionWithPagination') {
        return 'static-source-list-item-sparse-collection-with-pagination';
      }
      throw new Error(`Unknown access model type "${this.definition.manifest.accessModel}"`)
    }
  },
}
</script>

<style scoped>
.frame {
  --frame-padding-x: 1rem;
  --frame-border-color: var(--clr-border-inactive);
  --frame-background: var(--clr-bg-panel);

  position: relative;
  min-width: 0;

  margin-top: 1rem;
  padding:
    1.5rem
    var(--frame-padding-x)
    1rem;

  border: 1px solid var(--frame-border-color);
  border-radius: 0.4rem;
  background: var(--frame-background);
}

.frame__bar {
  position: absolute;
  top: 0;
  left: var(--frame-padding-x);
  right: var(--frame-padding-x);

  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 1rem;

  /*
   * Move the bar vertically so that its centre coincides with the border.
   */
  transform: translateY(-50%);
}

.frame__title {
  min-width: 0;
  margin: 0;
  padding-inline: 0.35rem;

  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;

  background: var(--frame-background);
  font-size: .9rem;
  font-weight: 600;
}

.frame__actions {
  display: flex;
  flex: none;
  gap: 0.4rem;

  /*
   * Masks the frame border behind and between the buttons.
   */
  padding-inline: 0.35rem;
  background: var(--frame-background);
}

.frame__actions button {
  white-space: nowrap;
}

.frame__content {
  min-width: 0;
}
</style>


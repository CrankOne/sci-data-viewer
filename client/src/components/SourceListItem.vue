<template>
  <li class="dataSourceItem">
      <div id="source-header">
        <div id="btn-remove" v-if="!noRemove" v-on:click="remove_source"></div>
        <span id="reload">{{name}}<span v-if="reload_enabled" v-on:click="reload_data" id="btn-reload"></span></span>
      </div>
    <p class="data-source-endpoint">{{definition.endpoint}}, {{definition.dataSize}}</p>
    <component :is="concreteSourceItemComponent" :definition="definition"/>
  </li>
</template>

<script>
import SourceListItemFwIterable from './sourceListItems/fwIterable.vue'
// import ... (other source list items)

export default {
  name: 'SourceListItem',
  components: {SourceListItemFwIterable},
  props: {
    name: String,
    noRemove: false,
    definition: Object,
  },
  methods: {
    remove_source(event) {
      console.log("TODO: remove source");
    },
    reload_data(event) {
      console.log("TODO: reload data");
    },
  },
  computed: {
    reload_enabled() {
      // TODO: false must be returned for static view, when expiration
      //    time is passed
      return true;
    },
    concreteSourceItemComponent() {
      if(this.definition.accessModel == 'staticView') {
        return 'static-source-list-item';
      }
      if(this.definition.accessModel == 'staticViewWithPeriodicUpdates') {
        return 'static-source-list-item-with-periodic-updates';
      }
      if(this.definition.accessModel == 'fwIterableCollection') {
        return 'source-list-item-fw-iterable';
      }
      if(this.definition.accessModel == 'sparseCollection') {
        return 'static-source-list-item-sparse-collection';
      }
      if(this.definition.accessModel == 'sparseCollectionWithPagination') {
        return 'static-source-list-item-sparse-collection-with-pagination';
      }
      throw new Error(`Unknown access model type "${this.definition.accessModel}"`)
    }
    //navigation_enabled() {
    //  return !( this.definition.accessModel == 'staticViewWithPeriodicUpdates'
    //         || this.definition.accessModel == 'staticView'
    //         );
    //},
    //backward_navigation_enabled() {
    //  // backward iteration is not supported for static views and fw-iterable
    //  // collection
    //  return  ( this.definition.accessModel == 'denseCollection'
    //         || this.definition.accessModel == 'sparseCollection'
    //         || this.definition.accessModel == 'sparseCollectionWithPagination'
    //         );
    //},
    //forward_navigation_enabled() {
    //  return this.definition.accessModel != 'staticView'
    //}
  },
}
</script>

<style scoped>
div#source-header {
  font-size: 12pt;
  margin: -1.2em -1pt;
  background-color: #222;
  padding: 7pt 7pt;
}

div#btn-remove:after {
  content: '\274C ';
  float: right;
  cursor: pointer;
  padding: 2pt 3pt;
  background-color: #333;
  border: solid 1px black;
}

span#btn-reload:after {
  content: '\21BB ';
  cursor: pointer;
  margin-left: 5pt;
  padding: 1pt 5pt;
  background-color: #333;
  border: solid 1px black;
}
</style>


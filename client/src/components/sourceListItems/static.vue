<template>
  <li class="dataSourceItem">
      <div id="source-header">
        <div id="btn-remove" v-if="!noRemove" v-on:click="remove_source"></div>
        <span id="reload">{{name}}<span v-if="reload_enabled" v-on:click="reload_data" id="btn-reload"></span></span>
      </div>
    <p class="data-source-endpoint">{{definition.endpoint}}, {{definition.dataSize}}</p>
    <slot name="body"></slot>
    <slot name="navigation"></slot>
  </li>
</template>

<script>
export default {
  name: 'StaticSourceListItem',
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
  font-size: 15pt;
}

div#btn-remove:after {
  content: '\274C ';
  float: right;
  cursor: pointer;
  padding: 2pt 3pt;
  background-color: #332;
  border: solid 1px black;
}

span#btn-reload:after {
  content: '\21BB ';
  cursor: pointer;
  margin-left: 5pt;
  padding: 1pt 5pt;
  background-color: #332;
  border: solid 1px black;
}
</style>


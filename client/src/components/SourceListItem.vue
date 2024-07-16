<template>
  <li class="dataSourceItem">
      <div id="source-header">
        <div id="btn-remove" v-if="remove_enabled" v-on:click="remove_source"></div>
        <span id="reload">{{name}}<span v-if="reload_enabled" v-on:click="reload_data" id="btn-reload"></span></span>
      </div>
    <p class="data-source-endpoint">{{definition.endpoint}}, {{definition.dataSize}}</p>

    <br v-if="pages_enabled"/>
    <span v-if="pages_enabled">1, 2 ... 48, 49, 50, ... 67, 68</span>
    <!-- page -->
    <br v-if="pages_enabled"/>
    <select v-if="pages_enabled" name="pets" size="4">
      <option value="4031-12-1024">4031-12-1024</option>
      <option value="4031-12-1025">4031-12-1025</option>
      <option value="4031-12-1027">4031-12-1027</option>
      <option value="4031-12-1031">4031-12-1031</option>
    </select>
    <br v-if="pages_enabled"/>

    <!-- navigation -->
    <span v-if="navigation_enabled">
        <button type="button" v-if="backward_navigation_enabled">Prev</button>
        id={{definition.current}}
        <button type="button" v-if="forward_navigation_enabled" v-on:click="load_next">&#x25BA;</button>
    </span>

  </li>
</template>

<script>
export default {
  name: 'SourceListItem',
  props: {
    name: String,
    definition: Object,
  },
  methods: {
    remove_source(event) {
      console.log("TODO: remove source");
    },
    reload_data(event) {
      console.log("TODO: reload data");
    },
    load_next(event) {
      console.log("TODO: load next item");
    }
  },
  computed: {
    remove_enabled() {
      // todo: `flase' is barely needed, yet might be desirable for certain
      // scenarios...
      return true;
    },
    reload_enabled() {
      // TODO: false must be returned for static view, when expiration
      //    time is passed
      return true;
    },
    pages_enabled() {
      // `true' for only sparse collections with pagination
      return this.definition.accessModel == 'sparseCollectionWithPagination';
    },
    navigation_enabled() {
      return !( this.definition.accessModel == 'staticViewWithPeriodicUpdates'
             || this.definition.accessModel == 'staticView'
             );
    },
    backward_navigation_enabled() {
      // backward iteration is not supported for static views and fw-iterable
      // collection
      return  ( this.definition.accessModel == 'denseCollection'
             || this.definition.accessModel == 'sparseCollection'
             || this.definition.accessModel == 'sparseCollectionWithPagination'
             );
    },
    forward_navigation_enabled() {
      return this.definition.accessModel != 'staticView'
    }
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


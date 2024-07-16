<template>
  <div>
    <span id="itemID">{{definition.current}}</span>
    <button type="button" v-on:click="load_next">&#x25BA;</button>
  </div>
</template>

<script>
import {mapState} from 'vuex';

export default {
  name: 'SourceListItemFwIterable',
  props: {
    definition: Object,
  },
  methods: {
    load_next() {
      // TODO
      console.log("TODO: load next item in forward-iterable collection");
    }
  },
}

</script>



<template>
  <NavBarEntity>
    <template #header>Items</template>
    <template #content>
      <input type="search" v-model="query" placeholders="Filter geometry..."/>
      <ul class="geo-items-list">
        <li
          v-for="item in filteredItems"
          :key="item.name"
          :class="{hovered: highlightedGeoItemIDs.has(item.name)}"
          @click="toggle_item_selection(item.name)"
          @mouseenter="hover_item(item.name)"
          @mouseleave="unhover_item()"
        >
        <span :class="{
                selected: selectedGeoItemIDs.has(item.name)
              }"
            >{{item.label}}</span><span class='source'>@{{item.source}}</span>
        </li>
      </ul>
    </template>
  </NavBarEntity>
</template>

<script>
import {mapState} from 'vuex'
import NavBarEntity from './NavBarEntity.vue'
//import Treeselect from "@zanmato/vue3-treeselect";
//import "@zanmato/vue3-treeselect/dist/vue3-treeselect.min.css";

export default {
  name: 'ItemsTree',
  components: {NavBarEntity}, //, DrawableItem},
  data() {
    return {
      query: ""
    };
  },  // data
  computed: {
    // shortcuts, returns corresponding objects from store
    geoData() { return this.$store.getters['view3D/geoData']; },
    selectedGeoItemIDs() { return this.$store.getters['view3D/selectedGeoItemIDs']; },
    highlightedGeoItemIDs() { return this.$store.getters['view3D/highlightedGeoItemIDs']; },

    // available items with their id, label and category
    availableItems() {
      return Object.entries(this.geoData).flatMap(([srcID, src]) =>
        src.geometry.map(item => ({
          name: `${item._name}@${srcID}`,
          label: item._name,
          source: srcID,
          category: item._category ?? []
        }))
      );
    },

    // when query is empty, returns full list of available items, otherwise
    // applies query to filter only the selected ones
    filteredItems() {
      const q = this.query.trim().toLowerCase();
      if(!q) return this.availableItems;
      return this.availableItems.filter(item =>
            item.name.toLowerCase().includes(q)
          );
    }
  },  // computed
  methods: {
    toggle_item_selection(id) {
      console.debug(`Toggle item selection for geo item with ID "${id}"`);
      if(this.selectedGeoItemIDs.has(id))
        this.$store.commit('view3D/unselect_geo_items', id);
      else
        this.$store.commit('view3D/select_geo_items', id);
    },
    hover_item(id) {
        this.$store.commit('view3D/set_highlight_geo_items', id);
    },
    unhover_item(id) {
        this.$store.commit('view3D/clear_geo_items_highlight');
    }
  }  // methods
}
</script>

<style scoped>
.selected {
  color: var(--clr-accent);
}

ul.geo-items-list {
  background-color: var(--clr-neutral);
  margin: 5pt;
}

li.hovered {
  background-color: var(--clr-bg-hover);
}

span.source {
  color: var(--clr-neutral-darken);
}
</style>

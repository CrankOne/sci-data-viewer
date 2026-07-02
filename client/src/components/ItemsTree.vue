<template>
  <NavBarEntity>
    <template #header>Items</template>
    <template #content>
      <input type="search" v-model="query" placeholders="Filter geometry..."/>
      <ul class="geo-items-list">
        <li
          v-for="item in filteredItems"
          :key="item._name"
          :class="{
            selected: selectedGeoItemIDs.has(item._name),
            hovered: highlightedGeoItemIDs.has(item._name)
          }"
          @click="toggle_item_selection(item._name)"
          @mouseenter="hover_item(item._name)"
          @mouseleave="unhover_item()"
        >
          {{ item._name }}
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
      return Object.values(this.geoData).flatMap(src =>
        src.geometry.map(item => ({
          _name: item._name,
          _category: item._category ?? []
        }))
      );
    },

    // when query is empty, returns full list of available items, otherwise
    // applies query to filter only the selected ones
    filteredItems() {
      const q = this.query.trim().toLowerCase();
      if(!q) return this.availableItems;
      return this.availableItems.filter(item =>
            item._name.toLowerCase().includes(q)
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
li.selected {
    color: var(--clr-accent);
}

li.hovered {
    background-color: var(--clr-bg-button);
    color: var(--clr-fg-button);
}
</style>

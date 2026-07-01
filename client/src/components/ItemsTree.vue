<template>
  <NavBarEntity>
    <template #header>Items</template>
    <template #content>
      <input type="search" v-model="query" placeholders="Filter geometry..."/>
      <ul class="geo-items-list">
        <li
          v-for="item in filteredItems"
          :key="item._name"
          :class="{ selected: selectedIds.has(item._name) }"
          @click="toggle_item(item._name)"
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
      query: "",
      selectedIds: new Set()
    };
  },  // data
  computed: {
    // A shortcut, returns geoData from store
    geoData() { return this.$store.getters['view3D/geoData']; },

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
    toggle_item(id) {
      const next = new Set(this.selectedIds);
      if (next.has(id))
        next.delete(id);
      else
        next.add(id);
      this.selectedIds = next;
    }
  }  // methods
}
</script>

<style scoped>

</style>

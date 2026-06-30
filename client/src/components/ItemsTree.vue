<template>
  <NavBarEntity>
    <template #header>Items</template>
    <template #content>
      <li v-for="nm in availableItemsIDs">{{nm}}</li>
    </template>
  </NavBarEntity>
</template>

<script>
import {mapState} from 'vuex'
import NavBarEntity from './NavBarEntity.vue'
//import DrawableItem from './DrawableItem.vue'

export default {
  name: 'ItemsTree',
  components: {NavBarEntity}, //, DrawableItem},
  computed: {
    geoData() {
      return this.$store.getters['view3D/geoData'];
    },

    availableItemsIDs() {
      //this.$store.getters['view3D/geoDataBySource']
      return Object.values(this.geoData)
            .flatMap(sourcesData => {
                    console.debug(sourcesData.geometry);
                return sourcesData.geometry.map(geoItem => geoItem._name);
            });
      //return ["one", "two"];
    }
  }
}
</script>

<style scoped>

</style>

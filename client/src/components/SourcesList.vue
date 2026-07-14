<template>
  <NavBarEntity>
    <template #header>Data Sources</template>
    <template #content>
      <div class="dataSourceList">
        <source-list-item v-for="(pl, name) in dataSources" :name="name" :definition="pl"/>
      </div>
      <!-- add new data source (name+endpoint) -->
      <!--<form>
        <p>
          <label for="a">Name</label>
          <input id="a" type="text">
        </p>
        <p>
          <label for="b">Endpoint</label>
          <input id="b" type="text">
        </p>
        <button type="button">Add</button>
      </form>-->
      <button>Add</button>
    </template>
  </NavBarEntity>
</template>

<script>
import {mapState} from 'vuex'
import NavBarEntity from './NavBarEntity.vue'
import SourceListItem from './SourceListItem.vue'

export default {
  name: 'SourceList',
  components: {NavBarEntity, SourceListItem},
  computed: {
    dataSources() {
        console.debug(this.$store.state.connection.resources);  // XXX
      return this.$store.state.connection.resources;
    }
  }
}
</script>

<style scoped>
</style>


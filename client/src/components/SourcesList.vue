<template>
  <NavBarEntity>
    <template #header>Data Sources</template>
    <template #content>
      <ul class="dataSourceList">
        <source-list-item v-for="(pl, name) in dataSources" :name="name" :definition="pl"/>
      </ul>
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
    //dataSources: [{name: 'name1', endpoint: 'ep1'}]
    dataSources() {
      //var r;
      //for [name, endpoint] in Object.entries(this.$store.state.connection.dataSources) {
      //}
      return this.$store.state.connection.dataSources;
    }
    //...mapState(state.dataSources {
    //    name: state => state..axesScales[0],
    //    //scaleY: state => state.view3D.axesScales[1],
    //    //scaleZ: state => state.view3D.axesScales[2],
    //}),
  },
  methods: {
    //update_scale(e, vn) {
    //  this.$store.commit('view3D/reset_region_of_interest');
    //  this.$store.commit('view3D/change_axis_scale', {'var': vn, 'v': e.target.value});
    //}
  }
}
</script>

<style scoped>

.dataSourceList {
  padding: 0px;
  margin: 0px;
}

.dataSourceItem {
  display: block;
  border: 1px solid #686040;
  padding: 0pt 5pt 4pt 5pt;
  margin: 1.5em 4pt 1pt 5pt;
}

form  { display: table;      }
p     { display: table-row;  }
label { display: table-cell; text-align: right; }
input { display: table-cell; }
</style>


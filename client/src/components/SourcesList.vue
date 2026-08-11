<template>
  <NavBarEntity>
    <template #header>Data Sources</template>
    <template #actions><slot name="actions" /></template>
    <template #content>
      <div class="dataSourceList">
        <source-list-item v-for="(pl, name) in dataSources" :name="name" :definition="pl"/>
      </div>

      <button type="button" @click="open_add_source">Add</button>
    </template>
  </NavBarEntity>
</template>

<script>
import NavBarEntity from './NavBarEntity.vue'
import SourceListItem from './SourceListItem.vue'

export default {
    name: 'SourceList',
    components: {NavBarEntity, SourceListItem},
    computed: {
        dataSources() {
            return this.$store.state.connection.resources;
        }
    },
    methods: {
        open_add_source() {
            this.$store.commit('ui/open_modal', {name: 'add-source'});
        }
    }
}
</script>

<style scoped>
</style>

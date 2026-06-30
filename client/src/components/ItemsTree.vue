<template>
  <NavBarEntity>
    <template #header>Items</template>
    <template #content>
      ...
    </template>
  </NavBarEntity>
</template>

<script>
import {mapState} from 'vuex'
import NavBarEntity from './NavBarEntity.vue'
import DrawableItem from './DrawableItem.vue'

export default {
   name: 'ItemsTree',
   components: {NavBarEntity, DrawableItem},
}
</script>

<style scoped>

</style>

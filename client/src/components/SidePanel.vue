<template>
    <div id="container">
        <source-list />
        <!--<ev-nav-bar eventID="null"/>-->
        <items-tree :defaultOpenedState="true" />
        <scene-helpers />
        <!--<event-tree-on-side-panel :eventNum="0"/>-->
    </div>
</template>

<script>
//import EvNavBar from './EvNavBar.vue'
import SceneHelpers from './SceneHelpers.vue'
import SourceList from './SourcesList.vue'
import ItemsTree from './ItemsTree.vue'
//import EventTreeOnSidePanel from './EventTreeOnSidePanel.vue'

export default {
    components: {
        SourceList,
        ItemsTree,
        SceneHelpers,
    },
    data() {
        return {};
    }
}
</script>

<style scoped>
div#container {
    max-height: 100%;
    padding: 5pt 3pt;
}
</style>


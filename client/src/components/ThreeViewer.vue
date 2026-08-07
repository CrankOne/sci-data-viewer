<template>
  <splitpanes class="viewer-splitpanes">
    <pane min-size="30" size="75">
        <viewport/>
    </pane>
    <pane>
        <side-panel/>
    </pane>
  </splitpanes>
</template>


<script>
import { Splitpanes, Pane } from 'splitpanes'
import Viewport from './Viewport.vue'
import SidePanel from './SidePanel.vue'

export default {
    name: 'ThreeViewer',
    props: {
        defaultDataSources: {type: Object, default: {}}
    },
    components: {
        Viewport,
        SidePanel,
        Splitpanes, Pane
    },
    data() {
        return {};
    },
    mounted() {
        console.debug(this.defaultDataSources); // XXX
        // iterate over defined data sources and add them one by one, just as
        // if they are added manually.
        for(const [name, endpoint] of Object.entries(this.defaultDataSources)) {
            console.debug(`Adding default data source: "${name}" -> "${endpoint}"`);
            this.$store.dispatch('connection/add_data_source', {name, endpoint});
        }
    }
}
</script>

<style scoped>
.viewer-splitpanes {
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
}
</style>


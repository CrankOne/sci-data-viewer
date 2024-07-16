<template>
  <splitpanes>
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
        defaultDataSources: {type: Object, default: {}},
    },
    components: {
        Viewport,
        SidePanel,
        Splitpanes, Pane
    },
    data () {
      return {};
    },
    mounted() {
        for(const [name, endpoint] of Object.entries(this.defaultDataSources)) {
            //console.log(`Adding default data source: "${name}" -> "${endpoint}"`);
            this.$store.dispatch('connection/add_data_source', {name, endpoint});
        }
    }
}
</script>

<style scoped>
</style>


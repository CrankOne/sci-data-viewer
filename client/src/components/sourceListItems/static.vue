<template>
  <div>
    <div>Loaded {{dataSize}} bytes of static data from {{dataURL}} according to
manifest at {{endpoint}}</div>

    <QueryOptionsForm :name="name" :queryOptions="queryOptions" :queryValues="queryValues"/>
  </div>
</template>

<script>
import QueryOptionsForm from './QueryOptionsForm.vue';

export default {
    name: 'StaticSourceListItem',
    components: {QueryOptionsForm},
    props: {
        name: String,
        endpoint: String,
        status: String,
        manifest: Object,
        type: String,
        dataURL: String,
        dataSize: Number,
        error: String,
        queryValues: {type: Object, default: () => ({})}
    },
    computed: {
        queryOptions() {
            return this.manifest?.queryOptions ?? [];
        },
        reloadingEnabled() {
            // TODO: false must be returned for static view, when expiration
            //    time is passed
            return true;
        }
    },
    methods: {
        reload_data(event) {
            console.log("TODO: reload data");
        }
    }
}
</script>

<style scoped>
</style>

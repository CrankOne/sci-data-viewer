<template>
  <div>Loaded {{dataSize}} bytes of static data from {{dataURL}} according to
manifest at {{endpoint}}</div>
</template>

<script>
export default {
    name: 'StaticSourceListItem',
    props: {
        name: String,
        endpoint: String,
        status: String,
        manifest: Object,
        type: String,
        dataURL: String,
        dataSize: Number,
        error: String
    },
    methods: {
        reload_data(event) {
            console.log("TODO: reload data");
        }
    },
    computed: {
        reloadingEnabled() {
            // TODO: false must be returned for static view, when expiration
            //    time is passed
            return true;
        }
    }
}
</script>

<style scoped>
</style>

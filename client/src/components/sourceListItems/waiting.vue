<template>
  <div v-if="status === 'loading-manifest'">Resolving {{endpoint}}...</div>
  <div v-else-if="status === 'error'" class="error-msg">{{error}}</div>
  <div v-else class="error-msg">Manifest did not provided access model.
Resource state is "{{state}}",
(endpoint {{endpoint}}, size {{dataSize}}, data URL {{dataURL}},
type {{type}}, error "{{error}}").</div>
</template>

<script>
export default {
    name: 'WaitingSourceListItem',
    props: {
        name: String,
        endpoint: String,
        status: String,
        manifest: Object,
        type: String,
        dataURL: String,
        dataSize: Number,
        error: String
    }
}
</script>

<style scoped>
div.error-msg {
  color: var(--clr-fg-main-highlighted);
}
</style>

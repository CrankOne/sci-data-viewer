<template>
    <div id="container">
        <source-list :defaultOpenedState="true" />
        <component
            v-for="(Section, index) in sidePanelSections"
            :key="index"
            :is="Section"
            :defaultOpenedState="true"
        />
        <appearance-ctrls :defaultOpenedState="true"/>
    </div>
</template>

<script setup>
import { computed } from 'vue';
import { useStore } from 'vuex';
import { get_module } from '@/modules/registry';
import SourceList from './SourcesList.vue';
import AppearanceCtrls from './AppearanceCtrls.vue';

const store = useStore();
const activeType = computed(() => store.getters['connection/activeType']);
const sidePanelSections = computed(() => get_module(activeType.value)?.sidePanelSections ?? []);
</script>

<style scoped>
div#container {
    max-height: 100%;
    padding: 0 3pt;
}
</style>

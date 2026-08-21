<template>
  <LayoutNode :node="rootNode" />
  <LeftEdgeSplitHandle />

  <!--
    Each module widget instance's viewport component is mounted exactly
    once, here, for as long as that instance exists, and physically
    relocated (via a plain DOM appendChild, below) into whichever panel
    currently holds it (see Panel.vue's "module-slot-<id>" marker div).
    Rendering it directly inside Panel.vue instead would destroy and
    recreate it every time the instance moves to a different panel --
    Panel.vue instances aren't preserved across layout changes, so that
    would tear down and rebuild the instance's underlying state (e.g. the
    3D viewer's WebGL context and loaded scene) on every drag. Several
    instances can be mounted at once (several simultaneous viewports); each
    gets its own host div and is relocated independently.

    This uses a manual DOM move rather than Vue's <Teleport>: Teleport's
    target needs to already exist in the DOM at the moment it (re)mounts,
    and in practice that ordering isn't reliable here because the target div
    is rendered by a different, dynamically (re)created Panel.vue instance --
    Teleport ended up either silently not finding the target, or throwing
    internally, depending on exactly how that race landed. Watching the
    whole layout tree with `flush: 'post'` and re-checking/moving each
    element ourselves once its current target definitely exists sidesteps
    that entirely.

    Re-checking on *every* layout change (not just when an instance's own
    panel id changes) matters: splitting the very panel that holds an
    instance wraps that same leaf inside a new split node, which recreates
    its Panel.vue instance (and therefore its slot div) even though the
    leaf's id -- and so its panel id -- didn't change. Since a moduleHost had
    been appended as a physical DOM child of the *old* slot div, Vue removing
    that old div takes moduleHost down with it unless we reattach it to the
    fresh one.
  -->
  <div
    v-for="instanceId in mountedModuleInstanceIds"
    :key="instanceId"
    :ref="el => set_module_host(instanceId, el)"
    class="module-host"
  >
    <component :is="viewport_component_for(instanceId)" :instance-id="instanceId" />
  </div>
</template>

<script setup>
import { computed, onMounted, watch } from 'vue';
import { useStore } from 'vuex';
import LayoutNode from './LayoutNode.vue';
import LeftEdgeSplitHandle from './LeftEdgeSplitHandle.vue';
import { get_module } from '@/modules/registry';

const store = useStore();
const rootNode = computed(() => store.state.layout.root);
const mountedModuleInstanceIds = computed(() => store.getters['layout/mountedModuleInstanceIds']);

// instanceId -> host <div> element, populated by the :ref callback above.
const moduleHosts = new Map();

function set_module_host(instanceId, el) {
    if(el) moduleHosts.set(instanceId, el);
    else moduleHosts.delete(instanceId);
}

function viewport_component_for(instanceId) {
    const instance = store.getters['widgetInstances/instance'](instanceId);
    // itemType for a module-kind instance is "<dataType>:module".
    const dataType = instance?.itemType?.split(':')[0];
    return get_module(dataType)?.viewportComponent ?? null;
}

function relocate_modules() {
    for(const instanceId of mountedModuleInstanceIds.value) {
        const host = moduleHosts.get(instanceId);
        const panelId = store.getters['layout/modulePanelIdForInstance'](instanceId);
        if(!host || !panelId) continue;
        const target = document.getElementById('module-slot-' + panelId);
        if(target && host.parentElement !== target) target.appendChild(host);
    }
}

// flush: 'post' so each target panel's slot div -- rendered by whichever
// Panel.vue instance now owns that module instance, possibly a freshly
// (re)created one -- already exists in the DOM by the time we look it up.
watch([rootNode, mountedModuleInstanceIds], relocate_modules, {flush: 'post'});
onMounted(relocate_modules);
</script>

<style scoped>
.module-host {
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
}
</style>

<template>
  <LayoutNode :node="rootNode" />

  <!--
    The module component is mounted exactly once, here, for the app's
    lifetime, and physically relocated (via a plain DOM appendChild, below)
    into whichever panel currently holds it (see Panel.vue's
    "module-slot-<id>" marker div). Rendering it directly inside Panel.vue
    instead would destroy and recreate it every time the module moves to a
    different panel -- Panel.vue instances aren't preserved across layout
    changes, so that would tear down and rebuild the module's underlying
    state (e.g. the 3D viewer's WebGL context and loaded scene) on every
    drag.

    This uses a manual DOM move rather than Vue's <Teleport>: Teleport's
    target needs to already exist in the DOM at the moment it (re)mounts,
    and in practice that ordering isn't reliable here because the target div
    is rendered by a different, dynamically (re)created Panel.vue instance --
    Teleport ended up either silently not finding the target, or throwing
    internally, depending on exactly how that race landed. Watching the
    whole layout tree with `flush: 'post'` and re-checking/moving the
    element ourselves once the current target definitely exists sidesteps
    that entirely.

    Re-checking on *every* layout change (not just when the module's own
    panel id changes) matters: splitting the very panel that holds the
    module wraps that same leaf inside a new split node, which recreates its
    Panel.vue instance (and therefore its slot div) even though the leaf's
    id -- and so modulePanelId -- didn't change. Since moduleHost had been
    appended as a physical DOM child of the *old* slot div, Vue removing
    that old div takes moduleHost down with it unless we reattach it to the
    fresh one.
  -->
  <div ref="moduleHost" class="module-host">
    <component :is="activeModule.viewportComponent" v-if="activeModule" />
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useStore } from 'vuex';
import LayoutNode from './LayoutNode.vue';
import { get_module } from '@/modules/registry';

const store = useStore();
const rootNode = computed(() => store.state.layout.root);
const modulePanelId = computed(() => store.getters['layout/modulePanelId']);
const activeType = computed(() => store.getters['connection/activeType']);
const activeModule = computed(() => get_module(activeType.value));

const moduleHost = ref(null);

function relocate_module() {
    if(!moduleHost.value || !modulePanelId.value) return;
    const target = document.getElementById('module-slot-' + modulePanelId.value);
    if(target && moduleHost.value.parentElement !== target) target.appendChild(moduleHost.value);
}

// flush: 'post' so the target panel's slot div -- rendered by whichever
// Panel.vue instance now owns the module, possibly a freshly (re)created one
// -- already exists in the DOM by the time we look it up. Watches rootNode
// (not just modulePanelId) so a slot div swapped out from under us by an
// unrelated part of the tree changing still gets caught -- see the template
// comment above.
watch([rootNode, activeModule], relocate_module, {flush: 'post'});
onMounted(relocate_module);
</script>

<style scoped>
.module-host {
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
}
</style>

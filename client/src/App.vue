<template>
  <router-view></router-view>
  <ModalHost />
  <LoadingOverlay />
  <SplitModeOverlay />
  <CleanModeOverlay />
</template>

<script setup>
import ModalHost from './components/ModalHost.vue';
import LoadingOverlay from './components/LoadingOverlay.vue';
import SplitModeOverlay from './components/SplitModeOverlay.vue';
import CleanModeOverlay from './components/CleanModeOverlay.vue';
</script>

<style>
@import 'splitpanes/dist/splitpanes.css';

.splitpanes {background-color: var(--clr-bg-unoccupied);}

.splitpanes__splitter {background-color: var(--clr-border-active); position: relative;}
.splitpanes__splitter:before {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  transition: opacity 0.2s;
  background-color: var(--clr-border-active);
  opacity: 0;
  z-index: 1;
}
.splitpanes__splitter:hover:before {opacity: 1;}
.splitpanes--vertical > .splitpanes__splitter:before {left: -5px;right: -5px;height: 100%;}
.splitpanes--horizontal > .splitpanes__splitter:before {top: -5px;bottom: -5px;width: 100%;}

</style>

<template>
  <router-view></router-view>
</template>

<script setup>
//const name = 'App';
//const components = {};
</script>

<style>
@import 'splitpanes/dist/splitpanes.css';

.splitpanes {background-color: var(--clr-bg-main);}

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

input {
  color: var(--clr-fg-panel);
  background-color: var(--clr-bg-panel);
  border: 1px solid var(--clr-border-inactive);
  width: 45pt;
  font-size: 7.5pt;
  padding: 2pt 5pt;
  margin: 2pt 5pt;
}

button, select {
  background-color: var(--clr-bg-button);
  border: var(--clr-border-inactive);
  color: var(--clr-bg-main);
  padding: 3pt 5pt;
  text-decoration: none;
  margin: 4pt 2pt;
  cursor: pointer;
  font-weight: bolder;
}
</style>

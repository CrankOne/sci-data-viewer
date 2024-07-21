<template>
  <router-view></router-view>
</template>

<script setup>
//const name = 'App';
//const components = {};
</script>

<style>
@import 'splitpanes/dist/splitpanes.css';

.splitpanes {background-color: #111;}

.splitpanes__splitter {background-color: #000;position: relative;}
.splitpanes__splitter:before {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  transition: opacity 0.2s;
  background-color: rgba(255,255,255, 0.4);
  opacity: 0;
  z-index: 1;
}
.splitpanes__splitter:hover:before {opacity: 1;}
.splitpanes--vertical > .splitpanes__splitter:before {left: -5px;right: -5px;height: 100%;}
.splitpanes--horizontal > .splitpanes__splitter:before {top: -5px;bottom: -5px;width: 100%;}

input {
  color: #6495ED;
  background-color: #110603;
  border: 1px solid #660;
  width: 45pt;
  font-size: 7.5pt;
  padding: 2pt 5pt;
  margin: 2pt 5pt;
}

button, select {
  background-color: #665;
  border: #110;
  color: #ffe;
  padding: 3pt 5pt;
  text-decoration: none;
  margin: 4pt 2pt;
  cursor: pointer;
  font-weight: bolder;
}
</style>

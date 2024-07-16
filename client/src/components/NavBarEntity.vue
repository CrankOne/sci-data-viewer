<template>
  <div id="navbarEntrity">
    <div :class="openClass" id="header" v-on:click="opened = !opened">
      <slot name="header"></slot>
    </div>
    <div id="content" v-if="isContentShown">
      <slot name="content">
        Parent is not assigned here
      </slot>
    </div>
  </div>
</template>

<script>
export default {
    name: 'NavBarEntity',
    data() {
        return {'opened': true};
    },
    computed: {
        openClass() {
            return this.opened ? 'opened' : 'closed';
        },
        isContentShown() {
            return this.opened;
        }
    }
}
</script>

<style scoped>
div#navbarEntrity {
  max-height: 30%;
}

div#header {
  background-color: #333;
  margin: 3pt;
  padding: 2pt;
  padding-left: 5pt;
  font-family: Calibri,sans-serif;
  font-weight: bold;
  border: 1px black solid;
  text-align: left;
  letter-spacing: 1pt;
}

div.opened:before {
  content: '\229F ';
  padding-right: 5pt;
}

div.closed:before {
  content: '\229E ';
  padding-right: 5pt;
}

div#content {
  margin: 3pt;
  margin-top: -4pt;
  border: 1px solid black;
  padding: 4pt;
  font-family: monospace;
  font-size: 9pt;
  background-color: #222;
}
</style>


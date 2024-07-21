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
    props: {
        defaultOpenedState: false
    },
    data() {
        return {'opened': this.defaultOpenedState};
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
  margin-bottom: 5pt;
  background-color: #222;
}

div#header {
  background-color: #333;
  padding-left: 5pt;
  font-family: Calibri,sans-serif;
  font-weight: bold;
  text-align: left;
  letter-spacing: 1pt;

  text-transform: uppercase;
  font-size: 9pt;
  cursor: pointer;
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
  font-family: monospace;
  font-size: 9pt;
  background-color: #222;
}
</style>


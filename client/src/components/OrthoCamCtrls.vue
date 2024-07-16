<template>
    <div>
      <div class="rowEntry">
        <span>Position</span>
                <input v-model.number="settings.position[0]" type="number"/>
                <input v-model.number="settings.position[1]" type="number"/>
                <input v-model.number="settings.position[2]" type="number"/>
      </div>
      <div class="rowEntry">
        <span>Look at</span>
                <input v-model.number="settings.lookAt[0]" type="number"/>
                <input v-model.number="settings.lookAt[1]" type="number"/>
                <input v-model.number="settings.lookAt[2]" type="number"/>
      </div>
      <div class="row">
        <div class="rowCell13">
          <span>Width</span>
                <input v-model.number="settings.width" type="number"/>
        </div>
        <div class="rowCell13">
          <span>near</span>
                <input v-model.number="settings.cuts[0]" type="number" min="0.00001"/>
        </div>
        <div class="rowCell13">
          <span>far</span>
                <input v-model.number="settings.cuts[1]" type="number"/>
        </div>
      </div>
      <div class="rowEntry">
        <span>Up vector</span>
                <input v-model.number="settings.up[0]" type="number"/>
                <input v-model.number="settings.up[1]" type="number"/>
                <input v-model.number="settings.up[2]" type="number"/>
      </div>
    </div>
</template>

<script>
export default {
    name: 'OrthoCamCtrls',
    props: {
      settings: {
        width: Number,
        position: Array,
        lookAt: Array,
        up: Array
      }
    }
}
</script>

<style scoped>
* {
  font-family: Monospace;
  font-size: 9pt;
}
div.rowEntry > input {
    width: 15%;
}
</style>


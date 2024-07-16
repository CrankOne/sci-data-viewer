<template>
    <div>
      <div class="rowEntry">
        <span>Position</span>
                <input v-model.number="settings.position[0]"/>
                <input v-model.number="settings.position[1]"/>
                <input v-model.number="settings.position[2]"/>
      </div>
      <div class="rowEntry">
        <span>Look at</span>
                <input v-model.number="settings.lookAt[0]"/>
                <input v-model.number="settings.lookAt[1]"/>
                <input v-model.number="settings.lookAt[2]"/>
      </div>
      <div class="row">
        <div class="rowCell14">
          <span>FOV</span>
                <input v-model.number="settings.fov"/>
        </div>
        <div class="rowCell14">
          <span>near</span>
                <input v-model.number="settings.cuts[0]"/>
        </div>
        <div class="rowCell14">
          <span>far</span>
                <input v-model.number="settings.cuts[1]"/>
        </div>
        <div class="rowCell14">
          <span>aspect</span>
                <input v-model.number="settings.aspect"/>
        </div>
      </div>

       <button v-on:click="autoadjust">auto</button>
       <button v-on:click="reset">reset</button>
    </div>
</template>

<script>
import * as THREE from 'three';

export default {
    name: 'PerspCamCtrls',
    props: {
      settings: {
        fov: Number,
        position: Array,
        lookAt: Array,
        cuts: Array,
        aspect: Number
      }
    },
    data: function() {
        return { 'initialSettings': JSON.parse(JSON.stringify(this.settings)) };
    },
    computed: {
        // Look at point current, or computed by geometric mean
        lookAtPoint() {
            const c = this.$store.getters['view3D/aabb'][2];
            console.log('xyz:', c);
            if( Number.isNaN(c.x) ) {
                return new THREE.Vector3( ...this.settings.lookAt );  // do nothing
            }
            return c;
        },
        // Camera position -- current, or computed by geometric mean
        position() {
            let [mins, maxs, c] = this.$store.getters['view3D/aabb'];
            const pos = new THREE.Vector3( ...this.settings.position );
            //console.log('pos0:', pos);  // XXX
            if( Number.isNaN(c.x) ) {
                return pos; // do nothing
            }
            pos.sub(this.lookAtPoint).normalize();
            // Diagonal of AABB defines radius of bounding sphere for the objects
            // of interest, R. Using FoV, the distance to the camera is defiend by
            // R/sin(FoV)
            let camLength = maxs.clone().sub(mins).length();
            camLength = camLength/Math.sin(this.settings.fov*Math.PI/360.)
            return this.lookAtPoint.clone().add( pos.multiplyScalar(camLength) )
        }
    },
    methods: {
        autoadjust: function(event) {
            const p = this.position;
            const lat = this.lookAtPoint;
            console.log('position:', p, 'LaT:', lat);
            this.settings.position[0] = p.x;
            this.settings.position[1] = p.y;
            this.settings.position[2] = p.z;
            this.settings.lookAt[0] = lat.x;
            this.settings.lookAt[1] = lat.y;
            this.settings.lookAt[2] = lat.z;
        },
        reset: function(event) {
            this.settings.fov = this.initialSettings.fov;
            for(let i = 0; i < 3; ++i) {
                this.settings.position[i] = this.initialSettings.position[i];
                this.settings.lookAt[i]   = this.initialSettings.lookAt[i];
            }
            this.settings.cuts[0] = this.initialSettings.cuts[0];
            this.settings.cuts[1] = this.initialSettings.cuts[1];
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


<template>
  <div id="navbarEntity">
    <div
      :class="openClass"
      id="header"
      :draggable="itemId != null"
      v-on:click="opened = !opened"
      v-on:dragstart="on_drag_start"
    >
      <span id="header-title"><slot name="header"></slot></span>
      <span
        v-if="$slots.actions"
        id="header-actions"
        @click.stop
        @mousedown.stop
      >
        <slot name="actions"></slot>
      </span>
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
        defaultOpenedState: false,
        // Panel-layout item id (see modules/panelItems.js). When set, the
        // header becomes the drag handle for relocating this item between
        // panels (see components/Panel.vue).
        itemId: {type: String, default: null}
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
    },
    methods: {
        on_drag_start(event) {
            if(this.itemId == null) return;
            event.dataTransfer.setData('application/x-panel-item', this.itemId);
            event.dataTransfer.effectAllowed = 'move';
        }
    }
}
</script>

<style scoped>
div#navbarEntity {
  background-color: var(--clr-bg-panel);
}

div#header {
  font-size: var(--um1);
  background-color: var(--clr-bg-panel-header);
  color: var(--clr-fg-panel-header);

  display: flex;
  align-items: center;
  gap: var(--um1);

  font-weight: bold;
  text-align: left;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  cursor: pointer;
}

#header-title {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  padding: var(--um3);
}

#header-actions {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 0.3rem;
  cursor: default;
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
  background-color: var(--clr-bg-panel);
  padding: var(--um3);

  /* Bounded instead of the old percentage-of-parent cap: an accordion's
     content used to be able to grow past its own box (max-height:30% of a
     container whose actual height varies a lot now that panels are
     splittable) and visually bleed into whatever sits below it. Capping and
     scrolling here keeps that content inside its own box regardless of how
     tall/short the surrounding panel is. */
  max-height: 50vh;
  overflow-y: auto;
  overflow-x: auto;
}
</style>


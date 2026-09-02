<!--
  Shared chrome for a layout leaf's content that occupies a whole panel
  (unlike a subpanel item, which stacks with siblings under
  NavBarEntity.vue's own header/collapse shell) -- today: a module viewport
  and the wiring-diagram widget (components/SinkWiringPanel.vue,
  store/modules/layout.js's 'module'/'wiring' leaf kinds). Provides exactly
  what both need and nothing kind-specific:

  - a corner drag-knob, relocating the whole leaf between panels via native
    HTML5 drag-and-drop -- the same mechanism Panel.vue's own drop handling
    already reads (`event.dataTransfer.types`), just generalized to whatever
    MIME type/payload string this instance is told to use (`dragType`/
    `dragPayload` props) so a module drag stays `application/x-panel-module`
    +instanceId and a wiring drag becomes `application/x-panel-wiring`+the
    leaf's own id, with no kind-specific branching in this component itself;
  - a "remove" button, purely an emitted event -- what removal actually
    *means* (a module's confirm-if-last-viewport dance vs. a wiring leaf's
    unconditional revert-to-empty) is entirely the caller's concern;
  - an optional hovering toolbar slot (visual language borrowed from
    modules/three-view/components/ThreeViewport.vue's own `.camera-widget__
    bar`: a small always-visible floating row, never expanding into a
    detail panel) for whatever compact controls a resident wants to offer
    without a subpanel of their own.

  No title, no collapse toggle -- a full occupying leaf has no stack to
  collapse into (splitpanes owns its size, not its content), unlike
  NavBarEntity's subpanel items.
-->
<template>
  <div class="resident-chrome">
    <div
      class="resident-chrome__knob"
      draggable="true"
      title="Move"
      aria-label="Move"
      @dragstart="on_drag_start"
    >
      <span class="resident-chrome__knob-icon" aria-hidden="true">&#x283F;</span>
    </div>
    <button
      type="button"
      class="header-action resident-chrome__remove"
      title="Remove"
      aria-label="Remove"
      @click="$emit('remove')"
    >
      <span class="vi vi-trash-bin" aria-hidden="true" />
    </button>

    <div v-if="$slots.toolbar" class="resident-chrome__toolbar">
      <slot name="toolbar" />
    </div>

    <div class="resident-chrome__content">
      <slot />
    </div>
  </div>
</template>

<script setup>
const props = defineProps({
    // MIME type this instance's knob drag advertises -- Panel.vue's own
    // on_panel_drag_over/on_panel_drop read event.dataTransfer.types to
    // decide what a given panel can accept and how to interpret a drop.
    dragType: {type: String, required: true},
    // The id string carried as that MIME type's payload (an instanceId for
    // a module, a leaf id for a wiring widget) -- opaque to this component.
    dragPayload: {type: String, required: true}
});
defineEmits(['remove']);

function on_drag_start(event) {
    event.dataTransfer.setData(props.dragType, props.dragPayload);
    event.dataTransfer.effectAllowed = 'move';
}
</script>

<style scoped>
.resident-chrome {
  position: relative;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
}

.resident-chrome__content {
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
}

/* Folded-corner drag handle -- moved verbatim from Panel.vue's own former
   .module-drag-handle, now shared. */
.resident-chrome__knob {
  position: absolute;
  top: 0;
  left: 0;
  width: var(--up3);
  height: var(--up3);
  clip-path: polygon(100% 0, 0 100%, 0 0);
  background-filter: blur(3px);
  cursor: grab;
  z-index: 10;
  color: var(--clr-supporting);
}

.resident-chrome__knob:hover {
  color: var(--clr-main);
  background-color: var(--clr-accent);
}

.resident-chrome__knob-icon {
  position: absolute;
  top: var(--um3);
  left: var(--um3);
  font-size: var(--u0);
  line-height: 1;
  pointer-events: none;
}

.resident-chrome__remove {
  position: absolute;
  top: 0;
  right: 0;
  z-index: 10;
  width: var(--up3);
  height: var(--up3);
  background-filter: blur(3px);
  z-index: 10;
}

/* Hovering toolbar row */
.resident-chrome__toolbar {
  position: absolute;
  top: var(--um2);
  left: calc(3*var(--um2));
  z-index: 10;
  display: flex;
  align-items: center;
  gap: var(--um3);
  padding: var(--um3);
  max-width: min(36rem, calc(100% - 1.5rem));
  border: var(--border-thin) solid var(--clr-border-inactive);
  border-radius: var(--border-radius);
  background: var(--clr-neutral-transparent);
  backdrop-filter: blur(3px);
}
</style>

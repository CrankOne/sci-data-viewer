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
    leaf's own id, with no kind-specific branching in this component itself.
    Sits top-right (there used to be a matching "remove" corner button/emit
    in that corner instead -- removed in favor of CleanModeOverlay.vue's
    click-a-panel gesture, AppControls.vue's "Clean panel" button, which
    resolves what a clicked panel holds off the store instead of needing
    this component to plumb an event through -- freeing this corner up for
    the knob, out of a hovering toolbar's own top-left way);
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

    <div v-if="$slots.toolbar" class="resident-chrome__toolbar toolbar-floating">
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
   .module-drag-handle, now shared. Top-right (mirrored from its original
   top-left) now that nothing else claims that corner (see the header
   comment) -- top-left stays clear for a hovering toolbar's own
   --hover-toolbar-top/left offset. */
.resident-chrome__knob {
  position: absolute;
  top: 0;
  right: 0;
  width: var(--up3);
  height: var(--up3);
  clip-path: polygon(0 0, 100% 100%, 100% 0);
  backdrop-filter: blur(3px);
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
  right: var(--um3);
  transform: rotate(90deg);
  font-size: var(--u0);
  line-height: 1;
  pointer-events: none;
}

/* Hovering toolbar row -- the row itself is invisible (no border/background
   of its own, minimal padding) so it occupies as little of the module as
   possible; each button/select/button-group it contains carries its own
   blurred backing instead (see .toolbar-floating in style.css). */
.resident-chrome__toolbar {
  position: absolute;
  top: var(--hover-toolbar-top);
  left: var(--hover-toolbar-left);
  z-index: 10;
  display: flex;
  align-items: center;
  gap: var(--um3);
  max-width: min(36rem, calc(100% - 1.5rem));
}
</style>

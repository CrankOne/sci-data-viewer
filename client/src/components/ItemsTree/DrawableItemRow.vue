<template>
  <div
    class="item-row"
    :class="{
      selected,
      highlighted,
      hidden: !item.visible
    }"
    @click="$emit('toggle-selection')"
    @mouseenter="$emit('hover')"
    @mouseleave="$emit('unhover')"
  >
    <span
      class="vi"
      :class="`vi-${geometryIcon}`"
      aria-hidden="true"
    />

    <span class="item-label">
      {{ item.label }}
    </span>

    <button
      class="visibility-button"
      type="button"
      :title="item.visible ? 'Hide item' : 'Show item'"
      :aria-label="item.visible ? 'Hide item' : 'Show item'"
      @click.stop="$emit('toggle-visibility')"
    >
      <span v-if="item.visible" class="vi vi-eye" aria-hidden="true"></span>
      <span v-else class="vi vi-eye-stroked" aria-hidden="true"></span>
    </button>

    <span class="item-source">
      @{{ item.source }}
    </span>
  </div>
</template>

<script>
export default {
  name: "DrawableItemRow",

  props: {
    item: {
      type: Object,
      required: true
    },

    selected: {
      type: Boolean,
      default: false
    },

    highlighted: {
      type: Boolean,
      default: false
    }
  },

  emits: [
    "toggle-selection",
    "hover",
    "unhover",
    "toggle-visibility"
  ],

  computed: {
    geometryIcon() {
      switch (this.item.geometryType) {
        case "Mesh":
          return "mesh";

        case "BoxGeometry":
          return "cube";

        case "PointMarkers":
          return "space-markers";

        case "Line":
          return "line";

        case "ColoredLineSegments":
          return "line-variadic";

        case "Plane":
          return "plane";

        default:
          return "object3d";
      }
    }
  }
};
</script>

<style scoped>
.item-row {
  display: grid;
  grid-template-columns:
    1.1rem
    minmax(0, 1fr)
    1.4rem
    auto;

  align-items: center;
  gap: 0.25rem;

  min-height: 1.7rem;
  cursor: pointer;
}

.item-row:hover,
.item-row.highlighted {
  background-color: var(--clr-bg-highlight2);
  color: var(--clr-fg-highlight2);
}

.item-row.selected {
  background-color: var(--clr-bg-highlight1);
  color: var(--clr-fg-highlight1);
}

.item-row.hidden {
  opacity: 0.55;
}

.geometry-icon {
  text-align: center;
}

.visibility-button {
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
  cursor: pointer;
  margin: 0;
}

.item-label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.item-source {
  color: var(--clr-fg-main-muted);
  font-size: 0.85em;
  white-space: nowrap;
}
</style>

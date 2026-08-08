<template>
  <div
    class="item-row"
    :class="{
      selected,
      highlighted,
      hidden: !item.visible
    }"
    role="treeitem"
    @click="$emit('toggle-selection', item.id)"
    @mouseenter="$emit('hover', item.id)"
    @mouseleave="$emit('unhover')"
  >
    <span
      class="vi"
      :class="`vi-${geometryIconClass}`"
      :title="item.geometryType || 'Geometry item'"
      aria-hidden="true"
    />

    <span class="item-label">
      {{ item.label }}
    </span>

    <span class="item-source">
      @{{ item.source }}
    </span>

    <button
      type="button"
      class="visibility-button"
      :title="item.visible ? 'Hide item' : 'Show item'"
      :aria-label="item.visible ? 'Hide item' : 'Show item'"
      @click.stop="$emit('set-visibility', {
        ids: [item.id],
        visible: !item.visible
      })"
    >
      <span
        class="vi"
        :class="item.visible ? 'vi-eye' : 'vi-eye-stroked'"
        aria-hidden="true"
      />
    </button>
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
        "set-visibility"
    ],

    computed: {
        geometryIconClass() {
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
    1.25rem
    minmax(0, 1fr)
    auto
    1.75rem;

  align-items: center;
  gap: 0.3rem;

  min-height: 1.8rem;
  padding: 0.08rem 0.25rem 0.08rem 0.4rem;

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
  width: 1.25rem;
  text-align: center;
}

.item-label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.item-source {
  color: var(--clr-fg-main-muted);
  font-size: 0.8em;
  white-space: nowrap;
}

.visibility-button {
  display: inline-grid;
  place-items: center;

  width: 1.6rem;
  height: 1.6rem;
  padding: 0;

  border: 0;
  background: transparent;
  color: inherit;
  cursor: pointer;
}

.visibility-button:hover {
  background: rgb(127 127 127 / 15%);
}
</style>

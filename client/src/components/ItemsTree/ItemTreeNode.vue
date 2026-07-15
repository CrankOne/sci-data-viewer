<template>
  <li
    v-if="node.kind === 'group'"
    class="tree-node tree-group"
    role="treeitem"
    :aria-expanded="isExpanded"
  >
    <div class="group-row"
        :class="{ highlighted: containsHighlightedItem }"
        @mouseenter="hoverGroup"
        @mouseleave="$emit('unhover')">
      <button
        type="button"
        class="group-toggle"
        :title="isExpanded ? 'Collapse group' : 'Expand group'"
        @click="$emit('toggle-group', node.key)"
      >
        <span
          class="vi"
          :class="isExpanded ? 'vi-minus-framed' : 'vi-plus-framed'"
          aria-hidden="true"
        />
      </button>

      <span class="group-label" @dblclick="$emit('toggle-group', node.key)">
        {{ node.label }}
      </span>

      <span class="group-facet">
        {{ node.facet }}
      </span>

      <span class="group-count">
        {{ descendantItemIDs.length }}
      </span>

      <button
        type="button"
        class="visibility-button"
        :title="groupVisibilityTitle"
        :aria-label="groupVisibilityTitle"
        @click.stop="toggleGroupVisibility"
      >
        <span
          class="vi"
          :class="groupVisibilityIcon"
          aria-hidden="true"
        />
      </button>
    </div>

    <ul
      v-show="isExpanded"
      class="group-children"
      role="group"
    >
      <ItemTreeNode
        v-for="child in node.children"
        :key="child.key"
        :node="child"
        :expanded-group-keys="expandedGroupKeys"
        :selected-ids="selectedIds"
        :highlighted-ids="highlightedIds"
        :hidden-ids="hiddenIds"
        @toggle-group="$emit('toggle-group', $event)"
        @toggle-selection="$emit('toggle-selection', $event)"
        @hover="$emit('hover', $event)"
        @unhover="$emit('unhover')"
        @set-visibility="$emit('set-visibility', $event)"
      />
    </ul>
  </li>

  <li v-else class="tree-node">
    <DrawableItemRow
      :item="{
        ...node.item,
        visible: !hiddenIds.has(node.item.id)
      }"
      :selected="selectedIds.has(node.item.id)"
      :highlighted="highlightedIds.has(node.item.id)"
      @toggle-selection="$emit('toggle-selection', $event)"
      @hover="$emit('hover', $event)"
      @unhover="$emit('unhover')"
      @set-visibility="$emit('set-visibility', $event)"
    />
  </li>
</template>

<script>
import DrawableItemRow from "./DrawableItemRow.vue";
import { collectItemIDs } from "./tree.js";

export default {
  name: "ItemTreeNode",

  components: {
    DrawableItemRow
  },

  props: {
    node: {
      type: Object,
      required: true
    },

    expandedGroupKeys: {
      type: Set,
      required: true
    },

    selectedIds: {
      type: Set,
      required: true
    },

    highlightedIds: {
      type: Set,
      required: true
    },

    hiddenIds: {
      type: Set,
      required: true
    }
  },

  emits: [
    "toggle-group",
    "toggle-selection",
    "hover",
    "unhover",
    "set-visibility"
  ],

  computed: {
    isExpanded() {
      return this.expandedGroupKeys.has(this.node.key);
    },

    descendantItemIDs() {
      return collectItemIDs(this.node);
    },

    visibleCount() {
      return this.descendantItemIDs.reduce(
        (count, id) => count + (this.hiddenIds.has(id) ? 0 : 1),
        0
      );
    },

    groupVisibilityState() {
      if (this.visibleCount === 0)
        return "hidden";

      if (this.visibleCount === this.descendantItemIDs.length)
        return "visible";

      return "mixed";
    },

    groupVisibilityIcon() {
      switch (this.groupVisibilityState) {
        case "visible":
          return "vi-eye";

        case "hidden":
          return "vi-eye-stroked";

        default:
          return "vi-eye-semistroked";
      }
    },

    groupVisibilityTitle() {
      switch (this.groupVisibilityState) {
        case "visible":
          return "Hide all items in this group";

        case "hidden":
          return "Show all items in this group";

        default:
          return "Show all items in this group";
      }
    },

    containsHighlightedItem() {
      return this.descendantItemIDs.some(id =>
        this.highlightedIds.has(id)
      );
    },
  },  // computed

  methods: {
    toggleGroupVisibility() {
      this.$emit("set-visibility", {
        ids: this.descendantItemIDs,
        visible: this.groupVisibilityState !== "visible"
      });
    },
    hoverGroup() {
      this.$emit(
        "hover",
        this.descendantItemIDs
      );
    },
  }  // methods
};
</script>

<style scoped>
.tree-node,
.group-children {
  margin: 0;
  padding: 0;
  list-style: none;
}

.group-children {
  padding-left: 0.8rem;
}

.group-row {
  display: grid;
  grid-template-columns:
    1.5rem
    minmax(0, 1fr)
    auto
    auto
    1.75rem;

  align-items: center;
  gap: 0.3rem;

  min-height: 1.8rem;
  padding: 0.08rem 0.25rem;
}

.group-row:hover
.group-row.highlighted {
  background-color: var(--clr-bg-highlight2);
  color: var(--clr-fg-highlight2);
}

.group-toggle,
.visibility-button {
  display: inline-grid;
  place-items: center;

  width: 1.5rem;
  height: 1.5rem;
  padding: 0;

  border: 0;
  background: transparent;
  color: inherit;
  cursor: pointer;
}

.group-label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;

  font-weight: 600;
  cursor: default;
}

.group-facet {
  color: var(--clr-fg-main-muted);
  font-size: 0.75em;
}

.group-count {
  min-width: 1.5em;
  color: var(--clr-fg-main-muted);
  font-size: 0.8em;
  text-align: right;
}

.group-row.highlighted {
  background-color: var(--clr-bg-highlight2);
  color: var(--clr-fg-highlight2);
}
</style>

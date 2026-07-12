<template>
  <li v-if="node.kind === 'group'" class="tree-node tree-group" role="treeitem">
    <button
      class="group-row"
      type="button"
      :aria-expanded="isOpen"
      @click="expanded = !expanded"
    >
      <span class="disclosure-icon" aria-hidden="true">
        {{ isOpen ? "🗁" : "🗀" }}
      </span>

      <span class="group-label">{{ node.label }}</span>

      <span class="group-count">{{ leafCount }}</span>
    </button>

    <ul
      v-show="isOpen"
      class="group-children"
      role="group"
    >
      <ItemTreeNode
        v-for="child in node.children"
        :key="child.key"
        :node="child"
        :force-open="forceOpen"
        :selected-ids="selectedIds"
        :highlighted-ids="highlightedIds"
        @toggle-selection="$emit('toggle-selection', $event)"
        @hover="$emit('hover', $event)"
        @unhover="$emit('unhover')"
        @toggle-visibility="$emit('toggle-visibility', $event)"
      />
    </ul>
  </li>

  <li v-else class="tree-node" role="treeitem">
    <DrawableItemRow
      :item="node.item"
      :selected="selectedIds.has(node.item.id)"
      :highlighted="highlightedIds.has(node.item.id)"
      @toggle-selection="$emit('toggle-selection', node.item.id)"
      @hover="$emit('hover', node.item.id)"
      @unhover="$emit('unhover')"
      @toggle-visibility="$emit('toggle-visibility', node.item.id)"
    />
  </li>
</template>

<script>
// recursively renders group nodes and delegates leaves to a dedicated row
// component.
import DrawableItemRow from "./DrawableItemRow.vue";

export default {
  name: "ItemTreeNode",
  components: { DrawableItemRow },

  props: {
    node: {
      type: Object,
      required: true
    },

    forceOpen: {
      type: Boolean,
      default: false
    },

    selectedIds: {
      type: Set,
      required: true
    },

    highlightedIds: {
      type: Set,
      required: true
    }
  },

  emits: [
    "toggle-selection",
    "hover",
    "unhover",
    "toggle-visibility"
  ],

  data() {
    return {
      expanded: true
    };
  },

  computed: {
    isOpen() {
      return this.forceOpen || this.expanded;
    },

    leafCount() {
      const countLeaves = node =>
        node.kind === "item"
          ? 1
          : node.children.reduce(
              (sum, child) => sum + countLeaves(child),
              0
            );

      return countLeaves(this.node);
    }
  }
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
  width: 100%;
  display: grid;
  grid-template-columns: 1rem minmax(0, 1fr) auto;
  align-items: center;
  gap: 0.25rem;
  margin: 0;

  border: 0;
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;
}

.group-row:hover {
  background-color: var(--clr-bg-highlight2);
  color: var(--clr-fg-highlight2);
}

.disclosure-icon {
  text-align: center;
}

.group-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 600;
}

.group-count {
  color: var(--clr-fg-main-muted);
  font-size: 0.85em;
}
</style>

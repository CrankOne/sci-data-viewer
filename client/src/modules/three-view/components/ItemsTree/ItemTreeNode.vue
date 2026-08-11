<template>
  <li
    v-if="node.kind === 'group'"
    class="tree-node tree-group"
    role="treeitem"
    :aria-expanded="isExpanded"
  >
    <div class="group-row"
        :class="{
           highlighted: containsHighlightedItem,
           selected: groupSelectionState === 'all',
           'partially-selected': groupSelectionState === 'partial'
         }"
        @mouseenter="hover_group"
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
        {{ selectedCount }}/{{ descendantItemIDs.length }}
      </span>

      <button
        type="button"
        class="group-action-button"
        title="Select all items in this group"
        aria-label="Select all items in this group"
        :disabled="groupSelectionState === 'all'"
        @click.stop="select_group"
      >
        <span class="vi vi-select-all" aria-hidden="true" />
      </button>

      <button
        type="button"
        class="group-action-button"
        title="Invert selection in this group"
        aria-label="Invert selection in this group"
        @click.stop="invert_group_selection"
      >
        <span class="vi vi-invert-selection" aria-hidden="true" />
      </button>

      <button
        type="button"
        class="group-action-button"
        title="Clear selection in this group"
        aria-label="Clear selection in this group"
        :disabled="selectedCount === 0"
        @click.stop="clear_group_selection"
      >
        <span class="vi vi-clear-selection" aria-hidden="true" />
      </button>

      <button
        type="button"
        class="visibility-button"
        :title="groupVisibilityTitle"
        :aria-label="groupVisibilityTitle"
        @click.stop="toggle_group_visibility"
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
          @select-items="$emit('select-items', $event)"
          @clear-selection="$emit('clear-selection', $event)"
          @invert-selection="$emit('invert-selection', $event)"
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
import { collect_item_ids } from "./tree.js";

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
        "select-items",
        "clear-selection",
        "invert-selection",
        "hover",
        "unhover",
        "set-visibility"
    ],

    computed: {
        isExpanded() {
            return this.expandedGroupKeys.has(this.node.key);
        },

        descendantItemIDs() {
            return collect_item_ids(this.node);
        },

        visibleCount() {
            return this.descendantItemIDs.reduce(
                (count, id) => count + (this.hiddenIds.has(id) ? 0 : 1)
              , 0
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
            return this.descendantItemIDs.some(id => this.highlightedIds.has(id));
        },

        selectedCount() {
            return this.descendantItemIDs.reduce(
                (count, id) => count + (this.selectedIds.has(id) ? 1 : 0)
              , 0
            );
        },

        groupSelectionState() {
            if (this.selectedCount === 0)
                return "none";

            if (this.selectedCount === this.descendantItemIDs.length)
                return "all";

            return "partial";
        },
    },  // computed

    methods: {
        toggle_group_visibility() {
            this.$emit("set-visibility", {
                ids: this.descendantItemIDs,
                visible: this.groupVisibilityState !== "visible"
            });
        },
        hover_group() {
            this.$emit("hover", this.descendantItemIDs);
        },

        select_group() {
            this.$emit("select-items", this.descendantItemIDs);
        },

        invert_group_selection() {
            this.$emit("invert-selection", this.descendantItemIDs);
        },

        clear_group_selection() {
            this.$emit("clear-selection", this.descendantItemIDs);
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
    1.5rem
    1.5rem
    1.5rem
    1.75rem;

  align-items: center;
  gap: 0.1rem;

  min-height: 1.8rem;
  padding: 0.08rem 0.25rem;
}

.group-row:hover
.group-row.highlighted {
  background-color: var(--clr-bg-highlight2);
  color: var(--clr-fg-highlight2);
}

.group-toggle,
.group-action-button,
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

.group-action-button:disabled {
  opacity: 0.35;
  cursor: default;
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

.group-row.selected {
  background-color: var(--clr-bg-highlight1);
  color: var(--clr-fg-highlight1);
}

.group-row.partially-selected {
  background-color:
    color-mix(
      in srgb,
      var(--clr-bg-highlight1) 45%,
      var(--clr-bg-options)
    );

  color: var(--clr-fg-options);
}

.group-row:hover,
.group-row.highlighted {
  background-color: var(--clr-bg-highlight2);
  color: var(--clr-fg-highlight2);
}
</style>

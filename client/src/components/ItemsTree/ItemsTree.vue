<template>
  <NavBarEntity>
    <template #header>Items</template>
    <template #content>
      <div class="tree-toolbar">

        <input
          type="search"
          v-model="query"
          placeholder="Filter..."
        />

        <select v-model="groupBy" aria-label="Group by">
          <option value="category">Category</option>
          <option value="source">Data source</option>
          <option value="prefix">Name prefix</option>
          <option value="tgroup">Transf.group</option>
        </select>
      </div>

      <ul class="items-tree" role="tree">
        <ItemTreeNode
          v-for="node in tree"
          :key="node.key"
          :node="node"
          :force-open="queryIsActive"
          :selected-ids="selectedGeoItemIDs"
          :highlighted-ids="highlightedGeoItemIDs"
          @toggle-selection="toggle_item_selection"
          @hover="hover_item"
          @unhover="unhover_item"
          @toggle-visibility="toggle_item_visibility"
        />
      </ul>
      <p v-if="tree.length === 0" class="empty-message">
        No matching items.
      </p>

      <div class="tree-actions">
        <button
          type="button"
          title="Collapse all"
          @click="collapseAll"
        >
          🗀
        </button>

        <button
          type="button"
          title="Expand all"
          @click="expandAll"
        >
          🗁
        </button>

        <span class="tree-actions-separator" />

        <button
          type="button"
          title="Select all (filtered) items"
          @click="selectAll"
        >
          <span class="vi vi-select-all" aria-hidden="true" />
        </button>

        <button
          type="button"
          title="Invert selection of (filtered) items"
          @click="invertSelection"
        >
          <span class="vi vi-invert-selection" aria-hidden="true" />
        </button>
      </div>
    </template>
  </NavBarEntity>
</template>

<script>
import {mapState} from 'vuex'
import NavBarEntity from '@/components/NavBarEntity.vue'
import ItemTreeNode from "./ItemTreeNode.vue";
//import Treeselect from "@zanmato/vue3-treeselect";
//import "@zanmato/vue3-treeselect/dist/vue3-treeselect.min.css";

/*                                                           _________________
 * ________________________________________________________/ Utility functions
 */

function make_group(label, key) {
  return {
    kind: "group",
    key,
    label,
    children: []
  };
}

function extract_name_prefix(name) {
  /*
   * GM01       -> GM
   * GEM12      -> GEM
   * MB01ub     -> MB
   * ECAL       -> ECAL
   * gm01-hits  -> gm
   *
   * Adjust this rule if detector names follow a stricter grammar.
   */
  return name.match(/^[^\d_-]+/)?.[0] || name;
}

function grouping_path(item, groupBy) {
  switch (groupBy) {
    case "category":
      return item.category.length
        ? item.category
        : ["Uncategorized"];

    case "source":
      return [item.source || "Unknown source"];

    case "prefix":
      return [extract_name_prefix(item.label)];

    default:
      return ["Items"];
  }
}

function insert_into_tree(roots, groupMap, item, path, groupBy) {
  let children = roots;
  let parentKey = groupBy;

  for (const part of path) {
    parentKey = `${parentKey}/${part}`;

    let group = groupMap.get(parentKey);

    if (!group) {
      group = make_group(part, `group/${parentKey}`);
      groupMap.set(parentKey, group);
      children.push(group);
    }

    children = group.children;
  }

  children.push({
    kind: "item",
    key: `item/${item.id}`,
    item
  });
}

function sort_tree(nodes) {
  nodes.sort((a, b) => {
    if (a.kind !== b.kind)
      return a.kind === "group" ? -1 : 1;

    const aLabel = a.kind === "group" ? a.label : a.item.label;
    const bLabel = b.kind === "group" ? b.label : b.item.label;

    return aLabel.localeCompare(bLabel, undefined, {
      numeric: true,
      sensitivity: "base"
    });
  });

  for (const node of nodes) {
    if (node.kind === "group")
      sort_tree(node.children);
  }

  return nodes;
}


/*                                                                   _________
 * ________________________________________________________________/ Component
 */

export default {
  name: 'ItemsTree',

  components: {NavBarEntity, ItemTreeNode},

  data() {
    return {
      query: "",
      groupBy: "category",
    };
  },

  computed: {
    // shortcuts, returns corresponding objects from store
    geoData() {
        return this.$store.getters['view3D/geoData'];
    },
    selectedGeoItemIDs() {
        return this.$store.getters['view3D/selectedGeoItemIDs'];
    },
    highlightedGeoItemIDs() {
        return this.$store.getters['view3D/highlightedGeoItemIDs'];
    },
    queryIsActive() {
      return this.query.trim().length !== 0;
    },
    // available items with their id, label and category
    availableItems() {
      return Object.entries(this.geoData).flatMap(([sourceID, source]) =>
        source.geometry.map(geometry => ({
          id: `${geometry._name}@${sourceID}`,
          label: geometry._name,
          source: sourceID,
          category: geometry._category ?? [],
          tags: geometry._tags ?? [],
          // These fields may initially be absent. Kept them for future use
          geometryType: geometry._type ?? null,
          visible: geometry._visible ?? true
        }))
      );
    },

    // when query is empty, returns full list of available items, otherwise
    // applies query to filter only the selected ones
    filteredItems() {
      const query = this.query.trim().toLowerCase();

      if (!query)
        return this.availableItems;

      return this.availableItems.filter(item =>
        item.label.toLowerCase().includes(query) ||
        item.source.toLowerCase().includes(query) ||
        item.category.some(part =>
          part.toLowerCase().includes(query)
        ) ||
        item.tags.some(tag =>
          tag.toLowerCase().includes(query)
        )
      );
    },

    tree() {
      const roots = [];
      const groupMap = new Map();

      for (const item of this.filteredItems) {
        insert_into_tree(
          roots,
          groupMap,
          item,
          grouping_path(item, this.groupBy),
          this.groupBy
        );
      }

      return sort_tree(roots);
    }
  },  // computed
  methods: {
    toggle_item_selection(id) {
      console.debug(`Toggle item selection for geo item with ID "${id}"`);
      if(this.selectedGeoItemIDs.has(id))
        this.$store.commit('view3D/unselect_geo_items', id);
      else
        this.$store.commit('view3D/select_geo_items', id);
    },
    hover_item(id) {
        this.$store.commit('view3D/set_highlight_geo_items', id);
    },
    unhover_item(id) {
        this.$store.commit('view3D/clear_geo_items_highlight');
    },
    toggleItemVisibility(id) {
      /* This mutation is to be introduced later. Keeping visibility interaction
       * separate from selection prevents clicks on the icon from selecting
       * the row.
       */
      this.$store.commit("view3D/toggle_geo_item_visibility", id);
    }
  }  // methods
}
</script>

<style scoped>
.tree-toolbar {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 0.4rem;
  margin-bottom: 0.4rem;
}

.tree-toolbar input,
.tree-toolbar select {
  min-width: 0;
}

.items-tree {
  margin: 0;
  padding: 0.25rem 0;
  list-style: none;

  background-color: var(--clr-bg-options);
  color: var(--clr-fg-options);
  border: 1px solid var(--clr-border-inactive);
}

.empty-message {
  padding: 0.5rem;
  color: var(--clr-fg-main-muted);
  font-style: italic;
}
</style>

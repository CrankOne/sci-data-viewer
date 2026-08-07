<template>
  <NavBarEntity>
    <template #header>
      Items
    </template>

    <template #content>
      <div class="items-tree-widget">
        <FacetPresetEditor
          :preset-names="facetPresetNames"
          :active-preset-name="activeFacetPresetName"
          :active-facets="activeFacets"
          :inactive-facets="inactiveFacets"
          @activate-preset="activate_preset"
          @set-active-facets="set_active_facets"
          @save-preset="save_preset"
          @update-preset="update_preset"
          @delete-preset="delete_preset"
        />

        <SelectionSetEditor
          :set-names="selectionSetNames"
          :active-set-name="activeSelectionSetName"
          :selected-item-count="selectedGeoItemIDs.size"
          :selected-marker-count="selectedMarkerCount"
          :has-unsaved-changes="selectionHasUnsavedChanges"
          @activate-set="activate_selection_set"
          @save-set="save_selection_set"
          @delete-set="delete_selection_set"
          @apply-set="apply_selection_set"
        />

        <div class="tree-toolbar">
          <input
            v-model="query"
            type="search"
            placeholder="Filter geometry..."
          />

          <div class="tree-actions">
            <button
              type="button"
              title="Collapse all groups"
              @click="collapse_all"
            >
              <span class="vi vi-minus-framed" aria-hidden="true" />
            </button>

            <button
              type="button"
              title="Expand all groups"
              @click="expand_all"
            >
              <span class="vi vi-plus-framed" aria-hidden="true" />
            </button>

            <span class="toolbar-separator" />

            <button
              type="button"
              title="Select all filtered items"
              @click="select_all"
            >
              <span class="vi vi-select-all" aria-hidden="true" />
            </button>

            <button
              type="button"
              title="Invert selection of filtered items"
              @click="invert_selection"
            >
              <span class="vi vi-invert-selection" aria-hidden="true" />
            </button>

            <button
              type="button"
              title="Clear selection"
              :disabled="selectedGeoItemIDs.size === 0"
              @click="clear_selection"
            >
              <span class="vi vi-clear-selection" aria-hidden="true" />
            </button>

            <span class="toolbar-separator" />

            <button
              type="button"
              title="Show selected items"
              :disabled="selectedGeoItemIDs.size === 0"
              @click="show_selected"
            >
              <span class="vi vi-eye" aria-hidden="true"/>
            </button>

            <button
              type="button"
              title="Hide selected items"
              :disabled="selectedGeoItemIDs.size === 0"
              @click="hide_selected"
            >
              <span class="vi vi-eye-stroked" aria-hidden="true"/>
            </button>
          </div>
        </div>

        <div class="tree-scroll-area">
          <ul
            v-if="tree.length"
            class="items-tree"
            role="tree"
          >
            <ItemTreeNode
                  v-for="node in tree"
                  :key="node.key"
                  :node="node"
                  :expanded-group-keys="effectiveExpandedGroupKeys"
                  :selected-ids="selectedGeoItemIDs"
                  :highlighted-ids="highlightedGeoItemIDs"
                  :hidden-ids="hiddenGeoItemIDs"
                  @toggle-group="toggle_group"
                  @toggle-selection="toggle_item_selection"
                  @select-items="select_items"
                  @clear-selection="clear_items_selection"
                  @invert-selection="invert_items_selection"
                  @hover="hover_item"
                  @unhover="unhover_item"
                  @set-visibility="set_visibility"
                />
          </ul>

          <p v-else class="empty-message">
            No matching items
          </p>
        </div>
      </div>
    </template>
  </NavBarEntity>
</template>

<script>
import NavBarEntity from "../NavBarEntity.vue";
import FacetPresetEditor from "./FacetPresetEditor.vue";
import ItemTreeNode from "./ItemTreeNode.vue";
import SelectionSetEditor from "./SelectionSetEditor.vue";

import {
    build_facet_tree,
    collect_group_keys,
    collect_highlighted_group_keys,
} from "./tree.js";

export default {
    name: "ItemsTree",

    components: {
        NavBarEntity,
        FacetPresetEditor,
        SelectionSetEditor,
        ItemTreeNode
    },

    data() {
        return {
            query: "",
            expandedGroupKeys: new Set()
        };
    },

    computed: {
        geoData() {
            return this.$store.getters["view3D/geoData"];
        },

        selectedGeoItemIDs() {
            return this.$store.getters["view3D/selectedGeoItemIDs"];
        },

        highlightedGeoItemIDs() {
            return this.$store.getters["view3D/highlightedGeoItemIDs"];
        },

        hiddenGeoItemIDs() {
            return this.$store.getters["view3D/hiddenGeoItemIDs"];
        },

        facetPresets() {
            return this.$store.getters["view3D/facetPresets"];
        },

        facetPresetNames() {
            return Object.keys(this.facetPresets).sort((lhs, rhs) => lhs.localeCompare(rhs));
        },

        activeFacetPresetName() {
            return this.$store.getters["view3D/activeFacetPresetName"];
        },

        activeFacets() {
            return this.$store.getters["view3D/activeFacetPreset"]?.facets ?? [];
        },

        sceneHoveredGeoItemIDs() {
            return this.$store.getters["view3D/sceneHoveredGeoItemIDs"];
        },

        availableItems() {
            return Object.entries(this.geoData).flatMap(
                ([sourceID, source]) => (source.geometry ?? []).map(geometry => ({
                    id: `${geometry._name}@${sourceID}`,
                    label: geometry._name,
                    source: sourceID,
                    facets: geometry._facets ?? geometry._classifiers ?? {},
                    geometryType: geometry._type ?? "unknown"
                }))
            );
        },

        allFacetNames() {
            return [
                ...new Set(this.availableItems.flatMap(item => Object.keys(item.facets)))
            ].sort();
        },

        inactiveFacets() {
            const active = new Set(this.activeFacets);

            return this.allFacetNames.filter(facet => !active.has(facet));
        },

        filteredItems() {
            if (this.sceneHoveredGeoItemIDs.size === 0)
                return this.textFilteredItems;

            return this.textFilteredItems.filter(item => this.sceneHoveredGeoItemIDs.has(item.id));
        },

        textFilteredItems() {
            const query = this.query.trim().toLowerCase();

            if (!query)
                return this.availableItems;

            return this.availableItems.filter(item => {
                if (item.label.toLowerCase().includes(query))
                    return true;

                if (item.source.toLowerCase().includes(query))
                    return true;

                return Object.entries(item.facets).some(
                    ([name, value]) =>
                        name.toLowerCase().includes(query) ||
                        String(value).toLowerCase().includes(query)
                );
            });
        },

        filteredItemIDs() {
            return this.filteredItems.map(item => item.id);
        },

        tree() {
            return build_facet_tree(this.filteredItems, this.activeFacets);
        },

        allGroupKeys() {
            return collect_group_keys(this.tree);
        },

        effectiveExpandedGroupKeys() {
            const result = new Set(this.expandedGroupKeys);
            // Temporarily reveal the complete path to every highlighted item.
            for (const key of this.sceneHoverExpandedGroupKeys)
                result.add(key);
            // Search similarly expands all currently matching branches, without
            // altering the persistent expansion state.
            if (this.query.trim()) {
                for (const key of this.allGroupKeys)
                    result.add(key);
            }

            return result;
        },

        sceneHoverExpandedGroupKeys() {
            return collect_highlighted_group_keys(this.tree, this.sceneHoveredGeoItemIDs);
        },

        //
        // Selection sets

        selectionSets() {
            return this.$store.getters["view3D/selectionSets"];
        },

        selectionSetNames() {
            return Object.keys(this.selectionSets).sort((lhs, rhs) => lhs.localeCompare(rhs));
        },

        activeSelectionSetName() {
            return this.$store.getters["view3D/activeSelectionSetName"];
        },

        selectedMarkers() {
            return this.$store.getters["view3D/selectedMarkers"];
        },

        selectedMarkerCount() {
            let count = 0;

            for (const indices of this.selectedMarkers.values())
                count += indices.size;

            return count;
        },

        activeSelectionSet() {
            return this.$store.getters["view3D/activeSelectionSet"];
        },

        selectionHasUnsavedChanges() {
            if (!this.activeSelectionSetName) {
                return (
                    this.selectedGeoItemIDs.size !== 0 ||
                    this.selectedMarkerCount !== 0
                );
            }

            return !this.selection_equals_saved_set(this.activeSelectionSet);
        }
    },  // computed

    watch: {
        activeFacetPresetName() {
            // Group keys depend on the active hierarchy.
            this.expand_all();
        }
    },

    mounted() {
        this.expand_all();
    },

    methods: {
        toggle_group(key) {
            const next = new Set(this.expandedGroupKeys);

            if (next.has(key))
                next.delete(key);
            else
                next.add(key);

            this.expandedGroupKeys = next;
        },

        expand_all() {
            this.expandedGroupKeys = new Set(this.allGroupKeys);
        },

        collapse_all() {
            this.expandedGroupKeys = new Set();
        },

        toggle_item_selection(id) {
            if (this.selectedGeoItemIDs.has(id))
                this.$store.commit("view3D/unselect_geo_items", [id]);
            else
                this.$store.commit("view3D/select_geo_items", [id]);
        },

        select_all() {
            this.select_items(this.filteredItemIDs);
        },

        invert_selection() {
            this.invert_items_selection(this.filteredItemIDs);
        },

        hover_item(ids) {
            this.$store.commit("view3D/set_tree_hover_geo_items", ids);
        },

        unhover_item() {
            this.$store.commit("view3D/clear_tree_hover_geo_items");
        },

        set_visibility({ ids, visible }) {
            this.$store.commit("view3D/set_geo_items_visibility", {
                ids,
                visible
            });
        },

        activate_preset(name) {
            this.$store.commit("view3D/activate_facet_preset", name);
        },

        set_active_facets(facets) {
            this.$store.commit("view3D/set_active_facet_preset_facets", facets);
        },

        save_preset(name) {
            this.$store.commit("view3D/save_facet_preset", {
                name,
                facets: this.activeFacets
            });
        },

        update_preset() {
            this.$store.commit("view3D/save_facet_preset", {
                name: this.activeFacetPresetName,
                facets: this.activeFacets
            });
        },

        delete_preset(name) {
            this.$store.commit("view3D/delete_facet_preset", name);
        },

        select_items(ids) {
            this.$store.commit("view3D/select_geo_items", ids);
        },

        invert_items_selection(ids) {
            const toSelect = [];
            const toUnselect = [];

            for (const id of ids) {
                if (this.selectedGeoItemIDs.has(id))
                    toUnselect.push(id);
                else
                    toSelect.push(id);
            }

            if (toUnselect.length)
                this.$store.commit("view3D/unselect_geo_items", toUnselect);

            if (toSelect.length)
                this.$store.commit("view3D/select_geo_items", toSelect);
        },

        clear_selection() {
            this.$store.commit("view3D/unselect_geo_items", [...this.selectedGeoItemIDs]);
        },

        clear_items_selection(ids) {
            this.$store.commit("view3D/unselect_geo_items", ids);
        },

        show_selected() {
            if (this.selectedGeoItemIDs.size === 0)
                return;

            this.set_visibility({
                ids: [...this.selectedGeoItemIDs],
                visible: true
            });
        },

        hide_selected() {
            if (this.selectedGeoItemIDs.size === 0)
                return;

            this.set_visibility({
                ids: [...this.selectedGeoItemIDs],
                visible: false
            });
        },

        //
        // Selection sets
        activate_selection_set(name) {
            this.$store.commit("view3D/activate_selection_set", name);
        },

        save_selection_set(name) {
            this.$store.commit("view3D/save_selection_set", name);
        },

        update_selection_set() {
            this.$store.commit("view3D/update_active_selection_set");
        },

        delete_selection_set(name) {
            this.$store.commit("view3D/delete_selection_set", name);
        },

        apply_selection_set(payload) {
            this.$store.commit("view3D/apply_selection_set", payload);
        },

        selection_equals_saved_set(saved) {
            if (!saved)
                return false;

            const savedGeoIDs = new Set(saved.geoItemIDs ?? []);

            if (savedGeoIDs.size !== this.selectedGeoItemIDs.size)
                return false;

            for (const id of this.selectedGeoItemIDs) {
                if (!savedGeoIDs.has(id))
                    return false;
            }

            const savedMarkers = saved.markers ?? {};

            const currentMarkerGeoIDs = [...this.selectedMarkers.entries()]
                .filter(([, indices]) => indices.size !== 0)
                .map(([geoID]) => geoID);

            const savedMarkerGeoIDs = Object.keys(savedMarkers)
                .filter(geoID => savedMarkers[geoID].length !== 0);

            if (currentMarkerGeoIDs.length !== savedMarkerGeoIDs.length)
                return false;

            for (const [geoID, indices] of this.selectedMarkers) {
                if (indices.size === 0)
                    continue;

                const savedIndices = new Set(savedMarkers[geoID] ?? []);

                if (savedIndices.size !== indices.size)
                    return false;

                for (const index of indices) {
                    if (!savedIndices.has(index))
                        return false;
                }
            }

            return true;
        }
    }  // methods
};
</script>

<style scoped>
.items-tree-widget {
  display: grid;
  gap: 0.5rem;
  min-width: 0;
  padding-top: 8pt;
}

.tree-toolbar {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 0.4rem;
}

.tree-toolbar input {
  min-width: 0;
}

.tree-actions {
  display: flex;
  align-items: center;
  gap: 0.2rem;
}

.tree-actions button {
  display: inline-grid;
  place-items: center;

  width: 1.8rem;
  height: 1.8rem;
  padding: 0;

  border: 1px solid var(--clr-border-inactive);
  background: var(--clr-bg-options);
  color: var(--clr-fg-options);
  cursor: pointer;
}

.tree-actions button:hover {
  background: var(--clr-bg-highlight2);
  color: var(--clr-fg-highlight2);
}

.toolbar-separator {
  align-self: stretch;
  width: 1px;
  margin: 0 0.15rem;
  background: var(--clr-border-inactive);
}

/*
 * The tree occupies no more than 50 viewport-height units, but remains useful
 * in short windows. Adjust these values to match the surrounding navigation
 * panel.
 */
.tree-scroll-area {
  min-height: 6rem;
  max-height: min(50vh, 32rem);
  overflow-y: auto;
  overflow-x: hidden;

  border: 1px solid var(--clr-border-inactive);
  background: var(--clr-bg-options);

  scrollbar-gutter: stable;
}

.items-tree {
  margin: 0;
  padding: 0.25rem 0;
  list-style: none;
}

.empty-message {
  margin: 0;
  padding: 0.75rem;
  color: var(--clr-fg-main-muted);
  font-style: italic;
}

.group-action-button:disabled,
.tree-actions button:disabled {
    opacity: .35;
    cursor: default;
}
</style>

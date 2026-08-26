// Generic per-context item-selection state (doc/ui-session.rst's
// "Selection model") -- registered under the fixed contextStoreModules key
// `selection` by any contextual module that wants item highlighting/
// selection (see modules/three-view/index.js). store/modules/contexts.js
// installs this module's facet-preset/selection-set persistence
// generically, by checking for that key rather than any one module's name.
//
// Field-name-neutral (`selectedItemIDs`, `selectedSubItems`, ...), unlike
// three-view's own view3D.js, which keeps its geometry-specific state
// (loaded geometry cache, raycast-hover behavior) separately -- see
// doc/ui-session.rst's "Selection model" for what stayed there and why.
import {
    normalize_selection_asset,
    serialize_selection,
    union_selections,
    subtract_selections,
    intersect_selections
} from './selectionAlgebra.js';

const DEFAULT_FACET_PRESETS = {
    "Source and transf.groups": {
        facets: [
            "dataSource",
            "transf.group"
        ]
    }
    // ... other default grouping?
};

function normalize_ids(ids) {
    if(ids === undefined || ids === null) return [];
    return Array.isArray(ids) ? ids : [ids];
}

function clone_presets(presets) {
    return Object.fromEntries(
        Object.entries(presets).map(([name, preset]) => [
            name,
            {facets: [...(preset.facets ?? [])]}
        ])
    );
}

function current_selection(state) {
    return {
        itemIDs: state.selectedItemIDs,
        subItems: state.selectedSubItems
    };
}

function assign_selection(state, selection) {
    state.selectedItemIDs = new Set(selection.itemIDs);
    state.selectedSubItems = new Map(
        [...selection.subItems].map(([itemID, indices]) => [itemID, new Set(indices)])
    );
}

// Vuex state module -- a factory, not a singleton object, since one
// instance is registered per context (see store/modules/contexts.js).
export function make_selection_module() {
    return {
    namespaced: true,
    state: () => ({
        selectedItemIDs: new Set(),  // selected whole-item IDs
        selectedSubItems: new Map(), // itemID -> Set(sub-item indices)
        hiddenItemIDs: new Set(),

        // Hover, unioned from possibly several origins (doc/ui-session
        // .rst's "Selection model") -- e.g. three-view's own tree-row-hover
        // ('tree') and scene-raycast-hover ('scene'), unioned into one
        // highlighted set by the `highlightedItemIDs` getter below. Keyed
        // by origin from the start even where a module supplies only one.
        hoveredByOrigin: new Map(), // origin -> Set(item IDs)

        // Behavior toggle common to any "graphical depiction" module
        // (three-view, the plotter, a future graph/block-diagram module):
        // when on, hovering highlights (and shift+click selects) every
        // pickable item under the cursor at once; when off (the default --
        // one item highlighted per hover is the more common case, "all
        // under cursor" is the opt-in special case), only one item at a
        // time, shift+wheel cycling through the rest. Exposed by
        // three-view's SceneHelpers.vue and the plotter's
        // PlotHelpersPanel.vue.
        highlightAllUnderCursor: false,

        facetPresets: clone_presets(DEFAULT_FACET_PRESETS),
        activeFacetPresetName: "Source and transf.groups",

        selectionSets: {},
        activeSelectionSetName: null
    }),
    mutations: {
        //
        // Selection {{{

        select_items(state, ids) {
            const next = new Set(state.selectedItemIDs);
            if(typeof ids === "string") {
                next.add(ids);
            } else {
                for(const id of ids) next.add(id);
            }
            state.selectedItemIDs = next;
        },

        unselect_items(state, ids) {
            const next = new Set(state.selectedItemIDs);
            if(typeof ids === "string") {
                next.delete(ids);
            } else {
                for(const id of ids) next.delete(id);
            }
            state.selectedItemIDs = next;
        },

        select_sub_items(state, {itemID, indices}) {
            const next = new Map(state.selectedSubItems);
            next.set(itemID, new Set(indices));
            state.selectedSubItems = next;
        },

        clear_selected_sub_items(state, itemID = null) {
            const next = new Map(state.selectedSubItems);
            if(itemID === null) next.clear();
            else next.delete(itemID);
            state.selectedSubItems = next;
        },

        clear_selection(state) {
            state.selectedItemIDs = new Set();
            state.selectedSubItems = new Map();
        },
        // }}}

        //
        // Visibility {{{

        set_items_visibility(state, {ids, visible}) {
            const next = new Set(state.hiddenItemIDs);
            for(const id of normalize_ids(ids)) {
                if(visible) next.delete(id);
                else next.add(id);
            }
            state.hiddenItemIDs = next;
        },
        // }}}

        //
        // Hover {{{

        set_hover(state, {origin, ids}) {
            const next = new Map(state.hoveredByOrigin);
            next.set(origin, new Set(normalize_ids(ids)));
            state.hoveredByOrigin = next;
        },

        clear_hover(state, origin = null) {
            const next = new Map(state.hoveredByOrigin);
            if(origin === null) next.clear();
            else next.delete(origin);
            state.hoveredByOrigin = next;
        },
        // }}}

        //
        // Behavior {{{

        toggle_highlight_all_under_cursor(state, value) {
            state.highlightAllUnderCursor = value;
        },
        // }}}

        //
        // Facets  {{{

        initialize_facet_presets(state, {presets, activePresetName}) {
            const normalized = clone_presets(
                presets && Object.keys(presets).length ? presets : DEFAULT_FACET_PRESETS
            );
            state.facetPresets = normalized;
            if(activePresetName && Object.hasOwn(normalized, activePresetName))
                state.activeFacetPresetName = activePresetName;
            else
                state.activeFacetPresetName = Object.keys(normalized)[0];
        },

        activate_facet_preset(state, name) {
            if(Object.hasOwn(state.facetPresets, name))
                state.activeFacetPresetName = name;
        },

        set_active_facet_preset_facets(state, facets) {
            const name = state.activeFacetPresetName;
            if(!name) return;
            state.facetPresets = {
                ...state.facetPresets,
                [name]: {facets: [...new Set(facets)]}
            };
        },

        save_facet_preset(state, {name, facets}) {
            const trimmedName = name.trim();
            if(!trimmedName) return;

            state.facetPresets = {
                ...state.facetPresets,
                [trimmedName]: {facets: [...new Set(facets)]}
            };

            state.activeFacetPresetName = trimmedName;
        },

        delete_facet_preset(state, name) {
            const names = Object.keys(state.facetPresets);
            if(names.length <= 1 || !Object.hasOwn(state.facetPresets, name)) return;

            const next = {...state.facetPresets};
            delete next[name];
            state.facetPresets = next;

            if(state.activeFacetPresetName === name)
                state.activeFacetPresetName = Object.keys(next)[0];
        },
        // }}}

        //
        // Selection sets {{{
        initialize_selection_sets(state, {sets, activeSetName}) {
            state.selectionSets = sets && typeof sets === "object" ? structuredClone(sets) : {};
            state.activeSelectionSetName =
                activeSetName && Object.hasOwn(state.selectionSets, activeSetName)
                    ? activeSetName
                    : null;
        },

        activate_selection_set(state, name) {
            if(name === null || name === "") {
                state.activeSelectionSetName = null;
                return;
            }
            if(Object.hasOwn(state.selectionSets, name))
                state.activeSelectionSetName = name;
        },

        save_selection_set(state, name) {
            const trimmedName = name.trim();
            if(!trimmedName) return;
            state.selectionSets = {
                ...state.selectionSets,
                [trimmedName]: serialize_selection(current_selection(state))
            };
            state.activeSelectionSetName = trimmedName;
        },

        update_active_selection_set(state) {
            const name = state.activeSelectionSetName;
            if(!name) return;
            state.selectionSets = {
                ...state.selectionSets,
                [name]: serialize_selection(current_selection(state))
            };
        },

        delete_selection_set(state, name) {
            if(!Object.hasOwn(state.selectionSets, name)) return;
            const next = {...state.selectionSets};
            delete next[name];
            state.selectionSets = next;

            if(state.activeSelectionSetName === name)
                state.activeSelectionSetName = null;
        },

        apply_selection_set(state, {name, operation}) {
            const serialized = state.selectionSets[name];
            if(!serialized) return;
            const current = current_selection(state);
            const saved = normalize_selection_asset(serialized);
            let result;
            switch(operation) {
                case "replace":
                    result = saved;
                    break;
                case "union":
                    result = union_selections(current, saved);
                    break;
                case "subtract-saved":
                    result = subtract_selections(current, saved);
                    break;
                case "intersection":
                    result = intersect_selections(current, saved);
                    break;
                case "saved-minus-current":
                    result = subtract_selections(saved, current);
                    break;
                default:
                    console.warn(`Unknown selection-set operation "${operation}"`);
                    return;
            }
            assign_selection(state, result);
        }
        // }}}
    },  // mutations
    actions: {
        // ...
    },
    getters: {
        selectedItemIDs: state => state.selectedItemIDs,
        selectedSubItems: state => state.selectedSubItems,

        hiddenItemIDs: state => state.hiddenItemIDs,

        //
        // Hover
        hoveredIDs: state => origin => state.hoveredByOrigin.get(origin) ?? new Set(),

        highlightedItemIDs: state =>
            new Set([...state.hoveredByOrigin.values()].flatMap(ids => [...ids])),

        //
        // Behavior
        highlightAllUnderCursor: state => state.highlightAllUnderCursor,

        facetPresets: state => state.facetPresets,

        activeFacetPresetName: state => state.activeFacetPresetName,

        activeFacetPreset: state => state.facetPresets[state.activeFacetPresetName] ?? {facets: []},

        //
        // Selection sets
        selectionSets: state => state.selectionSets,
        activeSelectionSetName: state => state.activeSelectionSetName,

        activeSelectionSet: state => {
            const name = state.activeSelectionSetName;
            return name ? state.selectionSets[name] ?? null : null;
        }

    }  // getters
    };  // selection module
}

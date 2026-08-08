import * as THREE from 'three';
import {
    normalize_selection_asset,
    serialize_selection,
    union_selections,
    subtract_selections,
    intersect_selections
} from "./selectionSets.js";

//                  * * *   * * *   * * *
// Helpers (not state getters -- not computed or cached by themselves)

const DEFAULT_FACET_PRESETS = {
    "Source and transf.groups": {
        facets: [
            "source",
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
        geoItemIDs: state.selectedGeoItemIDs,
        markers: state.selectedMarkers
    };
}

function assign_selection(state, selection) {
    state.selectedGeoItemIDs = new Set(selection.geoItemIDs);
    state.selectedMarkers = new Map(
        [...selection.markers].map(([geoID, indices]) => [geoID, new Set(indices)])
    );
}

//                  * * *   * * *   * * *
// Vuex state module
export default {
    namespaced: true,
    state: () => ({
        geoDataBySource: {},

        // Behavior controls
        highlightHiddenSelection: true,

        // Axis-aligned bounding box for objects of interest
        regionOfInterest: [[null, null, null], [null, null, null]],
        // Global axis scales to be applied for geometrical entities as
        // multiplication factors, f_i, r_shown = f_i * r_original.
        axesScales: [1., 1., 1.],  // x, y, z

        //highlightedGeoItemIDs: new Set(),  // highlighted item IDs
        treeHoveredGeoItemIDs: new Set(),  // hovered in tree vwr
        sceneHoveredGeoItemIDs: new Set(),  // hovered on scene

        highlightedMarkers: new Map(), // geoID -> Set(point indeces)
        selectedGeoItemIDs: new Set(),  // selected item IDs
        selectedMarkers: new Map(), // geoID -> Set(point indeces)
        hiddenGeoItemIDs: new Set(),  // ... TODO?

        facetPresets: clone_presets(DEFAULT_FACET_PRESETS),
        activeFacetPresetName: "Source and transf.groups",

        selectionSets: {},
        activeSelectionSetName: null
    }),
    mutations: {
        // This mutation gets called from within the API's `add_data_source()'
        // action upon geometry is loaded or updated.
        update_geo_data(state, pl) {
            // CAVEAT: this does not seem to work:
            //state.geoDataBySource[pl.name] = pl.geoData;
            // since the watcher seem to rely on the object ID here and it is
            // not updated; one way to overcome is to rely on JSON.stringify(pl.geoData)
            // or:
            state.geoDataBySource = {
                ...state.geoDataBySource,
                [pl.name]: pl.geoData
            };
            // suceeds
            console.debug(`mutation:view3d/update_geo_data commited with data from "${pl.name}": "${pl.geoData}"`);
        },

        toggle_highlight_hidden(state, value) {
            state.highlightHiddenSelection = value;
        },

        // Updates region of interest with given point r:float[3]
        update_region_of_interest(state, rs) {
            rs.forEach(r => {
                for(let j = 0; j < 3; ++j) {
                    if(state.regionOfInterest[0][j] === null || state.regionOfInterest[0][j] > r[j])
                        state.regionOfInterest[0][j] = r[j];
                    if(state.regionOfInterest[1][j] === null || state.regionOfInterest[1][j] < r[j])
                        state.regionOfInterest[1][j] = r[j];
                }
            });
        },
        // Re-sets region of interest to null
        reset_region_of_interest(state) {
            for(let j = 0; j < 3; ++j) {
                state.regionOfInterest[0][j] = null;
                state.regionOfInterest[1][j] = null;
            }
        },
        // Change the scales
        change_axis_scale(state, pl) {
            const nIdx = {'x': 0, 'y': 1, 'z': 2}[pl['var']];
            state.axesScales[nIdx] = pl.v;
        },

        //
        // Highlighting {{{

        set_tree_hover_geo_items(state, ids) {
            state.treeHoveredGeoItemIDs = new Set(normalize_ids(ids));
        },

        clear_tree_hover_geo_items(state) {
            state.treeHoveredGeoItemIDs = new Set();
        },

        set_scene_hover_geo_items(state, ids) {
            state.sceneHoveredGeoItemIDs = new Set(normalize_ids(ids));
        },

        clear_scene_hover_geo_items(state) {
            state.sceneHoveredGeoItemIDs = new Set();
        },

        highlight_markers(state, {geoID, indices}) {
            const next = new Map(state.highlightedMarkers);
            next.set(geoID, new Set(indices));
            state.highlightedMarkers = next;
        },

        set_highlighted_markers(state, markersByGeoID) {
            state.highlightedMarkers = new Map(
                [...markersByGeoID.entries()].map(([geoID, indices]) => [geoID, new Set(indices)])
            );
        },

        clear_highlighted_markers(state, geoID = null) {
            const next = new Map(state.highlightedMarkers);
            if(geoID === null) next.clear();
            else next.delete(geoID);
            state.highlightedMarkers = next;
        },
        // }}}

        //
        // Selection (basic) {{{

        select_geo_items(state, ids) {
            const next = new Set(state.selectedGeoItemIDs);
            if(typeof ids === "string") {
                next.add(ids);
            } else {
                for(const id of ids) next.add(id);
            }
            state.selectedGeoItemIDs = next;
        },

        unselect_geo_items(state, ids) {
            const next = new Set(state.selectedGeoItemIDs);
            if(typeof ids === "string") {
                next.delete(ids);
            } else {
                for(const id of ids) next.delete(id);
            }
            state.selectedGeoItemIDs = next;
        },

        select_markers(state, {geoID, indices}) {
            const next = new Map(state.selectedMarkers);
            next.set(geoID, new Set(indices));
            state.selectedMarkers = next;
        },

        clear_selected_markers(state, geoID = null) {
            const next = new Map(state.selectedMarkers);
            if(geoID === null) next.clear();
            else next.delete(geoID);
            state.selectedMarkers = next;
        },

        clear_geo_items_selection(state) {
            state.selectedGeoItemIDs = new Set();
            state.selectedMarkers = new Map();
        },
        // }}}

        //
        // Visibility {{{

        set_geo_items_visibility(state, {ids, visible}) {
            const next = new Set(state.hiddenGeoItemIDs);
            for(const id of normalize_ids(ids)) {
                if(visible) next.delete(id);
                else next.add(id);
            }
            state.hiddenGeoItemIDs = next;
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
        // See CAVEAT at update_geo_data() mutation; return JSON.stringify(state.geoDataBySource);
        geoData: state => Object.fromEntries(
            Object.entries(state.geoDataBySource).map(([key, pl]) => [key, pl.geometryData])
        ),

        highlightHiddenSelection: state => state.highlightHiddenSelection,

        treeHoveredGeoItemIDs: state => state.treeHoveredGeoItemIDs,

        sceneHoveredGeoItemIDs: state => state.sceneHoveredGeoItemIDs,

        highlightedGeoItemIDs: state =>
            new Set([...state.treeHoveredGeoItemIDs, ...state.sceneHoveredGeoItemIDs]),

        highlightedMarkers: state => state.highlightedMarkers,

        selectedGeoItemIDs: state => state.selectedGeoItemIDs,
        selectedMarkers: state => state.selectedMarkers,

        hiddenGeoItemIDs: state => state.hiddenGeoItemIDs,
        facetPresets: state => state.facetPresets,

        activeFacetPresetName: state => state.activeFacetPresetName,

        activeFacetPreset: state => state.facetPresets[state.activeFacetPresetName] ?? {facets: []},

        // Returns current global transformation (for viewing objects)
        transformationMatrix(state) {
            const m = new THREE.Matrix3();
            m.set( state.axesScales[0], 0, 0
                 , 0, state.axesScales[1], 0
                 , 0, 0, state.axesScales[2]
                 );
            return m;
        },
        // Axis-aligned bounding box for current region of interest
        aabb(state) {
            if(state.regionOfInterest.flat().some(v => v === null || Number.isNaN(v)))
                return [Array(3).fill(new THREE.Vector3(NaN, NaN, NaN))];

            const mins = new THREE.Vector3( state.regionOfInterest[0][0]
                                           , state.regionOfInterest[0][1]
                                           , state.regionOfInterest[0][2]
                                           );
            const maxs = new THREE.Vector3( state.regionOfInterest[1][0]
                                           , state.regionOfInterest[1][1]
                                           , state.regionOfInterest[1][2]
                                           );
            const c = mins.clone();
            c.add(maxs).divideScalar(2.);
            return [mins, maxs, c];
        },

        //highlightedMarkersList: state =>
        //    [...state.highlightedMarkers.entries()].map(([geoID, indices]) => ({
        //        geoID,
        //        indices: [...indices],
        //        })),

        //
        // Selection sets
        selectionSets: state => state.selectionSets,
        activeSelectionSetName: state => state.activeSelectionSetName,

        activeSelectionSet: state => {
            const name = state.activeSelectionSetName;
            return name ? state.selectionSets[name] ?? null : null;
        }

    }  // getters
};  // view3D module

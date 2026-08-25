// Vuex state module -- a factory, not a singleton object, since one
// instance is registered per context (see store/modules/contexts.js, which
// passes this context's own id as `contextId`).
//
// Holds this module's own domain-specific state only: marker-level
// (sub-item) hover, which stays here since it has only one origin (scene
// raycast) and doesn't fit the generic "several origins, unioned" hover
// shape. Whole-item hover, the highlightAllUnderCursor behavior toggle,
// selection, hidden items, facet presets, and selection sets used to live
// here too; they've moved to the generic `selection` context module
// (store/selection.js), registered alongside this one (modules/three-view/
// index.js) -- see doc/ui-session.rst's "Selection model" for what moved
// and why. The loaded geometry cache itself used to live here too (a copy
// pushed in by connection.js's apply_resource_data); doc/data-model.rst's
// "Resolution is always live, never copied" retired that -- `geoData`
// below now reads straight from connection.js's own `resources`, which
// keeps each resource's last-fetched raw payload on the resource record
// itself.
import { with_data_source_facet, matches_facets_selector } from '@/store/facets';

export function make_view3D_module(contextId) {
    // A geo3d source's raw fetched body is shaped `{geometryData:
    // {materials, geometry}, ...}` (mirrors the old payload()'s `pl.geoData`
    // -> `pl.geometryData` unwrap in the `geoData` getter below). Every
    // geometry item gets a `dataSource` facet merged into its own `_facets`
    // (store/facets.js) -- doc/module-3d-viewer.rst's per-item convention,
    // now guaranteed present regardless of whether the source itself
    // declares any facets at all -- then the resource's own facetsSelector,
    // if any, narrows the list down (doc/data-model.rst's "One input
    // concept per scope, not two" -- a source link's membership rule, same
    // as a sink link's).
    function extract_geo_data(rawData, resourceName, facetsSelector) {
        const data = rawData?.geometryData ?? null;
        if(!data) return data;
        return {
            ...data,
            geometry: (data.geometry ?? [])
                .map(item => with_data_source_facet(item, resourceName))
                .filter(item => matches_facets_selector(item._facets, facetsSelector))
        };
    }

    return {
    namespaced: true,
    state: () => ({
        // Behavior control -- specific to how a hidden-but-selected item's
        // overlay renders in this module's own silhouette pass, unlike
        // highlightAllUnderCursor (moved to the generic `selection` module,
        // above) which governs pointer/hover semantics any graphical
        // module shares.
        highlightHiddenSelection: false,

        highlightedMarkers: new Map() // geoID -> Set(point indeces)
    }),
    mutations: {
        toggle_highlight_hidden(state, value) {
            state.highlightHiddenSelection = value;
        },

        //
        // Marker (sub-item) hover {{{

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
        }
        // }}}
    },  // mutations
    actions: {
        // ...
    },
    getters: {
        // Live view over connection.js's own resources -- every geo3d
        // source currently attached to this context, keyed by resource
        // name, shaped the way GeometryManager.js/ItemsTree.vue/
        // SelectedMarkersPanel.vue already expect ({materials, geometry}).
        geoData: (state, getters, rootState) => Object.fromEntries(
            Object.values(rootState.connection.resources)
                .filter(r => r.contextId === contextId && r.type === 'geo3d' && r.data != null)
                .map(r => [r.name, extract_geo_data(r.data, r.name, r.facetsSelector)])
        ),

        highlightHiddenSelection: state => state.highlightHiddenSelection,

        highlightedMarkers: state => state.highlightedMarkers
    }  // getters
    };  // view3D module
}

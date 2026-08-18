// Vuex state module -- a factory, not a singleton object, since one
// instance is registered per context (see store/modules/contexts.js).
//
// Holds this module's own domain-specific state only: the loaded geometry
// cache and marker-level (sub-item) hover, which stays here since it has
// only one origin (scene raycast) and doesn't fit the generic "several
// origins, unioned" hover shape. Whole-item hover, the
// highlightAllUnderCursor behavior toggle, selection, hidden items, facet
// presets, and selection sets used to live here too; they've moved to the
// generic `selection` context module (store/selection.js), registered
// alongside this one (modules/three-view/index.js) -- see doc/ui-session
// .rst's "Selection model" for what moved and why.
export function make_view3D_module() {
    return {
    namespaced: true,
    state: () => ({
        geoDataBySource: {},

        // Behavior control -- specific to how a hidden-but-selected item's
        // overlay renders in this module's own silhouette pass, unlike
        // highlightAllUnderCursor (moved to the generic `selection` module,
        // above) which governs pointer/hover semantics any graphical
        // module shares.
        highlightHiddenSelection: false,

        highlightedMarkers: new Map() // geoID -> Set(point indeces)
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

        // Drops a source's geometry -- used when a source is removed or
        // reassigned to a different context/scene (see SourceListItem.vue),
        // so its data doesn't linger in a context it no longer belongs to.
        remove_geo_data(state, sourceName) {
            if(!Object.hasOwn(state.geoDataBySource, sourceName)) return;
            const geoDataBySource = {...state.geoDataBySource};
            delete geoDataBySource[sourceName];
            state.geoDataBySource = geoDataBySource;
        },

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
        // See CAVEAT at update_geo_data() mutation; return JSON.stringify(state.geoDataBySource);
        geoData: state => Object.fromEntries(
            Object.entries(state.geoDataBySource).map(([key, pl]) => [key, pl.geometryData])
        ),

        highlightHiddenSelection: state => state.highlightHiddenSelection,

        highlightedMarkers: state => state.highlightedMarkers
    }  // getters
    };  // view3D module
}

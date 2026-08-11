// A state module maintaining named "transformation groups".
//
// Groups are *discovered* from loaded geometry rather than created by hand:
// as GeometryManager parses each geo item's `_transfGroup` reference, it
// commits `ensure_group` for the referenced name so it shows up here (and
// in the TransfGroupsPanel.vue editor) at an identity transform. Names are
// shared across every data source within one context (scene) -- unlike
// individual geo item definitions, which are scoped per source -- but not
// across contexts: each context gets its own instance of this module (see
// store/modules/contexts.js), so two scenes both referencing a group named
// "main" do not affect each other.

//                      * * *   * * *   * * *

function identity_group() {
    return {
        position: [0, 0, 0],
        rotation: [0, 0, 0],  // degrees, Euler XYZ
        scale: [1, 1, 1]
    };
}

function copy_vec3(value, fallback) {
    if(!Array.isArray(value) || value.length !== 3) return [...fallback];
    return [Number(value[0]), Number(value[1]), Number(value[2])];
}

//                      * * *   * * *   * * *

// A factory, not a singleton object, since one instance is registered per
// context (see store/modules/contexts.js).
export function make_transf_groups_module() {
    return {
    namespaced: true,

    state: () => ({
        // {<name:str>: {position:[x,y,z], rotation:[x,y,z] (deg), scale:[x,y,z]}}
        groups: {}
    }),

    getters: {
        groupNames: state => Object.keys(state.groups),
        group: state => name => state.groups[name] ?? null,
        groups: state => state.groups
    },

    mutations: {
        // Registers a group by name if not already known, at an identity
        // transform. Called as geometry referencing the group is loaded;
        // a no-op if the name is already known.
        ensure_group(state, name) {
            if(!Object.hasOwn(state.groups, name))
                state.groups[name] = identity_group();
        },

        // Updates a known group by name (with patch object); a no-op for an
        // unknown name.
        patch_group(state, {name, patch}) {
            const group = state.groups[name];
            if(!group) return;
            if(patch.position !== undefined) group.position = copy_vec3(patch.position, group.position);
            if(patch.rotation !== undefined) group.rotation = copy_vec3(patch.rotation, group.rotation);
            if(patch.scale !== undefined)    group.scale    = copy_vec3(patch.scale, group.scale);
        },

        // Resets a known group to identity; a no-op for an unknown name.
        reset_group(state, name) {
            if(Object.hasOwn(state.groups, name))
                state.groups[name] = identity_group();
        }
    }
    };
}

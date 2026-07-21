// A state module maintaining viewer's cameras

//                      * * *   * * *   * * *

const DEFAULT_VIEWPORT_ID = 'main';

const DEFAULT_PERSPECTIVE_CAMERA = Object.freeze({
    type: 'perspective',

    position: [5000, 5000, -10000],
    target: [0, 0, 0],
    up: [0, 1, 0],

    near: 0.1,
    far: 700000,
    fov: 65,

    picking: {
        maxDistance: 1000,
        radiusPx: 6
    }
});

const DEFAULT_ORTHOGRAPHIC_CAMERA = Object.freeze({
    type: 'orthographic',

    position: [0, 0, -10000],
    target: [0, 0, 0],
    up: [0, -1, 0],

    near: 0.01,
    far: 70000,

    // Base horizontal scene extent. The effective visible width is
    // width / zoom.
    width: 10000,
    zoom: 1,

    picking: {
        radiusPx: 6
    }
});

//                      * * *   * * *   * * *

function copy_vec3(value, fallback) {
    if(!Array.isArray(value) || value.length !== 3) return [...fallback];
    return [Number(value[0]), Number(value[1]), Number(value[2])];
}


function copy_persp_cam(camera) {
    return {
        type: 'perspective',
        position: copy_vec3(
                camera.position,
                DEFAULT_PERSPECTIVE_CAMERA.position
            ),
        target: copy_vec3(
                camera.target,
                DEFAULT_PERSPECTIVE_CAMERA.target
            ),
        up: copy_vec3(
                camera.up,
                DEFAULT_PERSPECTIVE_CAMERA.up
            ),
        near: Number(camera.near),
        far: Number(camera.far),
        fov: Number(camera.fov),
        picking: {
            maxDistance: Number(
                camera.picking?.maxDistance ?? DEFAULT_PERSPECTIVE_CAMERA.picking.maxDistance
            ),
            radiusPx: Number(
                camera.picking?.radiusPx ?? DEFAULT_PERSPECTIVE_CAMERA.picking.radiusPx
            )
        }
    };
}

function copy_ortho_cam(camera) {
    return {
        type: 'orthographic',
        position: copy_vec3(
                camera.position,
                DEFAULT_ORTHOGRAPHIC_CAMERA.position
            ),
        target: copy_vec3(
                camera.target,
                DEFAULT_ORTHOGRAPHIC_CAMERA.target
            ),
        up: copy_vec3(
                camera.up,
                DEFAULT_ORTHOGRAPHIC_CAMERA.up
            ),
        near: Number(camera.near),
        far: Number(camera.far),
        width: Number(camera.width),
        zoom: Number(camera.zoom ?? 1),
        picking: {
            radiusPx: Number(
                camera.picking?.radiusPx ?? DEFAULT_ORTHOGRAPHIC_CAMERA.picking.radiusPx
            )
        }
    };
}


// Produce a detached, plain camera-preset object.
//
// This function deliberately copies each supported field rather than using
// structuredClone(), so it also accepts Vue/Vuex reactive proxies.
export function copy_camera_preset(camera) {
    if(!camera || typeof camera !== 'object')
        throw new TypeError('Camera preset must be an object.');
    switch(camera.type) {
        case 'perspective':
            return copy_persp_cam(camera);
        case 'orthographic':
            return copy_ortho_cam(camera);
        default:
            throw new Error(
                `Unsupported camera type: ${camera.type}`
            );
    }
}


export function make_default_persp_cam() {
    return copy_persp_cam( DEFAULT_PERSPECTIVE_CAMERA );
}


export function make_default_ortho_cam() {
    return copy_ortho_cam( DEFAULT_ORTHOGRAPHIC_CAMERA );
}


function mk_uniq_name(presets, requestedName) {
    const base = requestedName?.trim() || 'camera';
    if(!(base in presets)) return base;
    for(let index = 2; ; ++index) {
        const candidate = `${base}-${index}`;
        if(!(candidate in presets)) return candidate;
    }
}


function _assert_viewport(state, viewportID) {
    const viewport = state.viewports[viewportID];
    if(!viewport) throw new Error(`Unknown viewport: ${viewportID}`);
    return viewport;
}


function _assert_preset(state, name) {
    const preset = state.presets[name];
    if(!preset) throw new Error(`Unknown camera preset: ${name}`);
    return preset;
}

// Apply a shallow camera patch while preserving detached arrays and nested
// picking settings.
function apply_cam_patch(camera, patch) {
    if(patch.position !== undefined)
        camera.position = copy_vec3(
            patch.position,
            camera.position
        );

    if(patch.target !== undefined)  camera.target = copy_vec3(patch.target, camera.target);
    if(patch.up !== undefined)      camera.up = copy_vec3(patch.up, camera.up);
    if(patch.near !== undefined)    camera.near = Number(patch.near);
    if(patch.far !== undefined)     camera.far = Number(patch.far);
    if( camera.type === 'perspective' &&
        patch.fov !== undefined ) {
        camera.fov = Number(patch.fov);
    }

    if(camera.type === 'orthographic') {
        if(patch.width !== undefined)   camera.width = Number(patch.width);
        if(patch.zoom !== undefined)    camera.zoom = Number(patch.zoom);
    }

    if(patch.picking !== undefined) {
        camera.picking = {
            ...camera.picking,
            ...patch.picking
        };
    }
}

//                      * * *   * * *   * * *

export default {
    namespaced: true,

    state: () => ({
        presets: {
            persp1: make_default_persp_cam(),
            orthoXY: make_default_ortho_cam()
        },

        viewports: {
            [DEFAULT_VIEWPORT_ID]: {
                currentPreset: 'persp1',
                // Runtime viewport properties; these do not belong to a
                // camera preset.
                widthPx: 1,
                heightPx: 1,
                aspect: 1
            }
        }
    }),

    getters: {
        // returns camera preset names available at a runtime
        preset_names: state => Object.keys(state.presets),
        // by-name getter for a preset
        preset: state => name =>
            state.presets[name] ?? null,
        // preset name currently in use
        current_preset_name: state => viewportID =>
            state.viewports[viewportID]?.currentPreset ?? null,
        // by-id getter for a preset relevant for a viewer
        current_preset: state => viewportID => {
            const name = state.viewports[viewportID]?.currentPreset;
            return name
                ? state.presets[name] ?? null
                : null;
        },
        // returns viewport state
        viewport_state: state => viewportID =>
            state.viewports[viewportID] ?? null
    },

    mutations: {

        // Presets
        //

        // (re)sets a *current* named cam preset for a viewport
        set_current_preset(state, {viewportID, name}){
            const viewport = _assert_viewport(state, viewportID);
            _assert_preset(state, name);
            viewport.currentPreset = name;
        },
        // overrides preset by name (or creates new one)
        replace_preset(state, {name, settings}){
            if(!name?.trim()) throw new Error('Camera preset name must not be empty.');
            state.presets[name.trim()] = copy_camera_preset(settings);
        },
        // updates preset by name (with patch object)
        patch_preset(state, {name, patch}) {
            const camera = _assert_preset(state, name);
            apply_cam_patch(camera, patch);
        },
        // patches the preset currently active for a viewport (used to persist
        // runtime camera/controls state, e.g. after an OrbitControls drag)
        patch_working_camera(state, {viewportID, patch}) {
            const viewport = _assert_viewport(state, viewportID);
            const camera = _assert_preset(state, viewport.currentPreset);
            apply_cam_patch(camera, patch);
        },
        // removes named preset
        remove_preset(state, name) {
            delete state.presets[name];
        },

        // (Re)initializes presets and per-viewport current-preset selection
        // from persisted data (see cameraPresetPersistence.js). Invalid
        // entries are dropped rather than rejecting the whole payload, since
        // this may be untrusted data coming from local storage.
        initialize_presets(state, {presets, currentPresetByViewport}) {
            const sanitized = {};
            if(presets && typeof presets === 'object') {
                for(const [name, settings] of Object.entries(presets)) {
                    const trimmedName = name?.trim();
                    if(!trimmedName) continue;
                    try {
                        sanitized[trimmedName] = copy_camera_preset(settings);
                    } catch(error) {
                        console.warn(`Ignoring invalid stored camera preset "${name}":`, error);
                    }
                }
            }
            if(Object.keys(sanitized).length)
                state.presets = sanitized;

            if(currentPresetByViewport && typeof currentPresetByViewport === 'object') {
                for(const [viewportID, name] of Object.entries(currentPresetByViewport)) {
                    const viewport = state.viewports[viewportID];
                    if(viewport && Object.hasOwn(state.presets, name))
                        viewport.currentPreset = name;
                }
            }

            // The stored data may be stale or partial (e.g. it doesn't
            // mention every viewport, or presets were replaced wholesale
            // above) -- make sure no viewport is left pointing at a preset
            // that no longer exists, or camera (re)creation would silently
            // stall on it.
            const fallbackName = Object.keys(state.presets)[0];
            for(const viewport of Object.values(state.viewports)) {
                if(!Object.hasOwn(state.presets, viewport.currentPreset))
                    viewport.currentPreset = fallbackName;
            }
        },

        // Viewports
        //

        // updates viewport size
        resize_viewport(state, {viewportID, widthPx, heightPx}) {
            const viewport = _assert_viewport(state, viewportID);
            const width = Math.max(1, Number(widthPx) || 1);
            const height = Math.max(1, Number(heightPx) || 1);
            viewport.widthPx = width;
            viewport.heightPx = height;
            viewport.aspect = width / height;
        }
    },

    actions: {
        // switch preset (to a named one) at the (named) viewport
        select_preset({commit}, {viewportID, name}) {
            commit('set_current_preset', {viewportID, name});
        },

        // creates new perspective view and makes it active for a viewport
        create_persp_view({state, commit},
                { viewportID, requestedName = 'perspective' } ) {
            const name = mk_uniq_name(state.presets, requestedName);
            commit('replace_preset', {name, settings: make_default_persp_cam()});
            commit('set_current_preset', {viewportID, name});
            return name;
        },

        // creates new orthographic view and makes it active for a viewport
        create_ortho_view({state, commit},
                {viewportID, requestedName = 'orthographic'} ) {
            const name = mk_uniq_name(state.presets, requestedName);
            commit('replace_preset',
                {name, settings: make_default_ortho_cam()});
            commit('set_current_preset', {viewportID, name });
            return name;
        },

        // XXX, not sure we gonna need these... :

        save_current_as({state, commit}, {viewportID, name} ) {
            const viewport = _assert_viewport(state, viewportID);
            const source = _assert_preset(state, viewport.currentPreset);
            const destinationName = name?.trim();
            if(!destinationName)
                throw new Error('Camera preset name must not be empty.');
            // copy_camera_preset() accepts Vue proxies and creates a detached
            // plain object. An existing preset with the same name is
            // intentionally overwritten.
            commit('replace_preset', { name: destinationName, settings: source });
            commit('set_current_preset', { viewportID, name: destinationName });
            return destinationName;
        },

        reset_current({state, commit}, {viewportID}) {
            const viewport = _assert_viewport(state, viewportID);
            const current = _assert_preset(state, viewport.currentPreset);
            const settings =
                current.type === 'orthographic'
                    ? make_default_ortho_cam()
                    : make_default_persp_cam();
            commit('replace_preset', {
                name: viewport.currentPreset,
                settings
            });
        },

        remove_current({state, commit}, {viewportID}) {
            const viewport = _assert_viewport(state, viewportID);
            const names = Object.keys(state.presets);
            if(names.length <= 1) return false;
            const currentName = viewport.currentPreset;
            const currentIndex = names.indexOf(currentName);
            const replacementName =
                names[currentIndex + 1] ??
                names[currentIndex - 1];
            // Switch first to prevent viewport referring to a missing preset
            commit('set_current_preset', { viewportID, name: replacementName});
            commit('remove_preset', currentName);
            return true;
        }
    }
};

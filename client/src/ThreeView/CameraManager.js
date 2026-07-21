import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';

//                  * * *   * * *   * * *
function configure_perspective_controls(controls) {
    controls.enableRotate = true;
    controls.enablePan = true;
    controls.enableZoom = true;

    controls.screenSpacePanning = true;
    controls.zoomToCursor = true;

    controls.rotateSpeed = 0.8;
    controls.panSpeed = 0.8;
    controls.zoomSpeed = 1.0;
    controls.keyPanSpeed = 12;

    controls.minDistance = 0.001;
    controls.maxDistance = Infinity;

    controls.mouseButtons = {
        LEFT: THREE.MOUSE.ROTATE,
        MIDDLE: THREE.MOUSE.PAN,
        RIGHT: THREE.MOUSE.DOLLY
    };

    controls.keys = {
        LEFT: 'ArrowLeft',
        UP: 'ArrowUp',
        RIGHT: 'ArrowRight',
        BOTTOM: 'ArrowDown'
    };
}

function configure_orthographic_controls(controls) {
    controls.enableRotate = true;
    controls.enablePan = true;
    controls.enableZoom = true;

    controls.screenSpacePanning = true;
    controls.zoomToCursor = true;

    controls.rotateSpeed = 0.6;
    controls.panSpeed = 1.0;
    controls.zoomSpeed = 1.0;
    controls.keyPanSpeed = 12;

    controls.minZoom = 1e-6;
    controls.maxZoom = 1e6;

    controls.mouseButtons = {
        LEFT: THREE.MOUSE.PAN,
        MIDDLE: THREE.MOUSE.DOLLY,
        RIGHT: THREE.MOUSE.ROTATE
    };

    controls.keys = {
        LEFT: 'ArrowLeft',
        UP: 'ArrowUp',
        RIGHT: 'ArrowRight',
        BOTTOM: 'ArrowDown'
    };
}
//                  * * *   * * *   * * *

// Owns the active three.js camera and its OrbitControls, kept in sync with
// the `cameras' Vuex module for a given viewport.
class CameraManager {
    constructor({viewportID, store, renderer, render}) {  // {{{
        this._viewportID = viewportID;
        this._vuexStore = store;
        this._renderer = renderer;
        this._render = render;

        this._camera = null;
        this._cameraType = null;
        this._controls = null;

        this._unsubscribe = this._vuexStore.subscribe((mutation) => {
                if(mutation.type.startsWith('cameras/')) {
                    this.sync_camera_from_store();
                }
            }
        );

        this.sync_camera_from_store();
    }  // }}}

    get camera() { return this._camera; }
    get controls() { return this._controls; }

    get cameraSettings() {
        return this._vuexStore.getters['cameras/current_preset'](this._viewportID);
    }

    get viewportSettings() {
        return this._vuexStore.getters['cameras/viewport_state'](this._viewportID);
    }

    sync_camera_from_store() {
        const settings = this.cameraSettings;
        const viewport = this.viewportSettings;
        if(!settings || !viewport) {
            console.warn(`Can't sync/instantiate camera; settings are "${settings}", viewport is "${viewport}"`);
            return;
        }
        if(this._cameraType !== settings.type) this._replace_camera(settings.type);
        this._apply_common_camera_settings(settings);
        if(settings.type === 'perspective') {
            this._camera.fov = settings.fov;
            this._camera.aspect = viewport.aspect;
        } else {
            const halfWidth = settings.width / 2;
            const halfHeight =
                halfWidth / viewport.aspect;

            this._camera.left = -halfWidth;
            this._camera.right = halfWidth;
            this._camera.top = halfHeight;
            this._camera.bottom = -halfHeight;
        }
        this._camera.near = settings.near;
        this._camera.far = settings.far;
        this._camera.updateProjectionMatrix();
        this._render();
    }

    _replace_camera(type) {
        if (type === 'perspective') {
            this._camera = new THREE.PerspectiveCamera();
        } else if (type === 'orthographic') {
            this._camera = new THREE.OrthographicCamera();
        } else {
            throw new Error(
                `Unsupported camera type: ${type}`
            );
        }
        this._cameraType = type;
        this._create_controls(type);
    }

    _create_controls(type) {
        const controls = new OrbitControls(this._camera, this._renderer.domElement);
        controls.enableDamping = false;
        controls.autoRotate = false;
        if (type === 'perspective')
            configure_perspective_controls(controls);
        else
            configure_orthographic_controls(controls);
        controls.addEventListener('change',
                () => this._render()
            );
        controls.addEventListener('end',
                () => this._store_runtime_camera_state()
            );

        // disable to make OrbitControls to not install its keyboard handlers
        // globally:
        controls.listenToKeyEvents(this._renderer.domElement);

        // Required if the canvas is to receive keyboard focus.
        this._renderer.domElement.tabIndex = 0;
        this._controls = controls;
    }

    _apply_common_camera_settings(settings) {
        this._camera.position.fromArray(settings.position);
        const up = new THREE.Vector3().fromArray(settings.up);
        if (up.lengthSq() < 1e-20)
            up.set(0, 1, 0);
        else
            up.normalize();
        this._camera.up.copy(up);
        const target = new THREE.Vector3().fromArray(settings.target);
        if( target.distanceToSquared(this._camera.position) > 1e-20) {
            this._controls.target.fromArray(settings.target);
            this._controls.update();
        }
        this._camera.updateMatrixWorld(true);
    }

    _store_runtime_camera_state() {
        const patch = {
                position: this._camera.position.toArray(),
                target: this._controls.target.toArray(),
                up: this._camera.up.toArray()
            };
        if(this._camera.isOrthographicCamera) patch.zoom = this._camera.zoom;

        this._vuexStore.commit('cameras/patch_working_camera', {
            viewportID: this._viewportID,
            patch
        });
    }

    // Called after the renderer/viewport has been resized; the camera's
    // aspect comes from `cameras/viewport_state`, which the caller is
    // expected to have already updated (see Viewport.vue's ResizeObserver).
    resize() {
        this.sync_camera_from_store();
    }

    dispose() {
        this._unsubscribe?.();
    }
}

export { CameraManager };

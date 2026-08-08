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

        this._unsubscribe = this._vuexStore.subscribe(mutation => {
            if(mutation.type.startsWith('cameras/')) {
                this.sync_camera_from_store();
            }
        });

        this.sync_camera_from_store();
    }  // }}}

    get camera() { return this._camera; }
    get controls() { return this._controls; }

    get cameraSettings() {
        return this._vuexStore.getters['cameras/currentPreset'](this._viewportID);
    }

    get viewportSettings() {
        return this._vuexStore.getters['cameras/viewportState'](this._viewportID);
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
            this._camera.zoom = settings.zoom ?? 1;
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
            throw new Error(`Unsupported camera type: ${type}`);
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
        controls.addEventListener('change', () => this._render());
        controls.addEventListener('end', () => this._store_runtime_camera_state());

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

    // Re-centers the camera on `target' (a THREE.Vector3), preserving the
    // current view direction and distance. Used for degenerate selections
    // (e.g. a single point marker) whose aabb has no meaningful size to
    // frame -- there is nothing to adjust distance/zoom to.
    center_on(target) {
        if(!this._camera || !this._controls) return;
        const offset = this._camera.position.clone().sub(this._controls.target);
        this._controls.target.copy(target);
        this._camera.position.copy(target).add(offset);
        this._controls.update();
        this._store_runtime_camera_state();
    }

    // Frames the camera on `box' (a THREE.Box3), preserving the current view
    // direction but adjusting distance (perspective) or zoom (orthographic)
    // so the box is fully visible. `margin' pads the box slightly so framed
    // objects aren't flush against the viewport edges.
    frame_box(box, margin = 1.15) {
        if(!this._camera || !this._controls || box.isEmpty()) return;
        const center = box.getCenter(new THREE.Vector3());
        const radius = Math.max(box.getBoundingSphere(new THREE.Sphere()).radius, 1e-6) * margin;

        const direction = this._camera.position.clone().sub(this._controls.target);
        if(direction.lengthSq() < 1e-20) direction.set(0, 0, 1);
        direction.normalize();

        let distance;
        if(this._camera.isPerspectiveCamera) {
            const halfFov = THREE.MathUtils.degToRad(this._camera.fov) / 2;
            distance = radius / (Math.tan(halfFov) * Math.min(1, this._camera.aspect));
        } else {
            // Apparent size in an orthographic view is governed by zoom, not
            // distance -- so distance is kept as-is (it only matters for
            // near/far clipping), and zoom is set to fit the box within the
            // camera's (unzoomed) frustum extents.
            const halfWidth = (this._camera.right - this._camera.left) / 2;
            const halfHeight = (this._camera.top - this._camera.bottom) / 2;
            this._camera.zoom = Math.min(halfWidth, halfHeight) / radius;
            distance = this._camera.position.distanceTo(this._controls.target) || 1;
        }

        this._controls.target.copy(center);
        this._camera.position.copy(center).addScaledVector(direction, distance);
        this._controls.update();
        this._store_runtime_camera_state();
    }

    // Called after the renderer/viewport has been resized; the camera's
    // aspect comes from `cameras/viewportState`, which the caller is
    // expected to have already updated (see Viewport.vue's ResizeObserver).
    resize() {
        this.sync_camera_from_store();
    }

    dispose() {
        this._unsubscribe?.();
    }
}

export { CameraManager };

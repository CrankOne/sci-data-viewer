import * as THREE from 'three';
import { watch } from 'vue';
import * as Utils from '../utils';
import * as HlOverlay from '../hl-overlay';

import { CameraManager } from './CameraManager';
import { MaterialManager } from './MaterialManager';
import { GeometryManager } from './GeometryManager';

/* Event display class
 *
 * Maintains scope with objects responsible for displaying the data. */
class ThreeView {
    _create_lights() {  // {{{
        const mainLight = new THREE.DirectionalLight(0xffffff, 5);
        mainLight.position.set(10, 10, 10);

        const hemisphereLight = new THREE.HemisphereLight(0x99aaee, 0x202020, 5);
        this._scene.add(mainLight, hemisphereLight);
    }  // }}}
    _create_renderer() {  // {{{
        this._renderer = new THREE.WebGLRenderer({ antialias: true });  // TODO: option?
        this._renderer.setSize( this._container.clientWidth
                              , this._container.clientHeight
                              );
        this._renderer.setPixelRatio( window.devicePixelRatio );
        //this._renderer.gammaFactor = 2.2;  // deprecated?
        this._renderer.gammaOutput = true;
        this._renderer.physicallyCorrectLights = true;
        this._container.appendChild(this._renderer.domElement);
    }  // }}}
    _render(maskUpdate=true) {  // {{{
        this._renderer.setRenderTarget(null);
        this._renderer.render(this._scene, this.get_cam());
        if(maskUpdate && (this._hoverHL || this._selectHL)) {
            // TODO: check we have highlights/selection
            const oldClearColor = new THREE.Color();
            this._renderer.getClearColor(oldClearColor);
            const oldClearAlpha = this._renderer.getClearAlpha();
            const oldBackground = this._scene.background;
            this._scene.background = null;

            const oldMask = this.get_cam().layers.mask;
            if(this._hoverHL)
                this._hoverHL.render(this._renderer, this.get_cam(), this._scene);
            if(this._selectHL)
                this._selectHL.render(this._renderer, this.get_cam(), this._scene);
            this.get_cam().layers.mask = oldMask;

            this._renderer.setRenderTarget(null);
            this._renderer.setClearColor(oldClearColor, oldClearAlpha);
            this._scene.background = oldBackground;
        }
    } // }}}
    _bind_watchers() {  // {{{
        // NOTE: the `cameras/' store subscription lives inside CameraManager.

        // Geometry update watcher
        //  This function is triggered on either geometry data indexed by source
        //  name gets updated, global transformation matrix gets changed, list
        //  of drawn items changed, etc.
        watch( [ () => this._vuexStore.getters['view3D/geoData']
               , () => this._vuexStore.getters['view3D/transformationMatrix']
               ]
            , () => this._geometryManager.update_drawables() );

        // Highlighted items updater
        watch( () => this._vuexStore.getters['view3D/highlightedGeoItemIDs']
            , (hlItems, hlItemsOld) => {
                    this._geometryManager.update_highlighted_graphics(hlItems, hlItemsOld);
                    this._render();
                }
            );
        // Selected items updater
        watch( () => this._vuexStore.getters['view3D/selectedGeoItemIDs']
            , (hlItems, hlItemsOld) => {
                    this._geometryManager.update_selected_graphics(hlItems, hlItemsOld);
                    this._render();
                }
            );
        // Highlighted markers
        watch( () => this._vuexStore.getters['view3D/highlightedMarkers']
            , (hlMarkers) => {
                    this._geometryManager.update_highlighted_markers(hlMarkers);
                    this._render();
                }
            );
        // Visibility
        watch( () => this._vuexStore.getters['view3D/hiddenGeoItemIDs']
            , () => {
                    this._geometryManager.sync_hidden_items();
                    this._render();
                }
            );
        // Global switch to steer highlightinh of hidden items
        watch( () => this._vuexStore.getters['view3D/highlightHiddenSelection']
            , () => {
                    this._geometryManager.sync_hidden_items_highlight();
                    this._render();
                }
            );
    }  // _bind_watchers() }}}
    // Creates fixture to render things using three.js
    constructor({element, store, viewportID}
            , highlightOnHover=true, highlightOnSelection=true) {  // {{{
        this._viewportID = viewportID;
        this._vuexStore = store;
        this._container = element;
        // create raycaster and pointer vec
        this._pointer = new THREE.Vector2();
        this._raycaster = new THREE.Raycaster();
        //this._raycaset.threshold = 5.0;  // world units unfortunately
        // Creating the (main) scene
        this._scene = new THREE.Scene();
        this._scene.background = new THREE.Color(Utils.get_theme().background);

        this._create_lights();
        this._create_renderer();

        // TODO: add error handlers to this object; useful for debugging
        this._textureLoader = new THREE.TextureLoader();

        // Managers below can synchronously trigger a render as a side effect
        // of their own setup (e.g. CameraManager wiring up OrbitControls,
        // whose `change' event fires as soon as the initial camera state is
        // applied) -- well before construction finishes and every manager
        // field is assigned. Gate the render callback itself so none of
        // those early triggers reach `_render()' before this constructor
        // performs the real first render, below.
        let ready = false;
        const render = () => { if(ready) this._render(); };

        this._cameraManager = new CameraManager({
                viewportID, store,
                renderer: this._renderer,
                render
            });
        this._materialManager = new MaterialManager({
                textureLoader: this._textureLoader
            });
        this._geometryManager = new GeometryManager({
                scene: this._scene,
                store,
                materialManager: this._materialManager,
                render
            });

        this._bind_watchers();

        const w = this._container.clientWidth;
        const h = this._container.clientHeight;
        if(highlightOnHover)
            this._hoverHL = new HlOverlay.SilhouetteOverlay(Utils.LAYER_MASK_HIGHLIGHTED
                    , w, h, Utils.get_theme().highlight
                    , null  // enables debug quad; possible options: 'mask', 'dilate'
                    );
        if(highlightOnSelection)
            this._selectHL = new HlOverlay.SilhouetteOverlay(Utils.LAYER_MASK_SELECTED
                    , w, h, Utils.get_theme().selected
                    , null  // enables debug quad; possible options: 'mask', 'dilate'
                    );
        ready = true;
        this._render();
    }  // }}}
    // Raycasting pointer
    update_pointer(event) {  // {{{
        // NOTE: `event' is (deliberately) a stripped-down {clientX, clientY}
        // -- viewport-relative coordinates from the raw DOM event -- not
        // relative to the container, which sits inside a splitpane layout.
        const rect = this._container.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;
        this._pointer.x = ( x / rect.width ) * 2 - 1;
        this._pointer.y = - ( y / rect.height ) * 2 + 1;

        const camera = this.get_cam();
        const settings = this._cameraManager.cameraSettings;
        this._configure_picking_threshold(camera, settings, rect.height);

        // update picking ray with camera and pointer position
        this._raycaster.setFromCamera(this._pointer, camera);
        // get the intersecting objects
        let intersects = this._raycaster.intersectObjects( this._scene.children, true );
        // The raycaster's world-space threshold set above is exact for
        // orthographic cameras, but only a conservative (over-inclusive
        // near the camera) estimate for perspective ones -- see
        // _configure_picking_threshold(). Re-check point/line hits against
        // the actual on-screen pixel radius; mesh hits are exact regardless
        // (the ray either intersects the surface or it doesn't).
        const radiusPx = settings?.picking?.radiusPx ?? 0;
        intersects = intersects.filter(item => {
            if(!(item.object.isPoints || item.object.isLine)) return true;
            const projected = item.point.clone().project(camera);
            const hitX = (projected.x + 1) / 2 * rect.width;
            const hitY = (1 - projected.y) / 2 * rect.height;
            return Math.hypot(hitX - x, hitY - y) <= radiusPx;
        });
        if(!this._vuexStore.state.view3D.highlightHiddenSelection) {
            intersects = intersects.filter(item => item.object.userData?.handles?.base.visible);
        }
        const items2highlight = intersects.filter(item => item.object.userData?.pickable );
        const markers2highlight = intersects.filter(item => (item.object.userData?.pickable
                    && item.object.userData?.isPointCloud));
        let hasSome = false;
        if(items2highlight && items2highlight.length) {
            const ids2highlight = items2highlight.map(item => Utils.full_geo_id(
                    item.object.userData.srcID, item.object.userData.geoID));
            this._vuexStore.commit('view3D/set_scene_hover_geo_items', ids2highlight);
            hasSome = true;
        }
        if(markers2highlight && markers2highlight.length) {
            const ids2highlight = items2highlight.map(item =>
                    [ Utils.full_geo_id(item.object.userData.srcID, item.object.userData.geoID)
                    , item.index
                    ]
                );
            const ptsByGeo = new Map();
            for(const [geoID, idx] of ids2highlight) {
                if(!ptsByGeo.has(geoID)) ptsByGeo.set(geoID, new Set());
                ptsByGeo.get(geoID).add(idx);
            }
            this._vuexStore.commit('view3D/set_highlighted_markers', ptsByGeo);
            hasSome = true;
        }
        if(!hasSome) {
            this._vuexStore.commit('view3D/clear_scene_hover_geo_items');
        }
    }  // }}}
    clear_pointer() {  // {{{
        this._vuexStore.commit('view3D/clear_scene_hover_geo_items');
        this._vuexStore.commit('view3D/clear_highlighted_markers');
    }  // }}}

    // Configures the raycaster's pick range/threshold from the active
    // camera preset's `picking' settings (see PerspCamCtrls.vue /
    // OrthoCamCtrls.vue). Only THREE.Points and THREE.Line objects consult
    // `params.Points.threshold' / `params.Line.threshold' (world-space
    // units); meshes are always picked by exact ray/surface intersection.
    _configure_picking_threshold(camera, settings, viewportHeightPx) {  // {{{
        const radiusPx = settings?.picking?.radiusPx ?? 0;
        let threshold;
        if(camera.isPerspectiveCamera) {
            this._raycaster.far = settings?.picking?.maxDistance ?? Infinity;
            // Pixel-to-world scale grows with distance from the camera
            // (perspective foreshortening), so there is no single exact
            // conversion. Evaluate it at the configured max pick distance --
            // the farthest a candidate can be and still count -- as a
            // conservative upper bound: nearer candidates, which need a
            // smaller threshold, are never missed by this coarse pass.
            // update_pointer() re-checks the actual on-screen distance per
            // intersection afterwards to correct for the over-estimate.
            const vFov = THREE.MathUtils.degToRad(camera.fov);
            const worldHeight = 2 * this._raycaster.far * Math.tan(vFov / 2);
            threshold = (radiusPx * worldHeight) / viewportHeightPx;
        } else {
            this._raycaster.far = Infinity;
            // Orthographic projection has no foreshortening, so pixel-to-
            // world scale is constant across the whole scene -- this is
            // exact, not just a conservative estimate.
            const worldHeight = (camera.top - camera.bottom) / camera.zoom;
            threshold = (radiusPx * worldHeight) / viewportHeightPx;
        }
        this._raycaster.params.Points.threshold = threshold;
        this._raycaster.params.Line.threshold = threshold;
    }  // }}}

    // clear highlight on mouse leave
    get_cam() { return this._cameraManager.camera; }

    // Frames the camera on the current selection (selected items and/or
    // selected point markers), or on all visible objects if nothing is
    // selected. A lone selected point marker is a special case: its aabb has
    // no meaningful size, so the camera is re-centered on it without
    // touching distance/zoom.
    frame_selected_or_visible() {  // {{{
        this._scene.updateMatrixWorld(true);

        const selectedGeoItemIDs = this._vuexStore.getters['view3D/selectedGeoItemIDs'];
        const selectedMarkers = this._vuexStore.getters['view3D/selectedMarkers'];
        const selectedMarkerCount = [...selectedMarkers.values()]
            .reduce((n, indices) => n + indices.size, 0);

        if(selectedGeoItemIDs.size === 0 && selectedMarkerCount === 1) {
            const [itemID, indices] = [...selectedMarkers.entries()][0];
            const index = [...indices][0];
            const point = this._geometryManager.get_marker_position(itemID, index);
            if(point) this._cameraManager.center_on(point);
            return;
        }

        const box = new THREE.Box3();
        if(selectedGeoItemIDs.size > 0 || selectedMarkerCount > 0) {
            this._geometryManager.expand_box_by_items(box, selectedGeoItemIDs);
            for(const [itemID, indices] of selectedMarkers) {
                for(const index of indices) {
                    const point = this._geometryManager.get_marker_position(itemID, index);
                    if(point) box.expandByPoint(point);
                }
            }
        } else {
            this._geometryManager.expand_box_by_visible_items(box);
        }

        if(box.isEmpty()) return;
        this._cameraManager.frame_box(box);
    }  // }}}

    resize(width, height) {
        const w = Math.max(1, Math.round(width));
        const h = Math.max(1, Math.round(height));
        this._renderer.setPixelRatio(
            window.devicePixelRatio
        );
        this._renderer.setSize(w, h);
        this._materialManager.resize(w, h);
        if(this._hoverHL)
            this._hoverHL.notify_resized(w, h);
        if(this._selectHL)
            this._selectHL.notify_resized(w, h);
        this._cameraManager.resize(w, h);
    }

    dispose() {
        this._cameraManager.dispose();
        this._renderer.dispose();
        this._renderer.domElement.remove();
    }
}  // class ThreeView

export { ThreeView };

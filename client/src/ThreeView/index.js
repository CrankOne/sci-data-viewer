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
        if(!this._cameraManager) return;
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

        this._cameraManager = new CameraManager({
                viewportID, store,
                renderer: this._renderer,
                render: () => this._render()
            });
        this._materialManager = new MaterialManager({
                textureLoader: this._textureLoader
            });
        this._geometryManager = new GeometryManager({
                scene: this._scene,
                store,
                materialManager: this._materialManager,
                render: () => this._render()
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
        this._render();
    }  // }}}
    // Raycasting pointer
    update_pointer(event) {  // {{{
        this._pointer.x = ( event.clientX / this._container.clientWidth ) * 2 - 1;
	    this._pointer.y = - ( event.clientY / this._container.clientHeight ) * 2 + 1;
        // update picking ray with camera and pointer position
        this._raycaster.setFromCamera(this._pointer, this.get_cam());
        // get the intersecting objects
        let intersects = this._raycaster.intersectObjects( this._scene.children, true );
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
    // clear highlight on mouse leave
    get_cam() { return this._cameraManager?.camera; }

    // Frames the camera on the current selection, or on all visible objects
    // if nothing is selected.
    // TODO: implement (compute a bounding box via GeometryManager and adjust
    // the camera/controls target and distance to fit it).
    frame_selected_or_visible() {  // {{{
        console.warn('frame_selected_or_visible() is not implemented yet');
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

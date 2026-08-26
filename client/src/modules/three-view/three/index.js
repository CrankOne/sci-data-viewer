import * as THREE from 'three';
import { watch } from 'vue';
import { get_theme } from '@/utils';
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
        this._renderer = new THREE.WebGLRenderer({antialias: true});  // TODO: option?
        this._renderer.setSize(this._container.clientWidth, this._container.clientHeight);
        this._renderer.setPixelRatio(window.devicePixelRatio);
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
        const view3D = this._view3D;
        // Generic per-context selection state (doc/ui-session.rst's
        // "Selection model", store/selection.js) -- separate from view3D
        // above, which only holds geo3d's own geometry cache and
        // raycast-hover behavior.
        const selection = this._selection;

        // Geometry update watcher
        //  This function is triggered when geometry data indexed by source
        //  name gets updated.
        watch( () => this._vuexStore.getters[`${view3D}/geoData`]
             , () => this._geometryManager.update_drawables()
             );

        // Highlighted items updater
        watch( () => this._vuexStore.getters[`${selection}/highlightedItemIDs`]
             , (hlItems, hlItemsOld) => {
                   this._geometryManager.update_highlighted_graphics(hlItems, hlItemsOld);
                   this._render();
               }
             );
        // Selected items updater
        watch( () => this._vuexStore.getters[`${selection}/selectedItemIDs`]
             , (hlItems, hlItemsOld) => {
                   this._geometryManager.update_selected_graphics(hlItems, hlItemsOld);
                   this._render();
               }
             );
        // Highlighted markers
        watch( () => this._vuexStore.getters[`${view3D}/highlightedMarkers`]
             , hlMarkers => {
                   this._geometryManager.update_highlighted_markers(hlMarkers);
                   this._render();
               }
             );
        // Selected markers -- unlike highlighted markers (whose `.visible'
        // is owned by the whole-item highlight watcher above, since
        // hovering a marker always also scene-hovers its containing item),
        // a marker-only selection never touches `selectedItemIDs' (see
        // toggle_hover_selection()), so update_selected_markers owns
        // `.visible' for the `selected' handle directly -- passing both
        // the new and old maps so it can tell which items' selected
        // overlays to turn back off.
        watch( () => this._vuexStore.getters[`${selection}/selectedSubItems`]
             , (selMarkers, selMarkersOld) => {
                   this._geometryManager.update_selected_markers(selMarkers, selMarkersOld);
                   this._render();
               }
             );
        // Visibility
        watch( () => this._vuexStore.getters[`${selection}/hiddenItemIDs`]
             , () => {
                   this._geometryManager.sync_hidden_items();
                   this._render();
               }
             );
        // Global switch to steer highlightinh of hidden items
        watch( () => this._vuexStore.getters[`${view3D}/highlightHiddenSelection`]
             , () => {
                   this._geometryManager.sync_hidden_items_highlight();
                   this._render();
               }
             );
    }  // _bind_watchers() }}}
    // Creates fixture to render things using three.js
    constructor({element, store, viewportID, contextId}, highlightOnHover=true, highlightOnSelection=true) {  // {{{
        this._viewportID = viewportID;
        this._contextId = contextId;
        this._view3D = `view3D_${contextId}`;
        // Generic per-context selection state (doc/ui-session.rst's
        // "Selection model", store/selection.js).
        this._selection = `selection_${contextId}`;
        this._vuexStore = store;
        this._container = element;
        // create raycaster and pointer vec
        this._pointer = new THREE.Vector2();
        this._raycaster = new THREE.Raycaster();
        // Ordered (near-to-far) geo IDs from the last raycast, and which one
        // of them is currently the sole highlighted item when
        // `highlightAllUnderCursor' is off -- see update_pointer()/
        // cycle_hover(). Unused (left empty/0) while the toggle is on.
        this._hoverStack = [];
        this._hoverCycleIndex = 0;
        // [geoID, index] of the single nearest marker under the cursor (or
        // null) -- unlike `highlightedMarkers' (every marker within the
        // pixel radius, used to show everything hoverable at once), marker
        // *selection* picks exactly one marker per click, mirroring normal
        // 3D-picking convention. See update_pointer()/toggle_hover_selection().
        this._nearestMarkerHit = null;
        //this._raycaset.threshold = 5.0;  // world units unfortunately
        // Creating the (main) scene
        this._scene = new THREE.Scene();
        this._scene.background = new THREE.Color(get_theme().background);

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

        this._cameraManager = new CameraManager({viewportID, store, renderer: this._renderer, render});
        this._materialManager = new MaterialManager({textureLoader: this._textureLoader});
        this._geometryManager = new GeometryManager({
            scene: this._scene,
            store,
            contextId,
            materialManager: this._materialManager,
            render
        });

        this._bind_watchers();

        const w = this._container.clientWidth;
        const h = this._container.clientHeight;
        // last arg enables debug quad; possible options: 'mask', 'dilate'
        if(highlightOnHover)
            this._hoverHL = new HlOverlay.SilhouetteOverlay(
                Utils.LAYER_MASK_HIGHLIGHTED, w, h, get_theme().highlight, null
            );
        if(highlightOnSelection)
            this._selectHL = new HlOverlay.SilhouetteOverlay(
                Utils.LAYER_MASK_SELECTED, w, h, get_theme().selected, null
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
        this._pointer.x = (x / rect.width) * 2 - 1;
        this._pointer.y = -(y / rect.height) * 2 + 1;

        const camera = this.get_cam();
        const settings = this._cameraManager.cameraSettings;
        this._configure_picking_threshold(camera, settings, rect.height);

        // update picking ray with camera and pointer position
        this._raycaster.setFromCamera(this._pointer, camera);
        // get the intersecting objects
        let intersects = this._raycaster.intersectObjects(this._scene.children, true);
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
        if(!this._vuexStore.state[this._view3D].highlightHiddenSelection) {
            // `item.object' *is* the base handle for any raycast hit (see
            // geometry/registry.js) -- `userData.handles' lives one level up,
            // on the parent group, not on the hit object itself, so check
            // the hit object's own visibility directly.
            intersects = intersects.filter(item => item.object.visible);
        }
        const items2highlight = intersects.filter(item => item.object.userData?.pickable);
        const markers2highlight = intersects.filter(
            item => item.object.userData?.pickable && item.object.userData?.subItemPickable
        );
        let hasSome = false;
        if(items2highlight && items2highlight.length) {
            // De-duplicated, near-to-far: a concave mesh can yield more than
            // one intersection against the same geo item.
            const seen = new Set();
            const ids2highlight = [];
            for(const item of items2highlight) {
                const id = Utils.full_geo_id(item.object.userData.srcID, item.object.userData.geoID);
                if(!seen.has(id)) { seen.add(id); ids2highlight.push(id); }
            }
            this._hoverStack = ids2highlight;
            this._hoverCycleIndex = 0;

            const highlightAllUnderCursor = this._vuexStore.state[this._selection].highlightAllUnderCursor;
            this._vuexStore.commit(
                `${this._selection}/set_hover`,
                {origin: 'scene', ids: highlightAllUnderCursor ? ids2highlight : [ids2highlight[0]]}
            );
            hasSome = true;
        } else {
            this._hoverStack = [];
            this._hoverCycleIndex = 0;
        }
        if(markers2highlight && markers2highlight.length) {
            // BUGFIX: this used to map over `items2highlight` (every
            // pickable hit -- meshes, lines, *and* points), not
            // `markers2highlight` (the pre-filtered point-cloud subset).
            // Non-point hits don't carry a meaningful `.index` (meshes use
            // `.faceIndex`), so this injected phantom [geoID, undefined]
            // entries for whatever non-marker geometry also happened to be
            // under the cursor -- harmless to the genuine marker entries
            // (still produced correctly, since markers2highlight is a
            // subset of items2highlight) but wrong/wasteful regardless.
            const ids2highlight = markers2highlight.map( item =>
                [ Utils.full_geo_id(item.object.userData.srcID, item.object.userData.geoID)
                , item.index
                ]
            );
            const ptsByGeo = new Map();
            for(const [geoID, idx] of ids2highlight) {
                if(!ptsByGeo.has(geoID)) ptsByGeo.set(geoID, new Set());
                ptsByGeo.get(geoID).add(idx);
            }
            this._vuexStore.commit(`${this._view3D}/set_highlighted_markers`, ptsByGeo);
            // markers2highlight is near-to-far (preserved from the sorted
            // raycaster `intersects`), so its first entry is the single
            // nearest marker -- what a click should actually pick.
            this._nearestMarkerHit = [
                Utils.full_geo_id(markers2highlight[0].object.userData.srcID, markers2highlight[0].object.userData.geoID),
                markers2highlight[0].index
            ];
            hasSome = true;
        } else {
            this._nearestMarkerHit = null;
        }
        if(!hasSome) {
            // BUGFIX: only `sceneHoveredGeoItemIDs` was cleared here;
            // `highlightedMarkers` was left stale until some other marker
            // item was hovered (clear_pointer(), below, already clears
            // both -- this path just hadn't matched it).
            this._vuexStore.commit(`${this._selection}/clear_hover`, 'scene');
            this._vuexStore.commit(`${this._view3D}/clear_highlighted_markers`);
        }
    }  // }}}
    clear_pointer() {  // {{{
        this._hoverStack = [];
        this._hoverCycleIndex = 0;
        this._nearestMarkerHit = null;
        this._vuexStore.commit(`${this._selection}/clear_hover`, 'scene');
        this._vuexStore.commit(`${this._view3D}/clear_highlighted_markers`);
    }  // }}}

    // Steps which single item (from the last raycast's under-cursor stack,
    // built by update_pointer()) is highlighted, without re-raycasting --
    // driven by shift+wheel while `highlightAllUnderCursor' is off (see
    // handle_wheel()). A no-op with nothing under the cursor.
    cycle_hover(direction) {  // {{{
        const n = this._hoverStack.length;
        if(n === 0) return;
        this._hoverCycleIndex = ((this._hoverCycleIndex + direction) % n + n) % n;
        this._vuexStore.commit(
            `${this._selection}/set_hover`,
            {origin: 'scene', ids: [this._hoverStack[this._hoverCycleIndex]]}
        );
    }  // }}}

    // Called by ThreeViewport.vue's wheel handler. Returns whether the event
    // was consumed for cycling -- if so, the caller must preventDefault()/
    // stopPropagation() it before OrbitControls' own wheel listener (bound
    // directly on the canvas) sees it, so scrolling doesn't also zoom.
    // Leaves OrbitControls entirely alone otherwise (no `enableZoom'
    // toggling, no controls reconstruction) whenever cycling doesn't apply:
    // a plain wheel always zooms regardless of `highlightAllUnderCursor'
    // (the common case, hence the default), and shift+wheel only cycles
    // when there's something single-item to cycle *through*
    // (`highlightAllUnderCursor' off) -- shift+wheel while it's on falls
    // through to zoom too, same as a plain wheel, since "cycle the one
    // hovered item" doesn't mean anything when every under-cursor item is
    // already highlighted at once.
    handle_wheel(event) {  // {{{
        if(!event.shiftKey || this._vuexStore.state[this._selection].highlightAllUnderCursor) return false;
        this.cycle_hover(event.deltaY > 0 ? 1 : -1);
        return true;
    }  // }}}

    // Toggles selection membership of whichever geo item(s) are currently
    // scene-hovered -- the full under-cursor stack, or just the single
    // cycled item, depending on `highlightAllUnderCursor'. Driven by
    // shift+click (see ThreeViewport.vue).
    //
    // Markers and whole items are mutually exclusive selection targets:
    // shift+clicking a marker toggles just that one marker (see
    // _toggle_marker_selection() below) and never touches its containing
    // PointMarkers item's own (whole-item) selection -- a scene with many
    // thousands of markers would make per-marker Items-Tree entries
    // impractical, so marker selection is tracked entirely separately
    // (store/selection.js's `selectedSubItems`, surfaced by its own
    // side-panel section rather than the Items Tree). Whole-item selection
    // remains available for a PointMarkers item exactly as for any other
    // type -- just not by clicking one of its individual markers in the 3D
    // view.
    toggle_hover_selection() {  // {{{
        if(this._nearestMarkerHit) {
            this._toggle_marker_selection(...this._nearestMarkerHit);
            return;
        }
        const hovered = this._vuexStore.getters[`${this._selection}/hoveredIDs`]('scene');
        if(hovered.size === 0) return;

        const selected = this._vuexStore.getters[`${this._selection}/selectedItemIDs`];
        const toSelect = [];
        const toUnselect = [];
        for(const id of hovered) {
            if(selected.has(id)) toUnselect.push(id);
            else toSelect.push(id);
        }

        if(toUnselect.length) this._vuexStore.commit(`${this._selection}/unselect_items`, toUnselect);
        if(toSelect.length) this._vuexStore.commit(`${this._selection}/select_items`, toSelect);
    }  // }}}

    // Toggles exactly one marker (identified by its containing item's
    // geoID + its index within that item) in/out of `selectedSubItems`.
    // `select_sub_items' replaces a geoID's whole index Set rather than
    // toggling a single member, so the updated Set is computed here and
    // committed whole; an emptied Set is dropped from the Map entirely
    // (clear_selected_sub_items) rather than committed as an empty Set, for
    // the same reason clear_highlighted_markers(geoID) exists -- keeps
    // the side panel (and selection-set save/restore) from carrying
    // around empty entries.
    _toggle_marker_selection(geoID, index) {  // {{{
        const selectedMarkers = this._vuexStore.getters[`${this._selection}/selectedSubItems`];
        const current = new Set(selectedMarkers.get(geoID) ?? []);
        if(current.has(index)) current.delete(index);
        else current.add(index);

        if(current.size) {
            this._vuexStore.commit(`${this._selection}/select_sub_items`, {itemID: geoID, indices: current});
        } else {
            this._vuexStore.commit(`${this._selection}/clear_selected_sub_items`, geoID);
        }
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

        const selectedGeoItemIDs = this._vuexStore.getters[`${this._selection}/selectedItemIDs`];
        const selectedMarkers = this._vuexStore.getters[`${this._selection}/selectedSubItems`];
        const selectedMarkerCount = [...selectedMarkers.values()].reduce((n, indices) => n + indices.size, 0);

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
        this._renderer.setPixelRatio(window.devicePixelRatio);
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
        this._geometryManager.dispose();
        this._renderer.dispose();
        this._renderer.domElement.remove();
    }
}  // class ThreeView

export { ThreeView };

import * as THREE from 'three';
import _ from 'lodash';
import * as Geometry from '../geometry';
import * as Utils from '../utils';
import * as HlOverlay from '../hl-overlay';

// Owns the per-source geometry registry (three.js representations of the
// items provided by data sources), keeps it in sync with the store's
// `view3D/geoData`, and applies highlight/selection/visibility state to the
// resulting three.js objects.
class GeometryManager {
    constructor({scene, store, materialManager, render}) {  // {{{
        this._scene = scene;
        this._vuexStore = store;
        this._materialManager = materialManager;
        this._render = render;
        // Geometries, of similar structure to materials:
        //  {<sourceID:str>:Object}, where Object is
        //      {threeJSGeo, geoDef, geoMaterial, geoType}
        this._geometries = {};
    }  // }}}

    update_drawables() {  // {{{
        console.debug('"geometry updated" hook triggered in ThreeViewer');
        // use values from this._vuexStore.getters['view3D/geoData']
        // to re-draw the scene. Take into account items disabled for
        // drawing
        Object
            .entries(this._vuexStore.getters['view3D/geoData'])
            .map(([sourceName, geoData]) => this.update_drawables_from_source(sourceName, geoData));
        this._render();
    }  // }}}

    // Creates/updates item by its geometrical definition; assumes materials
    // and geometrical definitions are scoped by the source (should be
    // forwarded by `thisSourceMats` and `thisSourceGeo`).
    update_geometry_item(geoDef_, geomNamesInUse, thisSourceMats, thisSourceID, thisSourceGeo) {  // {{{
        const { _name: geoName
              , _type: geoType
              , _material: geoMaterial
              , ...geoDef } = geoDef_;
        if(geomNamesInUse.has(geoName)) {
            throw new Error(`Geometry name "${geoName}" met`
                + ` at least twice for source "${thisSourceID}"`);
        }
        geomNamesInUse.add(geoName);
        // pop position and rotation properties, if
        // provided, as we shall not re-create object on
        // its change
        var position = null;
        if( geoDef.position ) {
            position = geoDef.position;
            delete geoDef.position;
        }
        var rotation = null;
        if( geoDef.rotation ) {
            rotation = geoDef.rotation;
            delete geoDef.rotation;
        }
        var rotationOrder = null;
        if( geoDef.rotation ) {
            rotationOrder = geoDef.rotationOrder;
            delete geoDef.rotationOrder;
        }
        // try to get material
        const defaultMaterials = this._materialManager.defaultMaterials;
        if(!( thisSourceMats.hasOwnProperty(geoMaterial)
            || defaultMaterials.hasOwnProperty(geoMaterial)
            )) {
            console.error(`Error in geometry "${geoName}":`
                + ` materials set "${geoMaterial}" is not defined`
                + ` by data source "${thisSourceID}"; geometry`
                + " not constructed!" );
            return;
        }
        if(thisSourceGeo.hasOwnProperty(geoName)) {  // eponymous geo item exists
            if( _.isEqual(thisSourceGeo[geoName].geoDef, geoDef)
             && geoMaterial == thisSourceGeo[geoName].geoMaterial
             && geoType == thisSourceGeo[geoName].geoType
              ) {  // geometry definition and material did not change (position/rotation can)
                if(!thisSourceGeo[geoName].hasOwnProperty('threeJSGeo')) {
                    console.warn(`Can't check/update geometry record ${geoName} as it does not expose its three.js representation`);
                    return;
                }
                console.debug(`Geometry "${thisSourceID}/${geoName}" unchanged, updating position and rotation`);
                // yet, position/rotation may change
                if(position !== null ) {
                    if(thisSourceGeo[geoName].threeJSGeo.hasOwnProperty('position'))
                        thisSourceGeo[geoName].threeJSGeo.position.set(...position);
                    else
                        console.warn(`Can not update position for geometry item ${geoName} as it does not expose 'position' property`)
                }
                if(thisSourceGeo[geoName].threeJSGeo.hasOwnProperty('rotation')) {
                    if(rotationOrder != null ) {
                        thisSourceGeo[geoName].threeJSGeo.rotation.order = rotationOrder;
                    }
                    if(rotation !== null) {
                        thisSourceGeo[geoName].threeJSGeo.rotation.set(...rotation);
                    }
                } else {
                    console.warn(`Can not update position for geometry item ${geoName} as it does not expose 'rotation' property`)
                }
                return;  // skip geometry construction
            }
            // otherwise, destroy existing eponymous geometry record (to
            // substitute below)
            thisSourceGeo[geoName].threeJSGeo.dispose(); // TODO: is it correct?
            // ^^^ https://discourse.threejs.org/t/correctly-remove-mesh-from-scene-and-dispose-material-and-geometry/5448
        }
        console.debug(`Creating geometry item "${geoName}" of type ${geoType}...`);
        const geometryCreationContext = {
                  defaultMeshMaterial:      defaultMaterials.defaultMeshMaterial
                , defaultLineMaterial:      defaultMaterials.defaultLineMaterial

                //, pointsMaskMaterial:       ,
                , lineMaskMaterial:         HlOverlay.SilhouetteOverlay.lineMaskMaterial
                , meshMaskMaterial:         HlOverlay.SilhouetteOverlay.meshMaskMaterial
            };  // context;
        const threeJSGeo = Geometry.make_geometry( geoType  // geo type name string (one of geometry/*.js)
                , thisSourceMats.hasOwnProperty(geoMaterial)
                ? thisSourceMats[geoMaterial].threeJSMaterials
                : { base: defaultMaterials[geoMaterial]
                  , mask: null
                  }  // materials for the item
                , geoDef  // geometry definition object as provided
                , {geoID: geoName, srcID: thisSourceID}  // userdata to save in the three.js group object, shallow-copied
                , geometryCreationContext // context
            );
        this._scene.add(threeJSGeo);

        if(position !== null) {
            console.debug(`Placing new geometry at ${position[0]}x${position[1]}x${position[2]}`);
            threeJSGeo.position.set(...position);
        }
        if(rotationOrder != null) {
            thisSourceGeo[geoName].rotation.order = rotationOrder;
        }
        if(rotation !== null) {
            console.debug(`Rotating new geometry by ${rotation[0]},${rotation[1]},${rotation[2]}`);
            threeJSGeo.rotation.set(...rotation);
        }
        // Push item to the global collection
        thisSourceGeo[geoName] = {threeJSGeo, geoDef, geoMaterial, geoType};
    }  // }}}

    // (Re)creates geometry items defined by `geoData' parameter including
    // materials and drawable objects (point markers, lines, meshes, etc).
    // May dispose materials/remove geometrical entities.
    update_drawables_from_source(sourceName, geoData) {  // {{{
        console.debug(geoData);  // XXX
        const thisSourceMats = this._materialManager.sync_source_materials(
                sourceName, geoData.materials || []);
        // update source's geometries
        var thisSourceGeo = this._geometries[sourceName] || {};
        var geomNamesInUse = new Set();
        //var geometriesToDispose = [];  // not needed, as we dispose 'em immediately
        geoData.geometry.forEach((geoDef_) => {
                this.update_geometry_item(geoDef_, geomNamesInUse, thisSourceMats
                    , sourceName, thisSourceGeo);
            });
        this._geometries[sourceName] = thisSourceGeo;
    }  // }}}

    // Called by watcher on highlight change; should not modify store's values,
    // but follow given ones. Implements changes of the geometrical entities
    // appearance, as defined by `Geometry.js` API.
    update_highlighted_graphics(hlItems, hlItemsOld) {  // {{{
        const added   = Utils.set_difference(hlItems, hlItemsOld);
        const removed = Utils.set_difference(hlItemsOld, hlItems);
        // Get items to un-highlight
        removed.forEach((itemID) => {
                const item = this.get_geometry_item(itemID);
                if(!item) return;
                if(!item.threeJSGeo) return;
                if(!item.threeJSGeo.isGroup) return;
                // disabele visibility for highlighted handle,
                item.threeJSGeo.userData.handles.highlight.visible = false;
                // enable visibility for base handle unless item is in the
                // selection -- in this case enable selected
                //item.threeJSGeo.userData.handles.base.visible = true;
            });
        // Items to highlight
        added.forEach((itemID) => {
                const item = this.get_geometry_item(itemID);
                if(!item) return;
                if(!item.threeJSGeo) return;
                if(!item.threeJSGeo.isGroup) return;
                // enable visibility for highlighted handle, disable for others
                item.threeJSGeo.userData.handles.highlight.visible = true;
                //item.threeJSGeo.userData.handles.selected.visible = false;
                //item.threeJSGeo.userData.handles.base.visible = false;
            });
        this._render();
    }  // }}}

    // Called on highlighted markers set change
    update_highlighted_markers(highlightedMarkers) {  // {{{
        console.debug(highlightedMarkers);  // XXX
        highlightedMarkers.forEach((idxs, itemID) => {
            console.log(itemID);  // XXX
            const item = this.get_geometry_item(itemID);
            if(!item) return;
            if(!item.threeJSGeo) return;
            if(!item.threeJSGeo.isGroup) return;
            // Handle point markers in a bit of special way -- update
            // colors of highlighted markers using indeces information
                console.debug("updating highlightedMarkers...");  // XXX
                if(item.threeJSGeo.userData.handles.highlight.isPoints) {
                    const clrAttr = item.threeJSGeo.userData.handles.highlight.geometry.getAttribute('color');
                    if(clrAttr) {
                        clrAttr.array.fill(0.0);
                        for(const idx of idxs) {
                            clrAttr.array[3*idx    ] = 1.0;
                            clrAttr.array[3*idx + 1] = 1.0;
                            clrAttr.array[3*idx + 2] = 1.0;
                        }
                        clrAttr.needsUpdate = true;
                    }
                } else {
                    console.warn("Ignoring unsupported by-index marker(?) item");
                }
        });
        this._render();
    }  // }}}

    // Called by watcher on selection change; should not modify store's values,
    // but follow given ones. Implements changes of the geometrical entities
    // appearance, as defined by `Geometry.js` API.
    update_selected_graphics(hlItems, hlItemsOld) {  // {{{
        const added   = Utils.set_difference(hlItems, hlItemsOld);
        const removed = Utils.set_difference(hlItemsOld, hlItems);
        // Get items to un-highlight
        removed.forEach((itemID) => {
                const item = this.get_geometry_item(itemID);
                if(!(item.threeJSGeo.userData?.handles?.base)) return;  // omit ones without base handle
                // enable visibility for base handle unless item is in the
                // selection -- in this case enable selected
                item.threeJSGeo.userData.handles.selected.visible = false;
            });
        // Items to highlight
        added.forEach((itemID) => {
                const item = this.get_geometry_item(itemID);
                // enable visibility for highlighted handle, disable for others
                item.threeJSGeo.userData.handles.selected.visible = true;
            });
        // Override hidden (invisible) items, unless "highlight invisible" is
        // enabled
        this.sync_hidden_items_highlight();
    }  // }}}

    sync_hidden_items_highlight() {  // {{{
        const hiddenAreVisible = this._vuexStore.state.view3D.highlightHiddenSelection;
        // iterate over all threeJS geometry instances that have
        // userData.handles.base
        this.for_each_geometry_entry((srcID, geoID, item) => {
            if(item.threeJSGeo.userData.handles.selected) {
                const fullGeoID = Utils.full_geo_id(srcID, geoID);
                if(this._vuexStore.state.view3D.selectedGeoItemIDs.has(fullGeoID)) {
                    if(this._vuexStore.state.view3D.hiddenGeoItemIDs.has(fullGeoID)) {
                        item.threeJSGeo.userData.handles.selected.visible = hiddenAreVisible;
                    }
                }
            }
        });
    }  // }}}

    for_each_geometry_entry(func) {  /// {{{
        if(!this._geometries) return;
        Object.entries(this._geometries).forEach(([srcID, geometries]) => {
            Object.entries(geometries).forEach(([geoID, item]) => {
                func(srcID, geoID, item);
            });
        });
    } // }}}

    get_geometry_item(itemID) {  // {{{
        const [srcID, geoItemID] = Utils.destruct_geo_id(itemID);
        if(!this._geometries.hasOwnProperty(srcID)) return;
        if(!this._geometries[srcID].hasOwnProperty(geoItemID)) return;
        return this._geometries[srcID][geoItemID];
    }  // }}}

    sync_hidden_items() {  // {{{
        this.for_each_geometry_entry((srcID, geoID, item) => {
            const itemID = Utils.full_geo_id(srcID, geoID);
            if(this._vuexStore.state.view3D.hiddenGeoItemIDs.has(itemID))
                item.threeJSGeo.userData.handles.base.visible = false;
            else
                item.threeJSGeo.userData.handles.base.visible = true;
        });
        this.sync_hidden_items_highlight();
    }  // }}}

    // Expands `box' (a THREE.Box3) to enclose the base representation of
    // each of the given full geo item IDs. Returns `box' for chaining.
    expand_box_by_items(box, itemIDs) {  // {{{
        for(const itemID of itemIDs) {
            const item = this.get_geometry_item(itemID);
            const base = item?.threeJSGeo?.userData?.handles?.base;
            if(base) box.expandByObject(base);
        }
        return box;
    }  // }}}

    // Expands `box' to enclose the base representation of every item that
    // isn't currently hidden. Returns `box' for chaining.
    expand_box_by_visible_items(box) {  // {{{
        const hiddenIDs = this._vuexStore.state.view3D.hiddenGeoItemIDs;
        this.for_each_geometry_entry((srcID, geoID, item) => {
            const itemID = Utils.full_geo_id(srcID, geoID);
            if(hiddenIDs.has(itemID)) return;
            const base = item.threeJSGeo?.userData?.handles?.base;
            if(base) box.expandByObject(base);
        });
        return box;
    }  // }}}

    // Returns the world-space position of a single point-marker index
    // within item `itemID', or null if it can't be resolved. Relies on the
    // scene's world matrices being up to date (see ThreeView.frame_selected_or_visible).
    get_marker_position(itemID, index) {  // {{{
        const item = this.get_geometry_item(itemID);
        const base = item?.threeJSGeo?.userData?.handles?.base;
        const posAttr = base?.geometry?.getAttribute('position');
        if(!posAttr || index >= posAttr.count) return null;
        return base.localToWorld(new THREE.Vector3().fromBufferAttribute(posAttr, index));
    }  // }}}
}

export { GeometryManager };

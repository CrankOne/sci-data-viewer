import * as THREE from 'three';
import _ from 'lodash';
import * as Geometry from '../geometry';
import * as Utils from '../utils';
import * as HlOverlay from '../hl-overlay';

//                  * * *   * * *   * * *
// Transformation groups (see transfGroups.js / TransfGroupsPanel.vue)

// Default composition order for an item's included channels, ascending =
// innermost (closest to the item) first. Chosen so that an item using every
// channel at its default reproduces plain three.js T*R*S composition.
const DEFAULT_CHANNEL_ORDER = {scale: 0, rotation: 10, position: 20};
// Deterministic tie-break for channels sharing an explicit order.
const CHANNEL_TIEBREAK = {scale: 0, rotation: 1, position: 2};

// Parses a geo item's `_transfGroup' property into {name, channels,
// ownRotation, ownScale}, or null if the item doesn't reference a group.
// `channels' is the ascending-sorted (innermost-first) list of
// {type: 'position'|'rotation'|'scale'} entries the item opts into: a
// channel is included at its given integer order, included at
// DEFAULT_CHANNEL_ORDER if omitted, or excluded entirely if explicitly
// `null'. A bare string is shorthand for {name: <string>} (every channel at
// its default, `ownRotation'/`ownScale' both true).
function parse_transf_group_ref(spec) {
    if(spec === undefined || spec === null) return null;

    let name, raw;
    if(typeof spec === 'string') {
        name = spec.trim();
        raw = {};
    } else if(typeof spec === 'object') {
        name = spec.name?.trim();
        raw = spec;
    } else {
        throw new Error('"_transfGroup" must be a string or an object.');
    }
    if(!name) throw new Error('"_transfGroup" must have a non-empty "name".');

    const channels = [];
    for(const type of ['position', 'rotation', 'scale']) {
        const value = raw[type];
        if(value === null) continue;  // explicitly excluded
        const order = value === undefined ? DEFAULT_CHANNEL_ORDER[type] : Number(value);
        if(!Number.isFinite(order)) {
            throw new Error(`Invalid order "${value}" for "${type}" in transform group "${name}".`);
        }
        channels.push({type, order});
    }
    channels.sort((a, b) => a.order - b.order || CHANNEL_TIEBREAK[a.type] - CHANNEL_TIEBREAK[b.type]);

    return {
        name,
        channels,
        ownRotation: raw.ownRotation ?? true,
        ownScale: raw.ownScale ?? true
    };
}

// Composes an item's own (untransformed) position/rotation with the
// channels it opts into from `group' ({position, rotation (deg), scale}, as
// stored by the transfGroups module), walking `channels' innermost-first.
// This is a direct generalization of translate/rotate/scale-a-point chain
// math: a channel always moves the item's *position* when included, but
// only also becomes part of the item's *own* orientation/size when
// `ownRotation'/`ownScale' allow it -- which is what lets e.g. a group's
// scale pull an item's placement in line with its neighbors without
// resizing the item itself.
function compose_transf_group(ownPosition, ownQuaternion, group, ref) {
    const position = ownPosition.clone();
    const quaternion = ownQuaternion.clone();
    const scale = new THREE.Vector3(1, 1, 1);

    for(const {type} of ref.channels) {
        if(type === 'scale') {
            const s = new THREE.Vector3(...group.scale);
            position.multiply(s);
            if(ref.ownScale) scale.multiply(s);
        } else if(type === 'rotation') {
            const q = new THREE.Quaternion().setFromEuler(
                new THREE.Euler(
                    THREE.MathUtils.degToRad(group.rotation[0]),
                    THREE.MathUtils.degToRad(group.rotation[1]),
                    THREE.MathUtils.degToRad(group.rotation[2]),
                    'XYZ'
                )
            );
            position.applyQuaternion(q);
            if(ref.ownRotation) quaternion.premultiply(q);
        } else if(type === 'position') {
            position.add(new THREE.Vector3(...group.position));
        }
    }
    return {position, quaternion, scale};
}

function apply_composed_transform(threeJSGeo, composed) {
    threeJSGeo.position.copy(composed.position);
    threeJSGeo.quaternion.copy(composed.quaternion);
    threeJSGeo.scale.copy(composed.scale);
}
//                  * * *   * * *   * * *

// Owns the per-source geometry registry (three.js representations of the
// items provided by data sources), keeps it in sync with the store's
// `view3D/geoData`, and applies highlight/selection/visibility state to the
// resulting three.js objects.
class GeometryManager {
    constructor({scene, store, contextId, materialManager, render}) {  // {{{
        this._scene = scene;
        this._vuexStore = store;
        this._contextId = contextId;
        this._view3D = `view3D_${contextId}`;
        this._transfGroups = `transfGroups_${contextId}`;
        this._materialManager = materialManager;
        this._render = render;
        // Geometries, of similar structure to materials:
        //  {<sourceID:str>:Object}, where Object is
        //      {threeJSGeo, geoDef, geoMaterial, geoType, transfGroupRef,
        //       ownPosition, ownQuaternion}
        this._geometries = {};

        const transfGroupsPrefix = `${this._transfGroups}/`;
        this._unsubscribe = this._vuexStore.subscribe(mutation => {
            if(!mutation.type.startsWith(transfGroupsPrefix)) return;
            // A newly-discovered group starts at identity; nothing
            // existing needs re-placing on account of it.
            if(mutation.type === `${this._transfGroups}/ensure_group`) return;
            const name = typeof mutation.payload === 'string' ? mutation.payload : mutation.payload?.name;
            this.sync_transf_groups(name ? new Set([name]) : null);
            this._render();
        });
    }  // }}}

    dispose() {  // {{{
        this._unsubscribe?.();
    }  // }}}

    update_drawables() {  // {{{
        console.debug('"geometry updated" hook triggered in ThreeViewer');
        // use values from this._vuexStore.getters[`${this._view3D}/geoData`]
        // to re-draw the scene. Take into account items disabled for
        // drawing
        Object.entries(this._vuexStore.getters[`${this._view3D}/geoData`])
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
              , _transfGroup: transfGroupSpec
              , ...geoDef
              } = geoDef_;
        if(geomNamesInUse.has(geoName)) {
            throw new Error(`Geometry name "${geoName}" met at least twice for source "${thisSourceID}"`);
        }
        geomNamesInUse.add(geoName);
        // pop position and rotation properties, if
        // provided, as we shall not re-create object on
        // its change
        let position = null;
        if(geoDef.position) {
            position = geoDef.position;
            delete geoDef.position;
        }
        let rotation = null;
        if(geoDef.rotation) {
            rotation = geoDef.rotation;
            delete geoDef.rotation;
        }
        let rotationOrder = null;
        if(geoDef.rotation) {
            rotationOrder = geoDef.rotationOrder;
            delete geoDef.rotationOrder;
        }
        // Shared transformation group this item participates in, if any
        // (see transfGroups.js). Parsed/registered unconditionally, even
        // along the "unchanged geometry" fast path below, so already-loaded
        // geometry still registers a newly-referenced group.
        const transfGroupRef = parse_transf_group_ref(transfGroupSpec);
        if(transfGroupRef) {
            this._vuexStore.commit(`${this._transfGroups}/ensure_group`, transfGroupRef.name);
        }
        // try to get material
        const defaultMaterials = this._materialManager.defaultMaterials;
        if(!thisSourceMats.hasOwnProperty(geoMaterial) && !defaultMaterials.hasOwnProperty(geoMaterial)) {
            console.error(
                `Error in geometry "${geoName}": materials set "${geoMaterial}" is not defined `
                + `by data source "${thisSourceID}"; geometry not constructed!`
            );
            return;
        }
        if(thisSourceGeo.hasOwnProperty(geoName)) {  // eponymous geo item exists
            if( _.isEqual(thisSourceGeo[geoName].geoDef, geoDef)
             && geoMaterial == thisSourceGeo[geoName].geoMaterial
             && geoType == thisSourceGeo[geoName].geoType
              ) {  // geometry definition and material did not change (position/rotation can)
                if(!thisSourceGeo[geoName].hasOwnProperty('threeJSGeo')) {
                    console.warn(
                        `Can't check/update geometry record ${geoName} as it does not`
                        + ' expose its three.js representation'
                    );
                    return;
                }
                console.debug(`Geometry "${thisSourceID}/${geoName}" unchanged, updating position and rotation`);
                // yet, position/rotation (own or via the transform group)
                // may change
                const {ownPosition, ownQuaternion} = this._place_item(
                    thisSourceGeo[geoName].threeJSGeo, position, rotation, rotationOrder, transfGroupRef
                );
                thisSourceGeo[geoName].transfGroupRef = transfGroupRef;
                thisSourceGeo[geoName].ownPosition = ownPosition;
                thisSourceGeo[geoName].ownQuaternion = ownQuaternion;
                return;  // skip geometry construction
            }
            // otherwise, destroy existing eponymous geometry record (to
            // substitute below)
            thisSourceGeo[geoName].threeJSGeo.removeFromParent();
            // ^^^ threeJSGeo is a plain THREE.Group (see geometry/registry.js),
            // which has no dispose() -- this only detaches it from the
            // scene graph. Full GPU-resource disposal (of the child meshes'
            // own geometries/materials) is not implemented.
            // https://discourse.threejs.org/t/correctly-remove-mesh-from-scene-and-dispose-material-and-geometry/5448
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
                    : {base: defaultMaterials[geoMaterial], mask: null}  // materials for the item
                , geoDef  // geometry definition object as provided
                , {geoID: geoName, srcID: thisSourceID}  // userdata to save on the three.js group, shallow-copied
                , geometryCreationContext // context
                );
        this._scene.add(threeJSGeo);

        const {ownPosition, ownQuaternion} =
            this._place_item(threeJSGeo, position, rotation, rotationOrder, transfGroupRef);
        // Push item to the global collection
        thisSourceGeo[geoName] = {threeJSGeo, geoDef, geoMaterial, geoType, transfGroupRef, ownPosition, ownQuaternion};
    }  // }}}

    // Places `threeJSGeo' (an item's own group node) using its own
    // position/rotation, popped off its geoDef by update_geometry_item()
    // -- and, if `transfGroupRef' is given, composes them with whichever
    // channels of that named group the item opts into (see
    // compose_transf_group() above). Falls back to exactly the historical
    // behavior (plain `.position.set()' / `.rotation.set()', scale left
    // untouched) when there's no transform group.
    //
    // Returns {ownPosition, ownQuaternion} (THREE.Vector3/Quaternion, or
    // null when there's no transform group to later resync against) for
    // the caller to stash on the geometry record.
    _place_item(threeJSGeo, position, rotation, rotationOrder, transfGroupRef) {  // {{{
        if(rotationOrder != null) threeJSGeo.rotation.order = rotationOrder;

        if(!transfGroupRef) {
            if(position !== null) threeJSGeo.position.set(...position);
            if(rotation !== null) threeJSGeo.rotation.set(...rotation);
            return {ownPosition: null, ownQuaternion: null};
        }

        const ownPosition = position !== null ? new THREE.Vector3(...position) : new THREE.Vector3();
        const ownQuaternion = rotation !== null
            ? new THREE.Quaternion().setFromEuler(
                new THREE.Euler(rotation[0], rotation[1], rotation[2], rotationOrder ?? 'XYZ')
            )
            : new THREE.Quaternion();

        const group = this._vuexStore.getters[`${this._transfGroups}/group`](transfGroupRef.name);
        if(group) {
            const composed = compose_transf_group(ownPosition, ownQuaternion, group, transfGroupRef);
            apply_composed_transform(threeJSGeo, composed);
        }
        return {ownPosition, ownQuaternion};
    }  // }}}

    // Recomputes and reapplies placement for every item participating in a
    // transformation group, following a group edit. `names' restricts this
    // to the given Set of group names (all groups if omitted/null).
    sync_transf_groups(names = null) {  // {{{
        this.for_each_geometry_entry((srcID, geoID, item) => {
            const ref = item.transfGroupRef;
            if(!ref) return;
            if(names && !names.has(ref.name)) return;
            const group = this._vuexStore.getters[`${this._transfGroups}/group`](ref.name);
            if(!group) return;
            const composed = compose_transf_group(item.ownPosition, item.ownQuaternion, group, ref);
            apply_composed_transform(item.threeJSGeo, composed);
        });
    }  // }}}

    // (Re)creates geometry items defined by `geoData' parameter including
    // materials and drawable objects (point markers, lines, meshes, etc).
    // May dispose materials/remove geometrical entities.
    update_drawables_from_source(sourceName, geoData) {  // {{{
        console.debug(geoData);  // XXX
        const thisSourceMats = this._materialManager.sync_source_materials(sourceName, geoData.materials || []);
        // update source's geometries
        const thisSourceGeo = this._geometries[sourceName] || {};
        const geomNamesInUse = new Set();
        //const geometriesToDispose = [];  // not needed, as we dispose 'em immediately
        geoData.geometry.forEach(geoDef_ => {
            this.update_geometry_item(geoDef_, geomNamesInUse, thisSourceMats, sourceName, thisSourceGeo);
        });
        this._geometries[sourceName] = thisSourceGeo;
    }  // }}}

    // Called by watcher on highlight change; should not modify store's values,
    // but follow given ones. Implements changes of the geometrical entities
    // appearance, as defined by `Geometry.js` API.
    update_highlighted_graphics(hlItems, hlItemsOld) {  // {{{
        const added = Utils.set_difference(hlItems, hlItemsOld);
        const removed = Utils.set_difference(hlItemsOld, hlItems);
        // Get items to un-highlight
        removed.forEach(itemID => {
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
        added.forEach(itemID => {
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
        const added = Utils.set_difference(hlItems, hlItemsOld);
        const removed = Utils.set_difference(hlItemsOld, hlItems);
        // Get items to un-highlight
        removed.forEach(itemID => {
            const item = this.get_geometry_item(itemID);
            // when one tries to un-select non-existing item, it might
            // indicate an error/improperly disposed item (except for the
            // cases of named preset was un-selected)
            if(!item) {
                console.warn(`No item "${itemID}" found on scene to remove selection highlight.`);
                return;
            }
            if(!item.threeJSGeo.userData?.handles?.base) return;  // omit ones without base handle
            // enable visibility for base handle unless item is in the
            // selection -- in this case enable selected
            item.threeJSGeo.userData.handles.selected.visible = false;
        });
        // Items to highlight
        added.forEach(itemID => {
            const item = this.get_geometry_item(itemID);
            // it's kind of ok when Id is not found on scene since it can
            // come from saved pre-set.
            if(!item) return;
            // enable visibility for highlighted handle, disable for others
            item.threeJSGeo.userData.handles.selected.visible = true;
        });
        // Override hidden (invisible) items, unless "highlight invisible" is
        // enabled
        this.sync_hidden_items_highlight();
    }  // }}}

    sync_hidden_items_highlight() {  // {{{
        const view3D = this._vuexStore.state[this._view3D];
        const hiddenAreVisible = view3D.highlightHiddenSelection;
        // iterate over all threeJS geometry instances that have
        // userData.handles.base
        this.for_each_geometry_entry((srcID, geoID, item) => {
            if(item.threeJSGeo.userData.handles.selected) {
                const fullGeoID = Utils.full_geo_id(srcID, geoID);
                if(view3D.selectedGeoItemIDs.has(fullGeoID)) {
                    if(view3D.hiddenGeoItemIDs.has(fullGeoID)) {
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
            if(this._vuexStore.state[this._view3D].hiddenGeoItemIDs.has(itemID))
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
        const hiddenIDs = this._vuexStore.state[this._view3D].hiddenGeoItemIDs;
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

import * as THREE from 'three';
import _ from 'lodash';
import * as Materials from '../materials';
import * as Utils from '../utils';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';

// Owns the default materials expected across the geometry API, plus the
// per-data-source material registry built from source-provided material
// definitions.
class MaterialManager {
    constructor({textureLoader}) {  // {{{
        this._textureLoader = textureLoader;
        // Default materials
        this._defaultMaterials = {};
        // Index of materials by source ID {<sourceID:str>:Object}
        // Where object item is <materialName:str>:{threeJSMaterial, matDef}
        // One can compare 2nd
        this._materials = {};
        this._create_default_materials();
    }  // }}}

    get defaultMaterials() { return this._defaultMaterials; }

    // Creates default materials expected across API
    _create_default_materials() {  // {{{
        // NOTE: these are not all the default ones used to create geometries,
        // some others are created in the highlighting overlays.
        this._defaultMaterials['defaultMeshMaterial'] = new THREE.MeshBasicMaterial({
            color: Utils.get_theme().foreground,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.15
        });

        this._defaultMaterials['defaultLineMaterial'] = new THREE.LineBasicMaterial({
            color: Utils.get_theme().foreground
        });

        this._defaultMaterials['defaultFatLineMaterial'] = new LineMaterial({
            color: Utils.get_theme().foreground,
            linewidth: 5
        });
    }  // }}}

    // (Re)creates/disposes materials for a single data source, given its
    // deserialized material definitions. Returns the source's material
    // registry, keyed by material name.
    sync_source_materials(sourceName, materialDefs) {  // {{{
        const thisSourceMats = this._materials[sourceName] || {};
        // track used material names
        const matNamesInUse = new Set();
        const materialsToDispose = [];
        materialDefs.forEach(matDef_ => {
            const {_name: matName, _type: matType, ...matDef} = matDef_;
            if(matNamesInUse.has(matName)) {
                throw new Error(`Material name "${matName}" met at least twice for source "${sourceName}"`);
            }
            matNamesInUse.add(matName);
            if(thisSourceMats.hasOwnProperty(matName)) {
                if(_.isEqual(thisSourceMats[matName]['matDef'], matDef)) {
                    console.debug(`Material "${sourceName}/${matName}" unchanged.`);
                    return;  // skip material construction
                }
                //thisSourceMats[matName].threeJSMaterial.dispose(); // todo: is that needed?
                materialsToDispose.push(thisSourceMats[matName].threeJSMaterial);
                // delete thisSourceMats[matName];  // ?
            }
            // otherwise, create material
            const threeJSMaterials = Materials.make_material(matType, matDef, {textureLoader: this._textureLoader});
            thisSourceMats[matName] = {threeJSMaterials, matDef};
            console.debug(`Created material "${sourceName}/${matName}" of type ${matType}`);
        });
        // get materials not used by this source anymore, by
        // comparing material names registered for this source
        // and materials met in this update
        const registeredMatNames = new Set(Object.keys(thisSourceMats));
        const namesToDispose = registeredMatNames.difference(matNamesInUse);
        namesToDispose.forEach(matName => {
            console.debug(`Material "${sourceName}/${matName}" is not used anymore -- queued for disposal.`);
            materialsToDispose.push(thisSourceMats[matName].threeJSMaterial);
        });
        this._materials[sourceName] = thisSourceMats;
        // TODO: treat materialsToDispose
        return thisSourceMats;
    }  // }}}

    resize(width, height) {
        this._defaultMaterials['defaultFatLineMaterial'].resolution.set(width, height);
    }
}

export { MaterialManager };

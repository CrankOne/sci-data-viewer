/*
 * Defines various procedures to implement a dithering-based masks for
 * highlighting selected objects and objects under cursor.
 */

import * as THREE from 'three';
import * as Shaders from './shaders';

//                  * * *   * * *   * * *

// Helper to inspect the mask
function make_texture_dbg_view(texture, size = 0.45, x = -0.7, y = -0.7) {
    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const material = new THREE.MeshBasicMaterial({
        map: texture,
        depthTest: false,
        depthWrite: false,
        transparent: false
    });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(size, size), material);
    quad.position.set(x, y, 0);
    scene.add(quad);
    return {scene, camera, quad, material};
}

//                  * * *   * * *   * * *

export class SilhouetteOverlay {
    // These materials does not depend on a particular overlay item instance
    // and, hence, shared:
    // - white material for highlighted mask render (meshes)
    static meshMaskMaterial = new THREE.ShaderMaterial({
        uniforms: {
            uMin: {value: 0.25},
            uMax: {value: 1.0}
        },
        vertexShader: Shaders.highlight.maskVertexShader,
        fragmentShader: Shaders.highlight.maskFragmentShader,
        side: THREE.DoubleSide,  //THREE.FrontSide,
        depthTest: true,
        depthWrite: true
    });
    // - white material for highlighted mask render (lines)
    static lineMaskMaterial = new THREE.LineBasicMaterial({
        color: 0xffffff,
        depthTest: false,
        depthWrite: false
    });

    constructor(layerID, w, h, hlThreeColor, debugMask=null) {
        this._layerID = layerID;
        this._materials = {};
        // set this to "highlight" or "selected" to see small quad showing the
        // mask
        this._doDebugMask = debugMask;  //'hl-dilate'; //'mask';
        // Instance's own render target for mask
        this._maskRT = new THREE.WebGLRenderTarget(w, h, {
            minFilter: THREE.NearestFilter,
            magFilter: THREE.NearestFilter,
            depthBuffer: true,
            stencilBuffer: false,
            type: THREE.UnsignedByteType
        });
        // Instance's own render target for dilated mask; used to enlarge mask
        // and obtain contour
        this._dilateRT = new THREE.WebGLRenderTarget(w, h, {
            minFilter: THREE.NearestFilter,
            magFilter: THREE.NearestFilter,
            depthBuffer: false
        });
        // special material used to dilate the mask
        this._dilateMaterial = new THREE.ShaderMaterial({
            uniforms: {
                uMask: {value: this._maskRT.texture},
                uInvResolution: {value: new THREE.Vector2(1 / w, 1 / h)},
                uRadius: {value: 2.0} // pixels
            },
            vertexShader: Shaders.highlight.fullscreenVertexShader,
            fragmentShader: Shaders.highlight.dilationFragmentShader,
            depthTest: false,
            depthWrite: false
        });
        // A tmp scene to maintain the dilation step after mask has been
        // computed
        this._dilateScene = new THREE.Scene();
        this._dilateCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
        this._dilateQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this._dilateMaterial);
        this._dilateScene.add(this._dilateQuad);
        // Assets for overlay pass (a final step):
        this._overlayMaterial = new THREE.ShaderMaterial({
            uniforms: {
                uMask: {value: this._maskRT.texture},
                uDilatedMask: {value: this._dilateRT.texture},
                uColor: {value: new THREE.Color(hlThreeColor)},
                uOpacity: {value: 0.15}
            },
            vertexShader: Shaders.highlight.fullscreenVertexShader,
            fragmentShader: Shaders.highlight.overlayFragmentShader,
            transparent: true,
            depthTest: false,
            depthWrite: false
        });
        this._overlayScene = new THREE.Scene();
        this._overlayCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
        this._overlayQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this._overlayMaterial);
        this._overlayScene.add(this._overlayQuad);
    }

    notify_resized(w, h) {
        this._maskRT.setSize(w, h);
        this._dilateRT.setSize(w, h);
        this._dilateMaterial.uniforms.uInvResolution.value.set(1 / w, 1 / h);
    }

    render(renderer, cam, mainScene) {
        this._render_mask(renderer, cam, mainScene);
        if(this._debugMaskView && this._doDebugMask == 'mask') {
            renderer.setRenderTarget(null);
            renderer.autoClear = false;
            renderer.render(this._debugMaskView.scene, this._debugMaskView.camera);
            renderer.autoClear = true;
        }
        this._render_dilated_mask(renderer);
        if(this._debugMaskView && this._doDebugMask == 'dilate') {
            renderer.setRenderTarget(null);
            renderer.autoClear = false;
            renderer.render(this._debugMaskView.scene, this._debugMaskView.camera);
            renderer.autoClear = true;
        }
        this._render_composition_overlay(renderer);
    }

    _render_mask(renderer, cam, mainScene) {
        cam.layers.disableAll();
        cam.layers.enable(this._layerID);
        renderer.setRenderTarget(this._maskRT);
        renderer.setClearColor(0x000000, 1);
        renderer.clear(true, true, true);
        renderer.render(mainScene, cam);
        if(this._doDebugMask) {
            console.log("hl mask updated");
            if(this._doDebugMask == "mask") {
                this._debugMaskView = make_texture_dbg_view(this._maskRT.texture);
            } else if(this._doDebugMask == "dilate") {
                this._debugMaskView = make_texture_dbg_view(this._dilateRT.texture);
                this._debugMaskView.material.map = this._dilateRT.texture;
                this._debugMaskView.material.needsUpdate = true;
            }
        }
        cam.layers.disableAll();
    }

    _render_dilated_mask(renderer) {
        renderer.setRenderTarget(this._dilateRT);
        renderer.setClearColor(0x000000, 1);
        renderer.clear(true, true, true);
        renderer.render(this._dilateScene, this._dilateCamera);
        renderer.setRenderTarget(null);
    }

    _render_composition_overlay(renderer) {
        renderer.setRenderTarget(null);
        renderer.autoClear = false;
        renderer.render(this._overlayScene, this._overlayCamera);
        renderer.autoClear = true;
    }
}

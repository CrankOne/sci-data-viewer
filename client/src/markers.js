import * as THREE from 'three';
import * as Shaders from './shaders';

//
// Marker drawing functions, meant to be used with canvas context
const markerDrawingFunctions = {
    // Hollow circle
    hollowCircle: (sz, ctx) => ctx.arc( sz/2, sz/2, sz/2 - .5, 0, 2*Math.PI ),
    // Circle to be filled
    filledCircle: (sz, ctx) => ctx.arc( sz/2, sz/2, sz/2 -  1, 0, 2*Math.PI ),
    // Rectangle to be filled
    filledRectangle: (sz, ctx) => ctx.fillRect(  .5, .5, sz - .5, sz - .5),
    // Hollow rectangle
    hollowRectangle: (sz, ctx) => ctx.strokeRect(.5, .5, sz - .5, sz - .5),
    // X-like cross, 1-line thin
    xCross: (sz, ctx) => {
        ctx.moveTo(1, 1);
        ctx.lineTo(sz - 2, sz - 2);
        ctx.moveTo(sz - 2, 1);
        ctx.lineTo(1, sz - 2);
    },
    // X-like cross, hollow within
    hollowXCross: (sz, ctx) => {
        ctx.moveTo(.5, sz*.25);
        ctx.lineTo(sz*.25, .5);
        ctx.lineTo(sz*.5-.5, sz*.24);
        ctx.lineTo(sz*.75, .5);
        ctx.lineTo(sz-.5, sz*.25)
        ctx.lineTo(sz*.75, sz*.5);
        ctx.lineTo(sz-.5, sz*.75);
        ctx.lineTo(sz*.75, sz-.5);
        ctx.lineTo(sz*.5, sz*.75);
        ctx.lineTo(sz*.25, sz-.5);
        ctx.lineTo(.5, sz*.75);
        ctx.lineTo(sz*.25, sz*.5);
        ctx.lineTo(.5, sz*.25);
    },
    // 1-line-thin +-like cross
    plusCross: (sz, ctx) => {
        ctx.moveTo(sz/2 - 1 + .5, 1 + .5);
        ctx.lineTo(sz/2 - 1 + .5, sz - 2 + .5);
        ctx.moveTo(1 + .5, sz/2 - 1 + .5);
        ctx.lineTo(sz - 2 + .5, sz/2 - 1 + .5);
    },
    // +-like cross, hollow within
    hollowPlusCross: (sz, ctx) => {
        ctx.moveTo(sz*.33 - .5, sz*.33 + .5);
        ctx.lineTo(sz*.33 - .5, .5);
        ctx.lineTo(sz*.66 + .5, .5);
        ctx.lineTo(sz*.66 + .5, sz*.33 - .5);
        ctx.lineTo(sz-.5,       sz*.33 - .5);
        ctx.lineTo(sz-.5,       sz*.66 + .5);
        ctx.lineTo(sz*.66 + .5, sz*.66 + .5);
        ctx.lineTo(sz*.66 + .5, sz-.5);
        ctx.lineTo(sz*.33 - .5, sz-.5);
        ctx.lineTo(sz*.33 - .5, sz*.66 + .5);
        ctx.lineTo(.5,          sz*.66 + .5);
        ctx.lineTo(.5,          sz*.33 - .5);
        ctx.lineTo(sz*.33 - .5, sz*.33 - .5);
    }
};

function draw_texture( draw_callback, sz, flags ) {
    flags = flags || 0x0;
    const canvas = document.createElement('canvas');
    canvas.width = sz;
    canvas.height = sz;
    const context = canvas.getContext('2d');
    // set black background
    //context.fillStyle   = '#000';
    //context.fillRect(0, 0, sz, sz);
    // draw in white
    context.strokeStyle = "#fff";
    context.fillStyle   = "#fff";
    // draw
    context.beginPath();
    draw_callback(sz, context);

    // finalize drawing -- stroke if need
    if(!(0x1 & flags)) context.stroke();
    // ... -- fill path, if need
    if(0x2 & flags) context.fill();

    // XXX, for debugging
    //const container = document.getElementById('canvasPreviewXXX');
    //container.appendChild(canvas);
    //<< XXX

    return canvas;
}

class MarkerAssets {
    // Constructs instance for certain defaults
    constructor( defaultShape
               , defaultFlags
               , defaultSize ) {
        this._defaults = {
                shape: defaultShape || 'xCross',
                flags: defaultFlags || 0x0,
                size:  defaultSize  || 16,
            };
        this._textureCache = {};
    }
    // Returns tuple of texture lookup key, shape and size
    // (shape and size are set to default vals if not provided by `p')
    complete_texture_lookup_key(p) {
        // lookup for existing marker material of certain shape, flags and size
        if(typeof p === 'string') {
            const rx = /(\w+)(?:-(\d+))?(?:-(\d+))?/;
            const m = p.match(rx);
            if(!m) throw new Error("Marker type string does not match expected pattern");
            p = { shape: m[1]
                , size: parseInt(m[3])
                , flags : parseInt(m[2])
                };
        } else if(!(typeof p === 'object')) {
            throw new Error("Bad argument type for marker type parameter.");
        }
        const shape = p.shape || this._defaults.shape;
        const size  = p.size  || this._defaults.size;
        const flags = p.flags || this._defaults.flags;
        const k = `${shape}-${flags}-${size}`;
        return [k, shape, flags & 0x3, size];
    }
    // Returns "texture catalogue" object defined for certain shape and size;
    // Object has `texture' field referring to canvas object keeping the drawn
    // texture and `materials' field referencing sub-object listing created
    // materials
    get_texture_catalogue(p) {
        let k, shape, flags, size;
        [k, shape, flags, size] = this.complete_texture_lookup_key(p);
        if(k in this._textureCache) return this._textureCache[k];
        this._textureCache[k] = {
                texture: new THREE.Texture(draw_texture( markerDrawingFunctions[shape], size, flags)),
                materials: {}
            }
        this._textureCache[k].texture.needsUpdate = true;  // NOTE: required for some reason...
        return this._textureCache[k]
    }
    // Returns shader-based material for marker
    get_material(p) {
        p = p || {};
        let flags = p.flags || this._defaults.flags;
        flags &= ~0x3;
        const cat = this.get_texture_catalogue(p);
        if(flags in cat.materials) return cat.materials[flags];
        // Create new material otherwise
        cat.materials[flags] = new THREE.ShaderMaterial( {
            uniforms: {
                markerScale: { value: 1.0 },  // TODO: bind control, watcher, etc?
                pointTexture: { type: "t", value: cat.texture },
                //pointTexture: { value: new THREE.TextureLoader().load( 'https://threejs.org/examples/textures/sprites/spark1.png' ) }
                //pointTexture: { value: new THREE.TextureLoader().load( 'textures/sprites/spark1.png' ) }
                // ...
            },
            vertexShader: Shaders.markerPointVertexShader,
            fragmentShader: Shaders.markerPointFragmentShader,

            blending: THREE.AdditiveBlending,
            depthTest: false,
            transparent: true,

            vertexColors: ((flags & 0x4) ? false : true)
        });
        return cat.materials[flags];
    }
}

const markerAssets = new MarkerAssets('xCross', 0x0, 16);  // TODO: -> "xCross"

//
// Shader material for markers
export function get_marker_shader_material(p) {
    return markerAssets.get_material(p);
}

/*
//
// Sprite-based markers (deprecated)

const markers = {
    'whiteCircle-10x10': null,
};

function generate_texture( draw_callback, size ) {
    const canvas = document.createElement('canvas');
    canvas.width = size[0];
    canvas.height = size[1];
    const context = canvas.getContext('2d');
    draw_callback(context, canvas, size);
    return canvas;
}

function generate_canvas_textured_material(draw_callback, size) {
    const texture = new THREE.Texture(generate_texture(draw_callback, size));
    texture.needsUpdate = true;
    // TODO: can we dispose `texture' which is a HTML element here?
    return new THREE.SpriteMaterial({map: texture});
}
//var sprite = new THREE.Sprite(material);

export function get_markers() {
    if(markers['whiteCircle-10x10']) return markers;
    markers['whiteCircle-10x10'] = generate_canvas_textured_material( (ctx, cnv, sz) => {
            ctx.beginPath();
            ctx.arc(sz[0]/2, sz[1]/2, 3, 0, 2 * Math.PI);
            //ctx.fillStyle = 'green';
            ctx.strokeStyle = 'white';
            ctx.stroke();
        }, [10, 10] );
    // ... create other markers
    return markers;
}
*/




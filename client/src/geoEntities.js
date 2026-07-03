import * as THREE from 'three';
import * as Markers from './markers';
import { group_by } from './utils';
import * as Shaders from './shaders';

export function make_material(materialType, materialDefinition, textureLoader) {
    // mesh materials
    if('MeshBasicMaterial' == materialType) {
        console.log(materialDefinition);
        return new THREE.MeshBasicMaterial(materialDefinition);
    }
    if('TexturedMaterial' == materialType) {
        return new THREE.MeshBasicMaterial({ 
            map: textureLoader.load(materialDefinition['texture']),
            side: THREE.DoubleSide  // TODO: flag
        });
    }
    // line materials
    if('LineBasicMaterial' == materialType) {
        return new THREE.LineBasicMaterial(materialDefinition);
    }
    if('LineDashedMaterial' == materialType ) {
        return new THREE.LineDashedMaterial(materialDefinition);
    }
    // custom (shader) materials
    if('ColoredLineShaderMaterial' == materialType) {
        return new THREE.ShaderMaterial( {
            uniforms: {
                u_resolution: {type: 'v2', value: {x: 828, y: 955}},  // TODO: reactive?
                u_dashSize : {type:'f', value: 3.0},
                u_gapSize : {type:'f', value: 5.0},
                u_color : {type: 'v3', value: {x:0.8, y:0.7, z:0.7} }
            },
            vertexShader: Shaders.startPointVertexShader,
            fragmentShader: Shaders.dashedLineFragmentShader,
            vertexColors: true
        });
    }
    if('PointMarkersShaderMaterial' == materialType) {
        return Markers.get_marker_shader_material(materialDefinition);
    }
    // ... other materials
    throw new Error(`Unknown material type "${materialType}"`);
}

export function make_geometry( geoType, material, geoDef ) {
    if('BoxGeometry' == geoType) {
        console.debug(`Creating box geometry of ${geoDef.sizes[0]}x${geoDef.sizes[1]}x${geoDef.sizes[2]}`);
        const geo = new THREE.BoxGeometry(...geoDef.sizes);
        return new THREE.Mesh(geo, material);
    }
    if('Plane' == geoType) {
        const geo = new THREE.PlaneGeometry(...geoDef.sizes);
        return new THREE.Mesh(geo, material);
    }
    if('Line' == geoType ) {
        const refPointVecs = geoDef.points.map((pt) => new THREE.Vector3(...pt));
        const refTrackGeo = new THREE.BufferGeometry().setFromPoints(refPointVecs);
        const line = new THREE.Line(refTrackGeo, material);
        return line;
    }
    if('ColoredLineSegments' == geoType) {
        const geometry = new THREE.BufferGeometry();
        const vxs = geoDef.points.map((vx) => vx[0]).flat();
        geometry.setAttribute('position',
            new THREE.BufferAttribute(new Float32Array(vxs), 3));
        const colors = geoDef.points.map(vx => vx[1]).flat();
        geometry.setAttribute('color',
            new THREE.BufferAttribute(new Float32Array(colors), 3));
        const l = new THREE.Line( geometry, material );
        l.computeLineDistances();
        return l;
    }
    if('PointMarkers' == geoType) {
        const geometry = new THREE.BufferGeometry();
        const positions = [];
        const colors = [];
        const sizes = [];
        geoDef.items.forEach((pt) => {
                positions.push(pt.position);
                colors.push(pt.color);
                sizes.push(pt.size);
            });
        geometry.setAttribute( 'position',  new THREE.Float32BufferAttribute( positions.flat(), 3 ) );
        geometry.setAttribute( 'color',     new THREE.Float32BufferAttribute( colors.flat(), 3 ) );
        geometry.setAttribute( 'size',      new THREE.Float32BufferAttribute( sizes, 1) );
        return new THREE.Points(geometry, material);
    }
    // ... other geometries
    throw new Error(`Unknown material type "${materialType}"`);
}


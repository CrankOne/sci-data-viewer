import * as THREE from 'three';
import * as Markers from './markers';
import { groupBy } from './utils';
import * as Shaders from './shaders';

export const gDrawableEntities = [ 'coloredLineSegments'
                                 , 'pointMarkers'
                                 , 'coloredLines'
                                 //, 'sprites'
                                 //, 'quads'
                                 //, 'meshes
                                 ];

const gMaterials = {
    'baseColoredLineMat': new THREE.LineBasicMaterial({color: 0xffffff,vertexColors: true}),
    // ...
};

class DrawableEntity {
    constructor() {
        this.drawables = Object.fromEntries(gDrawableEntities.map(k => [k, []]));
    }
    append_dynamic_drawables(getters, drawables) {
        gDrawableEntities.forEach(nm => {
                drawables[nm] = drawables[nm].concat(this.drawables[nm]);
            });
    }
}  // class DrawableEntity

class FiniteCoordinateSensitivePlane {  // TODO: extends DrawableEntity?
    // Keeps cardinal vectors for the plane
    constructor(args, getters) {
        // expected parameters are:
        //  o:float[3] -- plane's center
        //  u:float[3] -- plane's measurement vector (local X)
        //  v:float[3] -- plane's reciprocal vector (local Y)
        //  size:float[2] -- sizes (local XxY)
        this.label = args.label;
        this.u = new THREE.Vector3(args.u[0], args.u[1], args.u[2]).normalize().multiplyScalar(args.size[0]);
        this.v = new THREE.Vector3(args.v[0], args.v[1], args.v[2]).normalize().multiplyScalar(args.size[1]);
        this.o = new THREE.Vector3(args.o[0], args.o[1], args.o[2]);
    }
    // Returns array of verteces to draw the finite plane bounding rectangle
    // with X and Y denoted by color
    get_colored_verteces(tm) {
        const u2 = this.u.clone().divideScalar(2)
            , v2 = this.v.clone().divideScalar(2)
            ;
        const lb = this.o.clone().sub(u2).sub(v2)//.applyMatrix3(tm)
            , rt = this.o.clone().add(u2).add(v2)//.applyMatrix3(tm)
            , lt = this.o.clone().sub(u2).add(v2)//.applyMatrix3(tm)
            , rb = this.o.clone().add(u2).sub(v2)//.applyMatrix3(tm)
            ;
        return {
            name: this.label,  // makes object touchable
            data: [
                [lb, [.8,.3,.3]], [rb, [.9,.6,.6]],  // todo: det color from getters
                [lb, [.1,.5,.1]], [lt, [.6,.9,.6]],
                [lt, [.9,.9,.9]], [rt, [.9,.9,.9]],
                [rb, [.9,.9,.9]], [rt, [.9,.9,.9]]
            ]};
    }
    // Uses `lR` from given score data to generate dynamic drawables
    append_dynamic_drawables_from_local_score(dynDrawables, score, getters) {
        if(score.lR[1] === null || Number.isNaN(score.lR[1])) {
            // This is 1D score -- draw a straight line based on the
            // producer basis vector
            const b = this.o.clone().add(this.u.clone().multiplyScalar(score.lR[0] - .5));
            const vUp = b.clone().add(this.v.clone().divideScalar(2));
            const vDn = b.clone().sub(this.v.clone().divideScalar(2));
            const lineDescription = {
                    name: `score[${score["$k"]}@${score["$n"]}]`,
                    data: [[vDn, [.8, .8, .2]]  // todo: hit color from getters
                          ,[vUp, [.8, .8, .2]]]
                };
            dynDrawables.coloredLineSegments.push(lineDescription);
        } else if( score.lR[2] === null || Number.isNaN(score.lR[2]) ) {
            // TODO: This is 2D score -- not yet supported
            console.error("2D score is not supported (todo).");
            return;
        }
    }
}

/* Track score graphical representation generator
 *
 * Constructor accepts the TrackScore as it is provided by NA64sw event + state
 * module getters object. Depending on the data provided in the object, various
 * markers will be added on scene.
 *
 *      - if `gR` has all three coordinates, a cross marker will be
 *        added denoting measured/reconstructed coordinate of the score.
 *      - if `gR` is of lesser dimensionality, a warning is printed to console
 *        since partial `gR` has no particular meaning.
 *      - if `mcTruth.globalPosition` is provided, a small circle marker will
 *        be added denoting MC true intersection point.
 *      - if lR has non-null/nan values corresponding geometry primitive will
 *        be drawn respecting `producer` item constructed with static geometry.
 *      - TODO: uncertainties?
 *      - TODO: track covariation at the point?
 *
 * Markers position and certain dimensions are affected by global
 * transformation matrix.
 *
 * TODO: global / per event / per track / per detector settings & flags shall
 *       control the appearance
 * */
export class TrackScore extends DrawableEntity {
    constructor(scoreID, scoreData, getters) {
        super();
        this._scoreData = scoreData;
        this._evdspID = scoreID;
        if(!((scoreData.gR[0] === null)||(Number.isNaN(scoreData.gR[0])))) {
            // score has global coordinates -- add a cross marker
            this.drawables
                    .pointMarkers
                    .push({ 'pos': scoreData.gR
                          , 'sz': 16
                          , 'color': [.94, .92, .38]
                          , 'type': 'xCross'
                          });
        }
        if(scoreData.hasOwnProperty('$k') && !((scoreData.lR[0] === null)||(Number.isNaN(scoreData.gR[0])))) {
            // score has local coordinate(s) -- try to find out corresponding
            // item among static geometry entries and use its method to produce
            // dynamic drawable
            const producer = getters.staticEntitiesByName[scoreData['$k']];
            if(producer) {
                producer.append_dynamic_drawables_from_local_score( this.drawables
                                                                  , scoreData, getters);
            } // else console.warn(`Failed to find proucer "${label}"; local score not drawn.`);
        }
        if(scoreData.mcTruth && scoreData.mcTruth.globalPosition &&
            !(  (scoreData.mcTruth.globalPosition[0] === null)
             || (Number.isNaN(scoreData.mcTruth.globalPosition[0])))) {
            // score has mc truth point position -- add a circle marker
            this.drawables
                    .pointMarkers
                    .push({ 'pos': scoreData.mcTruth.globalPosition
                          , 'sz': 16
                          , 'color': [.94, .92, .38]
                          , 'type': 'hollowXCross-0-16'
                          , 'name': `score[${scoreData["$k"]}@${scoreData["$n"]}]`,
                          });
        }
    }
}  // class TrackScore

export class Track extends DrawableEntity {
    // `trackPointsArray' is expected to be array of the form:
    //      [[x,y,z], sortPar]
    constructor(trackID, trackPointsArray, getters) {
        super();
        this._trackPoints = trackPointsArray;
        this._trackID = trackID;
        this.drawables.coloredLines
            = [trackPointsArray.sort((a,b) => a[1] - b[1] ).map(
                ([item, _]) => [new THREE.Vector3().fromArray(item), [.6, .9, .5]] )
              ];
        // ...
    }
}  // class Track

const classes = {
        FiniteCoordinateSensitivePlane,
        TrackScore,
        Track
    };

// Export classes dictionary
export function get_class(className) { return classes[className]; };

//
// Drawing functions

export function make_coloredLineSegments(vertecesWithColors, tm) {
    return vertecesWithColors.map(item => {
        const geometry = new THREE.BufferGeometry();
        const vxs = item.data.map(vx => {
                const tv = vx[0].clone().applyMatrix3(tm);
                return [tv.x, tv.y, tv.z];
            } ).flat();
        geometry.setAttribute('position',
            new THREE.BufferAttribute(new Float32Array(vxs), 3));
        const colors = item.data.map(vx =>
                [vx[1][0], vx[1][1], vx[1][2]] ).flat();
        geometry.setAttribute('color',
            new THREE.BufferAttribute(new Float32Array(colors), 3));
        // (re-)calc bounding box for this geometry; we presume this
        // geometry to be tha main sufficient part of the scene to be
        // encompassed by the camera
        geometry.computeBoundingBox();
        const threeObj = new THREE.LineSegments( geometry
                                               , gMaterials.baseColoredLineMat );
        threeObj.name = item.name;
        return { obj: threeObj, geo: geometry};
    });

    //const geometry = new THREE.BufferGeometry();
    //const vxs = vertecesWithColors.flat().map(vx => {
    //        const tv = vx[0].clone().applyMatrix3(tm);
    //        return [tv.x, tv.y, tv.z];
    //    } ).flat();
    //geometry.setAttribute('position',
    //    new THREE.BufferAttribute(new Float32Array(vxs), 3));
    //const colors = vertecesWithColors.flat().map(vx => [vx[1][0], vx[1][1], vx[1][2]] ).flat();
    //geometry.setAttribute('color',
    //    new THREE.BufferAttribute(new Float32Array(colors), 3));
    //// (re-)calc bounding box for this geometry; we presume this
    //// geometry to be tha main sufficient part of the scene to be
    //// encompassed by the camera
    //geometry.computeBoundingBox();
    //const threeObj = new THREE.LineSegments( geometry, material );
    //const material = new THREE.LineBasicMaterial({color: 0xffffff,vertexColors: true});
    //return { obj: threeObj
    //       , geo: geometry
    //       };
}

export function make_coloredLines(lines, tm) {
    return lines.map( vertecesWithColors => {
        const geometry = new THREE.BufferGeometry();
        const vxs = vertecesWithColors.map(vx => {
                const tv = vx[0].clone().applyMatrix3(tm);
                return [tv.x, tv.y, tv.z];
            } ).flat();
        geometry.setAttribute('position',
            new THREE.BufferAttribute(new Float32Array(vxs), 3));
        const colors = vertecesWithColors.map(vx => [vx[1][0], vx[1][1], vx[1][2]] ).flat();
        geometry.setAttribute('color',
            new THREE.BufferAttribute(new Float32Array(colors), 3));

        // (re-)calc bounding box for this geometry; we presume this
        // geometry to be tha main sufficient part of the scene to be
        // encompassed by the camera
        geometry.computeBoundingBox();


        //const material = new THREE.LineDashedMaterial({ color: 0xffffff
        //        , vertexColors: true
        //        , linewidth: 2
        //        , dashSize: .1
        //        , gapSize: .1
        //    });
        // ^^^ TODO: this will draw dashed/dotted mat wrt world; shader-based
        //     mat relative to the camera:
        const material = new THREE.ShaderMaterial( {
            uniforms: {
                u_resolution: {type: 'v2', value: {x: 828, y: 955}},  // TODO: reactive?
                u_dashSize : {type:'f', value: 3.0},
                u_gapSize : {type:'f', value: 5.0},
                u_color : {type: 'v3', value: {x:0.8, y:0.7, z:0.7} }
            },
            vertexShader: Shaders.startPointVertexShader,
            fragmentShader: Shaders.dashedLineFragmentShader,
            //blending: THREE.AdditiveBlending,
            //depthTest: false,
            //transparent: true,
            vertexColors: true  //((flags & 0x4) ? false : true)
        });
        // TODO: ^^^ reusable materials registry, possibly bound to the
        // viewport instance as its size update should trigger some shader
        // uniforms update as well
        const l = new THREE.Line( geometry, material );
        l.computeLineDistances();
        return { obj: l, geo: geometry };
    } );
}

export function make_pointMarkers(pointMarkers, tm) {
    //const tm = getters['view3D/transformationMatrix'];
    // Sort markers by type; each type will have its own material
    const pointMarkersByType = groupBy(pointMarkers, 'type');
    // Iterate over point markers, create spearate point set for every type
    // and assign a separate shader-based point-material for each type
    return Object.entries(pointMarkersByType).map(([typeName, PMs]) => {
        const geometry = new THREE.BufferGeometry();

        const positions = [];
        const colors = [];
        const sizes = [];
        const types = [];

        //const color = new THREE.Color();

        PMs.forEach(el => {
                const c = new THREE.Vector3();
                c.fromArray(el.pos).applyMatrix3(tm);
                //const pos = new THREE.Vector3(el.pos[0], el.pos[1], el.pos[2]);
                //pos.applyMatrix3(tm);
                positions.push([c.x, c.y, c.z]);
                colors.push(el.color);
                sizes.push(el.sz);
                types.push(el.type)
            });

        geometry.setAttribute( 'position', new THREE.Float32BufferAttribute( positions.flat(), 3 ) );
        geometry.setAttribute( 'color', new THREE.Float32BufferAttribute( colors.flat(), 3 ) );
        geometry.setAttribute( 'size',  new THREE.Float32BufferAttribute( sizes, 1) );
        //.setUsage( THREE.DynamicDrawUsage ) );
        //geometry.setAttribute( 'pointType', new THREE. )
        // ... type as custom attribute?

        // To be able to pick up individual points from the array we create a
        // supplementary coordinate index. Raycasting tool, once it finds a
        // reference to the named points set should look for closes point(s)
        // within a named set to yield an individual score name of the form:
        // name: `score[${score["$k"]}@${score["$n"]}]`
        // TODO
        return { obj: new THREE.Points(geometry, Markers.get_marker_shader_material(typeName))
               , geo: geometry };
    });
}


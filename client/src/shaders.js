const markerPointVertexShader = `
attribute float size;
varying vec3 vColor;
void main() {
    vColor = color;
    vec4 mvPosition = modelViewMatrix * vec4( position, 1.0 );
    gl_PointSize = size;
    gl_Position = projectionMatrix * mvPosition;
}`;

const markerPointFragmentShader = `
uniform float markerScale;
uniform sampler2D pointTexture;
varying vec3 vColor;
void main() {
    gl_FragColor  = vec4( vColor, texture2D( pointTexture, gl_PointCoord ).a );
    //gl_FragColor *= texture2D( pointTexture, gl_PointCoord );
}`;

// used to draw dashed/dotted line relative to camera (not the world),
//      see: https://stackoverflow.com/questions/54516794/three-js-uniform-dashed-line-relative-to-camera
const startPointVertexShader=`
flat out vec3 startPos;
out vec3 vertPos;

void main() {
    vec4 pos    = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    gl_Position = pos;
    vertPos     = pos.xyz / pos.w;
    startPos    = vertPos;
}`;
// used to draw dashed/dotted line relative to camera (not the world)
const dashedLineFragmentShader=`
precision highp float;

flat in vec3 startPos;
in vec3 vertPos;

uniform vec3  u_color;
uniform vec2  u_resolution;
uniform float u_dashSize;
uniform float u_gapSize;

void main(){
    vec2  dir  = (vertPos.xy-startPos.xy)*u_resolution/2.0;
    float dist = length(dir);

    if ( fract(dist / (u_dashSize + u_gapSize)) > u_dashSize/(u_dashSize + u_gapSize) )
        discard; 
    gl_FragColor = vec4(u_color.rgb, 1.0);
}`;

export { markerPointVertexShader
       , markerPointFragmentShader
       , startPointVertexShader
       , dashedLineFragmentShader
       };


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

export { markerPointVertexShader
       , markerPointFragmentShader
       };


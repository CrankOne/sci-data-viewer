//
// Dilation

const dilationFragmentShader = `
uniform sampler2D uMask;
uniform vec2 uInvResolution;
uniform float uRadius;
varying vec2 vUv;
void main() {
    float m = 0.0;

    for (int y = -6; y <= 6; ++y) {
        for (int x = -6; x <= 6; ++x) {
            vec2 p = vec2(float(x), float(y));

            if (length(p) <= uRadius) {
                vec2 uv = vUv + p * uInvResolution;
                m = max(m, texture2D(uMask, uv).r);
            }
        }
    }

    gl_FragColor = vec4(m, m, m, 1.0);
}`;

const dilationVertexShader = `
varying vec2 vUv;

void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
}`;

//
// ... unused?

const maskVertexShader = `
precision highp float;
attribute vec3 position;
uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;
void main() {
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const maskFragmentShader = `
precision mediump float;
uniform vec3 uIDColor;
void main() {
    gl_FragColor = vec4(uIDColor, 1.0);
}`;

export { dilationFragmentShader, dilationVertexShader
       , maskVertexShader, maskFragmentShader
       };



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

const fullscreenVertexShader = `
varying vec2 vUv;

void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
}`;

const overlayFragmentShader = `
uniform sampler2D uMask;
uniform vec3 uColor;
uniform float uOpacity;

varying vec2 vUv;

float bayer4(vec2 p) {
    int x = int(mod(p.x, 4.0));
    int y = int(mod(p.y, 4.0));
    int i = y * 4 + x;

    float b[16];
    b[0] = 0.0;   b[1] = 8.0;   b[2] = 2.0;   b[3] = 10.0;
    b[4] = 12.0;  b[5] = 4.0;   b[6] = 14.0;  b[7] = 6.0;
    b[8] = 3.0;   b[9] = 11.0;  b[10] = 1.0;  b[11] = 9.0;
    b[12] = 15.0; b[13] = 7.0;  b[14] = 13.0; b[15] = 5.0;

    return b[i] / 16.0;
}

void main() {
    float m = texture2D(uMask, vUv).r;

    if (m < 0.5)
        discard;

    float d = bayer4(gl_FragCoord.xy);

    if (d > uOpacity)
        discard;

    gl_FragColor = vec4(uColor, 1.0);
}
`;

export { dilationFragmentShader, fullscreenVertexShader
       , overlayFragmentShader
       };



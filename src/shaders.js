export const vertexShader = /* glsl */ `
varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const common = /* glsl */ `
precision highp float;

uniform float uTime;
uniform vec2 uResolution;
uniform vec3 uColorA;
uniform vec3 uColorB;
uniform vec3 uAccent;
uniform float uSpeed;
uniform float uScale;
uniform float uIntensity;
uniform float uContrast;
uniform float uWarp;
uniform float uGlow;
uniform float uSeed;

varying vec2 vUv;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7)) + uSeed) * 43758.5453123);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  mat2 m = mat2(1.6, 1.2, -1.2, 1.6);
  for (int i = 0; i < 6; i++) {
    v += a * noise(p);
    p = m * p;
    a *= 0.5;
  }
  return v;
}

vec2 rotate(vec2 p, float a) {
  float c = cos(a);
  float s = sin(a);
  return mat2(c, -s, s, c) * p;
}

vec3 grade(vec3 color) {
  color = mix(vec3(dot(color, vec3(0.299, 0.587, 0.114))), color, uContrast);
  return pow(max(color * uIntensity, 0.0), vec3(0.92));
}
`;

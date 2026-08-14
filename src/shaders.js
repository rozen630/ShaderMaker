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

export const shaders = {
  aurora: {
    name: "Aurora Drift",
    fragment: common + /* glsl */ `
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * uResolution) / uResolution.y;
  float t = uTime * uSpeed;
  vec2 p = uv * uScale;
  p += uWarp * vec2(fbm(p + t * 0.15), fbm(p - t * 0.11));
  float n = fbm(p + vec2(0.0, t * 0.25));
  float ribbons = sin(p.x * 2.4 + n * 6.0 + t);
  ribbons = smoothstep(0.15, 0.95, 0.55 + 0.45 * ribbons);
  vec3 col = mix(uColorA, uColorB, n);
  col = mix(col, uAccent, ribbons * 0.75);
  float glow = exp(-length(uv) * (1.8 - uGlow * 0.8));
  col += uAccent * glow * (0.25 + uGlow * 0.45);
  gl_FragColor = vec4(grade(col), 1.0);
}
`,
  },
  lava: {
    name: "Molten Core",
    fragment: common + /* glsl */ `
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * uResolution) / uResolution.y;
  float t = uTime * uSpeed;
  vec2 p = rotate(uv * uScale, t * 0.05);
  float n = fbm(p + fbm(p * 1.7 - t * 0.2) * uWarp);
  float cracks = smoothstep(0.38, 0.82, n);
  vec3 col = mix(uColorA, uColorB, cracks);
  col = mix(col, uAccent, pow(cracks, 6.0));
  col += uAccent * pow(n, 8.0) * (0.4 + uGlow);
  gl_FragColor = vec4(grade(col), 1.0);
}
`,
  },
  ocean: {
    name: "Deep Current",
    fragment: common + /* glsl */ `
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * uResolution) / uResolution.y;
  float t = uTime * uSpeed;
  vec2 p = uv * uScale;
  p.x += sin(p.y * 3.0 + t) * 0.12 * uWarp;
  float waves = sin(p.y * 8.0 + t * 1.6 + fbm(p) * 4.0);
  float n = 0.5 + 0.5 * waves;
  vec3 col = mix(uColorA, uColorB, n);
  col += uAccent * smoothstep(0.72, 1.0, n) * uGlow;
  col *= 0.75 + 0.25 * (1.0 - length(uv));
  gl_FragColor = vec4(grade(col), 1.0);
}
`,
  },
  plasma: {
    name: "Plasma Field",
    fragment: common + /* glsl */ `
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * uResolution) / uResolution.y;
  float t = uTime * uSpeed;
  vec2 p = uv * uScale;
  float a = sin(p.x * 3.0 + t);
  float b = sin(length(p * 2.4) - t * 1.4);
  float c = sin(dot(rotate(p, t * 0.2), vec2(1.2, 0.7)) + t);
  float n = 0.5 + 0.5 * (a * b + c) * (0.45 + uWarp * 0.2);
  vec3 col = mix(uColorA, uColorB, n);
  col = mix(col, uAccent, smoothstep(0.6, 1.0, n));
  col += uAccent * pow(n, 5.0) * uGlow;
  gl_FragColor = vec4(grade(col), 1.0);
}
`,
  },
  stars: {
    name: "Starfield",
    fragment: common + /* glsl */ `
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * uResolution) / uResolution.y;
  float t = uTime * uSpeed;
  vec3 col = mix(uColorA, uColorB, 0.5 + 0.5 * uv.y);
  vec2 grid = uv * (48.0 * uScale);
  vec2 id = floor(grid);
  vec2 gv = fract(grid) - 0.5;
  float n = hash(id);
  float twinkle = 0.55 + 0.45 * sin(t * 3.0 + n * 40.0);
  float star = smoothstep(0.18 * uGlow + 0.02, 0.0, length(gv - (n - 0.5) * 0.25));
  col += uAccent * star * twinkle * step(0.82, n);
  float nebula = fbm(uv * uScale + t * 0.03);
  col += mix(uColorB, uAccent, nebula) * nebula * 0.28 * uWarp;
  gl_FragColor = vec4(grade(col), 1.0);
}
`,
  },
  marble: {
    name: "Liquid Marble",
    fragment: common + /* glsl */ `
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * uResolution) / uResolution.y;
  float t = uTime * uSpeed * 0.35;
  vec2 p = rotate(uv * uScale, 0.4) + vec2(t * 0.05, -t * 0.03);
  float n = fbm(p + uWarp * fbm(p * 2.0 + t));
  float veins = smoothstep(0.42, 0.58, abs(sin(n * 12.0)));
  vec3 col = mix(uColorA, uColorB, n);
  col = mix(col, uAccent, 1.0 - veins);
  col += uAccent * (1.0 - veins) * 0.2 * uGlow;
  gl_FragColor = vec4(grade(col), 1.0);
}
`,
  },
  fire: {
    name: "Ember Rise",
    fragment: common + /* glsl */ `
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * uResolution) / uResolution.y;
  float t = uTime * uSpeed;
  vec2 p = uv * vec2(uScale, uScale * 1.4);
  p.y -= t * 0.35;
  p.x += sin(uv.y * 8.0 + t) * 0.08 * uWarp;
  float n = fbm(p + fbm(p * 2.2));
  float flame = smoothstep(0.15, 0.85, n - uv.y * 0.55);
  vec3 col = mix(uColorA, uColorB, flame);
  col = mix(col, uAccent, pow(flame, 3.0));
  col *= 0.25 + flame;
  col += uAccent * pow(flame, 8.0) * uGlow;
  gl_FragColor = vec4(grade(col), 1.0);
}
`,
  },
  neon: {
    name: "Neon City",
    fragment: common + /* glsl */ `
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * uResolution) / uResolution.y;
  float t = uTime * uSpeed;
  vec2 p = uv * uScale;
  float grid = abs(sin(p.x * 18.0)) * abs(sin(p.y * 18.0 - t));
  float scan = 0.5 + 0.5 * sin(uv.y * 80.0 - t * 6.0);
  float n = fbm(p + t * 0.08);
  vec3 col = mix(uColorA, uColorB, n);
  col += uAccent * smoothstep(0.75, 0.95, grid) * (0.4 + uGlow);
  col += uAccent * scan * 0.08 * uWarp;
  col *= 0.8 + 0.2 * (1.0 - length(uv));
  gl_FragColor = vec4(grade(col), 1.0);
}
`,
  },
};

export const presets = {
  aurora: {
    shader: "aurora",
    uColorA: [0.02, 0.05, 0.12],
    uColorB: [0.05, 0.35, 0.38],
    uAccent: [0.45, 0.95, 0.78],
    uSpeed: 0.55,
    uScale: 2.2,
    uIntensity: 1.05,
    uContrast: 1.15,
    uWarp: 1.15,
    uGlow: 0.85,
    uSeed: 11,
  },
  lava: {
    shader: "lava",
    uColorA: [0.08, 0.01, 0.01],
    uColorB: [0.72, 0.16, 0.03],
    uAccent: [1.0, 0.78, 0.18],
    uSpeed: 0.42,
    uScale: 2.6,
    uIntensity: 1.2,
    uContrast: 1.25,
    uWarp: 1.4,
    uGlow: 1.1,
    uSeed: 3,
  },
  ocean: {
    shader: "ocean",
    uColorA: [0.01, 0.05, 0.12],
    uColorB: [0.02, 0.28, 0.42],
    uAccent: [0.45, 0.95, 0.92],
    uSpeed: 0.7,
    uScale: 1.8,
    uIntensity: 1.0,
    uContrast: 1.1,
    uWarp: 1.0,
    uGlow: 0.7,
    uSeed: 21,
  },
  plasma: {
    shader: "plasma",
    uColorA: [0.12, 0.0, 0.22],
    uColorB: [0.08, 0.18, 0.55],
    uAccent: [0.95, 0.35, 0.85],
    uSpeed: 0.85,
    uScale: 2.4,
    uIntensity: 1.15,
    uContrast: 1.2,
    uWarp: 1.3,
    uGlow: 0.95,
    uSeed: 7,
  },
  stars: {
    shader: "stars",
    uColorA: [0.01, 0.02, 0.06],
    uColorB: [0.05, 0.04, 0.14],
    uAccent: [0.85, 0.92, 1.0],
    uSpeed: 0.35,
    uScale: 1.1,
    uIntensity: 1.05,
    uContrast: 1.05,
    uWarp: 0.85,
    uGlow: 1.2,
    uSeed: 42,
  },
  marble: {
    shader: "marble",
    uColorA: [0.78, 0.74, 0.68],
    uColorB: [0.18, 0.2, 0.24],
    uAccent: [0.95, 0.9, 0.82],
    uSpeed: 0.22,
    uScale: 2.0,
    uIntensity: 0.95,
    uContrast: 1.08,
    uWarp: 1.05,
    uGlow: 0.35,
    uSeed: 18,
  },
  fire: {
    shader: "fire",
    uColorA: [0.05, 0.01, 0.02],
    uColorB: [0.85, 0.22, 0.04],
    uAccent: [1.0, 0.86, 0.32],
    uSpeed: 0.9,
    uScale: 2.3,
    uIntensity: 1.18,
    uContrast: 1.22,
    uWarp: 1.15,
    uGlow: 1.05,
    uSeed: 5,
  },
  neon: {
    shader: "neon",
    uColorA: [0.03, 0.01, 0.08],
    uColorB: [0.12, 0.02, 0.22],
    uAccent: [0.2, 0.95, 0.85],
    uSpeed: 0.65,
    uScale: 1.6,
    uIntensity: 1.1,
    uContrast: 1.18,
    uWarp: 0.9,
    uGlow: 1.0,
    uSeed: 29,
  },
};

export const sliderDefs = [
  { key: "uSpeed", label: "速度", min: 0, max: 2, step: 0.01 },
  { key: "uScale", label: "尺度", min: 0.4, max: 5, step: 0.01 },
  { key: "uIntensity", label: "亮度", min: 0.3, max: 2, step: 0.01 },
  { key: "uContrast", label: "对比", min: 0.4, max: 2, step: 0.01 },
  { key: "uWarp", label: "扭曲", min: 0, max: 2.4, step: 0.01 },
  { key: "uGlow", label: "发光", min: 0, max: 2, step: 0.01 },
];

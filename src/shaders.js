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
  return max(color * uIntensity, 0.0);
}

float surfaceHeight(vec2 uv) {
  float t = uTime * uSpeed;
  return fbm(uv * uScale + vec2(t * 0.07, -t * 0.05) + uWarp * fbm(uv * uScale * 1.7));
}
`;

export const shaders = {
  lookdev: {
    name: "PBR Lookdev",
    fragment: common + /* glsl */ `
vec3 lookdevSwatch(int index) {
  if (index == 0) return vec3(0.115, 0.081, 0.053);
  if (index == 1) return vec3(0.392, 0.292, 0.232);
  if (index == 2) return vec3(0.187, 0.244, 0.373);
  if (index == 3) return vec3(0.116, 0.174, 0.070);
  if (index == 4) return vec3(0.323, 0.236, 0.408);
  if (index == 5) return vec3(0.191, 0.426, 0.408);
  if (index == 6) return vec3(0.605, 0.309, 0.051);
  if (index == 7) return vec3(0.087, 0.144, 0.387);
  if (index == 8) return vec3(0.540, 0.137, 0.160);
  if (index == 9) return vec3(0.120, 0.065, 0.155);
  if (index == 10) return vec3(0.353, 0.462, 0.078);
  if (index == 11) return vec3(0.751, 0.474, 0.020);
  if (index == 12) return vec3(0.038, 0.066, 0.298);
  if (index == 13) return vec3(0.099, 0.366, 0.099);
  if (index == 14) return vec3(0.573, 0.077, 0.077);
  if (index == 15) return vec3(0.791, 0.679, 0.018);
  if (index == 16) return vec3(0.392, 0.112, 0.330);
  if (index == 17) return vec3(0.020, 0.286, 0.469);
  if (index == 18) return vec3(0.910, 0.910, 0.895);
  if (index == 19) return vec3(0.580, 0.584, 0.578);
  if (index == 20) return vec3(0.355, 0.356, 0.353);
  if (index == 21) return vec3(0.191, 0.193, 0.193);
  if (index == 22) return vec3(0.089, 0.090, 0.092);
  return vec3(0.031, 0.031, 0.032);
}

void main() {
  vec2 uv = vUv;
  vec3 col = vec3(0.18);

  if (uv.y > 0.22) {
    vec2 grid = vec2(uv.x, (uv.y - 0.22) / 0.78);
    vec2 cell = floor(grid * vec2(6.0, 4.0));
    int index = int(cell.x) + int(3.0 - cell.y) * 6;
    vec2 local = fract(grid * vec2(6.0, 4.0));
    float frame = smoothstep(0.0, 0.03, min(min(local.x, local.y), min(1.0 - local.x, 1.0 - local.y)));
    col = mix(vec3(0.04), lookdevSwatch(index), frame);
  } else if (uv.y > 0.08) {
    float ramp = clamp((uv.x - 0.04) / 0.92, 0.0, 1.0);
    col = vec3(ramp);
  } else {
    col = mix(vec3(0.72), vec3(0.96), smoothstep(0.0, 1.0, uv.x));
  }

  float cross = step(0.497, abs(uv.x - 0.5)) * step(abs(uv.y - 0.61), 0.004);
  cross += step(0.497, abs(uv.y - 0.61)) * step(abs(uv.x - 0.5), 0.004);
  col = mix(col, vec3(0.02), cross);
  gl_FragColor = vec4(col, 1.0);
}
`,
  },
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

export const channelShaders = {
  orm: common + /* glsl */ `
void main() {
  vec2 uv = vUv;
  float ao = 1.0;
  float rough = 1.0;
  float metal = 1.0;

  if (uv.y > 0.22) {
    vec2 grid = vec2(uv.x, (uv.y - 0.22) / 0.78);
    vec2 local = fract(grid * vec2(6.0, 4.0));
    float edge = min(min(local.x, local.y), min(1.0 - local.x, 1.0 - local.y));
    ao = mix(0.72, 1.0, smoothstep(0.0, 0.08, edge));
    rough = 1.0;
    metal = 0.0;
  } else if (uv.y > 0.08) {
    rough = clamp((uv.x - 0.04) / 0.92, 0.0, 1.0);
    metal = 0.0;
    ao = 1.0;
  } else {
    rough = 0.08;
    metal = 1.0;
    ao = 1.0;
  }

  gl_FragColor = vec4(ao, rough, metal, 1.0);
}
`,
  ormFlat: common + /* glsl */ `
void main() {
  gl_FragColor = vec4(1.0, 1.0, 1.0, 1.0);
}
`,
  normal: common + /* glsl */ `
void main() {
  vec2 uv = vUv;
  float texel = 1.0 / max(uResolution.x, 256.0);
  float h = surfaceHeight(uv);
  float hx = surfaceHeight(uv + vec2(texel, 0.0));
  float hy = surfaceHeight(uv + vec2(0.0, texel));
  vec3 n = normalize(vec3((h - hx) * 6.0, (h - hy) * 6.0, 1.0));
  gl_FragColor = vec4(n * 0.5 + 0.5, 1.0);
}
`,
  normalFlat: common + /* glsl */ `
void main() {
  gl_FragColor = vec4(0.5, 0.5, 1.0, 1.0);
}
`,
};

const pbrBase = {
  family: "pbr",
  shape: "cube",
  useMaps: true,
  uMetalness: 0,
  uRoughness: 0.36,
  uEnv: 1.15,
  uEmissive: 0,
  uClearcoat: 0,
  uClearcoatRoughness: 0.22,
  uSheen: 0,
  uSheenRoughness: 0.45,
  uTransmission: 0,
  uIor: 1.5,
  uThickness: 0.5,
  uAnisotropy: 0,
  uNormal: 0,
};

export const presets = {
  lookdev: {
    ...pbrBase,
    shader: "lookdev",
    name: "Lookdev",
    uColorA: [0.18, 0.18, 0.18],
    uColorB: [0.58, 0.58, 0.58],
    uAccent: [0.86, 0.86, 0.88],
    uSpeed: 0.12,
    uScale: 1,
    uIntensity: 1,
    uContrast: 1,
    uWarp: 0,
    uGlow: 0,
    uSeed: 1,
    uMetalness: 1,
    uRoughness: 1,
    uEnv: 1.15,
    uEmissive: 0,
  },
  chrome: {
    ...pbrBase,
    shader: "lookdev",
    name: "铬",
    shape: "sphere",
    useMaps: false,
    uColorA: [0.18, 0.18, 0.19],
    uColorB: [0.91, 0.91, 0.92],
    uAccent: [0.96, 0.96, 0.97],
    uSpeed: 0,
    uScale: 1,
    uIntensity: 1,
    uContrast: 1,
    uWarp: 0,
    uGlow: 0,
    uSeed: 1,
    uMetalness: 1,
    uRoughness: 0.05,
    uEnv: 1.2,
    uEmissive: 0,
  },
  gray: {
    ...pbrBase,
    shader: "lookdev",
    name: "灰",
    shape: "sphere",
    useMaps: false,
    uColorA: [0.08, 0.08, 0.08],
    uColorB: [0.18, 0.18, 0.18],
    uAccent: [0.32, 0.32, 0.32],
    uSpeed: 0,
    uScale: 1,
    uIntensity: 1,
    uContrast: 1,
    uWarp: 0,
    uGlow: 0,
    uSeed: 1,
    uMetalness: 0,
    uRoughness: 0.36,
    uEnv: 1,
    uEmissive: 0,
  },
  gold: {
    ...pbrBase,
    shader: "lookdev",
    name: "金",
    shape: "sphere",
    useMaps: false,
    uColorA: [0.35, 0.16, 0.02],
    uColorB: [1.0, 0.549, 0.09],
    uAccent: [1.0, 0.78, 0.32],
    uSpeed: 0,
    uScale: 1,
    uIntensity: 1,
    uContrast: 1,
    uWarp: 0,
    uGlow: 0,
    uSeed: 1,
    uMetalness: 1,
    uRoughness: 0.18,
    uEnv: 1.15,
    uEmissive: 0,
  },
  glass: {
    ...pbrBase,
    shader: "lookdev",
    name: "玻璃",
    shape: "sphere",
    useMaps: false,
    uColorA: [0.75, 0.86, 0.9],
    uColorB: [0.92, 0.97, 1.0],
    uAccent: [0.75, 0.9, 0.95],
    uSpeed: 0,
    uScale: 1,
    uIntensity: 1,
    uContrast: 1,
    uWarp: 0,
    uGlow: 0,
    uSeed: 1,
    uMetalness: 0,
    uRoughness: 0.04,
    uEnv: 1,
    uEmissive: 0,
    uTransmission: 1,
    uIor: 1.5,
    uThickness: 0.55,
    uClearcoat: 1,
    uClearcoatRoughness: 0.02,
  },
  aurora: {
    ...pbrBase,
    family: "shader",
    shader: "aurora",
    name: "极光",
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
    uMetalness: 0.08,
    uRoughness: 0.42,
    uEnv: 1.05,
    uEmissive: 0.18,
    uNormal: 0.28,
  },
  lava: {
    ...pbrBase,
    family: "shader",
    shader: "lava",
    name: "岩浆",
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
    uMetalness: 0.22,
    uRoughness: 0.52,
    uEnv: 0.9,
    uEmissive: 0.42,
    uNormal: 0.45,
  },
  ocean: {
    ...pbrBase,
    family: "shader",
    shader: "ocean",
    name: "海洋",
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
    uMetalness: 0.38,
    uRoughness: 0.22,
    uEnv: 1.2,
    uEmissive: 0.08,
    uClearcoat: 0.35,
    uClearcoatRoughness: 0.12,
    uNormal: 0.4,
  },
  plasma: {
    ...pbrBase,
    family: "shader",
    shader: "plasma",
    name: "等离子",
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
    uMetalness: 0.58,
    uRoughness: 0.2,
    uEnv: 1.25,
    uEmissive: 0.28,
    uAnisotropy: 0.35,
    uNormal: 0.22,
  },
  stars: {
    ...pbrBase,
    family: "shader",
    shader: "stars",
    name: "星空",
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
    uMetalness: 0.04,
    uRoughness: 0.62,
    uEnv: 0.85,
    uEmissive: 0.22,
    uNormal: 0.08,
  },
  marble: {
    ...pbrBase,
    family: "shader",
    shader: "marble",
    name: "大理石",
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
    uMetalness: 0.02,
    uRoughness: 0.16,
    uEnv: 1.35,
    uEmissive: 0,
    uClearcoat: 0.55,
    uClearcoatRoughness: 0.08,
    uNormal: 0.32,
  },
  fire: {
    ...pbrBase,
    family: "shader",
    shader: "fire",
    name: "火焰",
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
    uMetalness: 0.12,
    uRoughness: 0.48,
    uEnv: 0.95,
    uEmissive: 0.48,
    uNormal: 0.38,
  },
  neon: {
    ...pbrBase,
    family: "shader",
    shader: "neon",
    name: "霓虹",
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
    uMetalness: 0.72,
    uRoughness: 0.18,
    uEnv: 1.3,
    uEmissive: 0.32,
    uAnisotropy: 0.55,
    uClearcoat: 0.2,
    uNormal: 0.18,
  },
};

export const sliderGroups = [
  {
    id: "shader",
    label: "Shader",
    items: [
      { key: "uSpeed", label: "速度", min: 0, max: 2, step: 0.01 },
      { key: "uScale", label: "尺度", min: 0.4, max: 5, step: 0.01 },
      { key: "uIntensity", label: "亮度", min: 0.3, max: 2, step: 0.01 },
      { key: "uContrast", label: "对比", min: 0.4, max: 2, step: 0.01 },
      { key: "uWarp", label: "扭曲", min: 0, max: 2.4, step: 0.01 },
      { key: "uGlow", label: "发光", min: 0, max: 2, step: 0.01 },
    ],
  },
  {
    id: "pbr",
    label: "PBR",
    items: [
      { key: "uMetalness", label: "金属度", min: 0, max: 1, step: 0.01 },
      { key: "uRoughness", label: "粗糙度", min: 0, max: 1, step: 0.01 },
      { key: "uEnv", label: "环境光", min: 0, max: 2.4, step: 0.01 },
      { key: "uEmissive", label: "自发光", min: 0, max: 2, step: 0.01 },
      { key: "uNormal", label: "法线", min: 0, max: 2, step: 0.01 },
      { key: "uClearcoat", label: "清漆", min: 0, max: 1, step: 0.01 },
      { key: "uClearcoatRoughness", label: "清漆粗糙", min: 0, max: 1, step: 0.01 },
      { key: "uSheen", label: "织物光泽", min: 0, max: 1, step: 0.01 },
      { key: "uTransmission", label: "透射", min: 0, max: 1, step: 0.01 },
      { key: "uIor", label: "折射率", min: 1, max: 2.33, step: 0.01 },
      { key: "uAnisotropy", label: "各向异性", min: 0, max: 1, step: 0.01 },
    ],
  },
];

export const sliderDefs = sliderGroups.flatMap((group) => group.items);

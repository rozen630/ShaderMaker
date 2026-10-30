import { tileableGlsl } from "./vendor/tileable-shaders.js";

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
uniform float uTimeScale;

varying vec2 vUv;

// 动画时间：速度 1 = 这个 Shader 的自然速度（uTimeScale 来自 timeScales）
float shaderTime() {
  return uTime * uSpeed * uTimeScale;
}

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
  float t = shaderTime();
  return fbm(uv * uScale + vec2(t * 0.07, -t * 0.05) + uWarp * fbm(uv * uScale * 1.7));
}

// x = 到最近细胞中心的距离，y = 到细胞边界的近似距离 (F2 - F1)，z = 细胞随机 id
vec3 voronoi(vec2 p, float t) {
  vec2 n = floor(p);
  vec2 f = fract(p);
  float d1 = 8.0;
  float d2 = 8.0;
  float id = 0.0;
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 g = vec2(float(i), float(j));
      vec2 o = vec2(hash(n + g), hash(n + g + 17.31));
      o = 0.5 + 0.45 * sin(t + 6.2831 * o);
      float d = length(g + o - f);
      if (d < d1) {
        d2 = d1;
        d1 = d;
        id = hash(n + g + 3.7);
      } else if (d < d2) {
        d2 = d;
      }
    }
  }
  return vec3(d1, d2 - d1, id);
}
`;

const surfaceContract = /* glsl */ `
struct SurfaceData {
  vec3 baseColor;
  vec3 emissive;
  float ao;
  float roughness;
  float metalness;
  float height;
};
`;

// 可平铺库（src/vendor/tileable-shaders.js）的辅助：格数必须是整数，贴图在 [0, 1] 内才无缝平铺。
// 动画速度对齐老 Shader：t = shaderTime()，图案平移每秒约 0.01–0.05 个贴图宽，相位 / 脉冲约 t * 0.1–1.0；
// 时间不要加进哈希种子（seed、seeds），哈希对连续输入是乱跳的，会逐帧闪烁
const tileable = tileableGlsl + /* glsl */ `
vec2 tiles(float base) {
  return vec2(max(2.0, floor(base * uScale + 0.5)));
}

vec3 spectrum(float t) {
  return 0.5 + 0.5 * cos(6.2831 * (t + vec3(0.0, 0.33, 0.67)));
}

// 错缝砌砖（行数取偶数才能平铺）：x = 到砖边的距离（贴图 UV 单位，0 = 灰缝中心），y = 砖的随机 id，zw = 砖内局部坐标 0..1
vec4 bricks(vec2 uv, vec2 count) {
  count = vec2(count.x, 2.0 * floor(count.y * 0.5 + 0.5));
  vec2 g = uv * count;
  float row = floor(g.y);
  g.x += mod(row, 2.0) * 0.5;
  vec2 cell = floor(g);
  vec2 f = fract(g);
  vec2 edge = min(f, 1.0 - f) / count;
  return vec4(min(edge.x, edge.y), hash1D(mod(cell, count) + uSeed), f);
}

// 倒角轮廓：灰缝里 0，砖面 1，中间是圆滑的倒角
float bevel(float edgeDistance, float mortar, float width) {
  return smoothstep(mortar, mortar + width, edgeDistance);
}
`;

// options.tileable：带上可平铺库（新版 Shader 都用它，旧的保持原样）
function makeSurfaceShader(name, definition, options = {}) {
  const source = common + (options.tileable ? tileable : "") + surfaceContract + definition;
  return {
    name,
    kind: "surface",
    fragment: source + /* glsl */ `
void main() {
  SurfaceData surface = sampleSurface(vUv);
  gl_FragColor = vec4(grade(surface.baseColor), 1.0);
}
`,
    channels: {
      orm: source + /* glsl */ `
void main() {
  SurfaceData surface = sampleSurface(vUv);
  gl_FragColor = vec4(
    clamp(surface.ao, 0.0, 1.0),
    clamp(surface.roughness, 0.04, 1.0),
    clamp(surface.metalness, 0.0, 1.0),
    // alpha = 高度（-1..1 映射到 0..1），给置换用（materialFx.js 的 uDisplace）
    clamp(surface.height * 0.5 + 0.5, 0.0, 1.0)
  );
}
`,
      normal: source + /* glsl */ `
void main() {
  float texel = 1.0 / max(uResolution.x, 256.0);
  float height = sampleSurface(vUv).height;
  float heightX = sampleSurface(vUv + vec2(texel, 0.0)).height;
  float heightY = sampleSurface(vUv + vec2(0.0, texel)).height;
  vec3 normal = normalize(vec3((height - heightX) * 8.0, (height - heightY) * 8.0, 1.0));
  gl_FragColor = vec4(normal * 0.5 + 0.5, 1.0);
}
`,
      emissive: source + /* glsl */ `
void main() {
  SurfaceData surface = sampleSurface(vUv);
  gl_FragColor = vec4(grade(surface.emissive), 1.0);
}
`,
    },
  };
}

// VFX：自发光特效，只输出 Base Color（也作为自发光贴图）
function makeVfxShader(name, body) {
  return { name, fragment: common + tileable + body };
}

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
  float t = shaderTime();
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
  lava: makeSurfaceShader("Molten Core", /* glsl */ `
SurfaceData sampleSurface(vec2 inputUv) {
  vec2 uv = inputUv - 0.5;
  float t = shaderTime();
  vec2 p = rotate(uv * uScale, t * 0.05);
  float n = fbm(p + fbm(p * 1.7 - t * 0.2) * uWarp);
  float heat = smoothstep(0.38, 0.82, n);
  float fissures = pow(heat, 5.0);
  SurfaceData surface;
  surface.baseColor = mix(uColorA, uColorB, heat);
  surface.baseColor = mix(surface.baseColor, uAccent, fissures * 0.72);
  surface.emissive = uAccent * fissures * (0.35 + uGlow * 0.75);
  surface.ao = mix(0.68, 1.0, heat);
  surface.roughness = mix(1.0, 0.58, heat);
  surface.metalness = mix(0.04, 0.1, heat);
  surface.height = n * 0.72 - fissures * 0.28;
  return surface;
}
`),
  ocean: makeSurfaceShader("Deep Current", /* glsl */ `
SurfaceData sampleSurface(vec2 inputUv) {
  vec2 uv = inputUv - 0.5;
  float t = shaderTime();
  vec2 p = uv * uScale;
  p.x += sin(p.y * 3.0 + t) * 0.12 * uWarp;
  float waves = sin(p.y * 8.0 + t * 1.6 + fbm(p) * 4.0);
  float n = 0.5 + 0.5 * waves;
  float crest = smoothstep(0.72, 1.0, n);
  SurfaceData surface;
  surface.baseColor = mix(uColorA, uColorB, n);
  surface.baseColor += uAccent * crest * 0.28;
  surface.baseColor *= 0.75 + 0.25 * (1.0 - length(uv));
  surface.emissive = uAccent * crest * uGlow * 0.08;
  surface.ao = mix(0.88, 1.0, n);
  surface.roughness = mix(1.0, 0.62, crest);
  surface.metalness = 0.0;
  surface.height = n;
  return surface;
}
`),
  plasma: {
    name: "Plasma Field",
    fragment: common + /* glsl */ `
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * uResolution) / uResolution.y;
  float t = shaderTime();
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
  float t = shaderTime();
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
  marble: makeSurfaceShader("Liquid Marble", /* glsl */ `
SurfaceData sampleSurface(vec2 inputUv) {
  vec2 uv = inputUv - 0.5;
  float t = shaderTime() * 0.35;
  vec2 p = rotate(uv * uScale, 0.4) + vec2(t * 0.05, -t * 0.03);
  float n = fbm(p + uWarp * fbm(p * 2.0 + t));
  float veins = smoothstep(0.42, 0.58, abs(sin(n * 12.0)));
  float veinMask = 1.0 - veins;
  SurfaceData surface;
  surface.baseColor = mix(uColorA, uColorB, n);
  surface.baseColor = mix(surface.baseColor, uAccent, veinMask);
  surface.emissive = vec3(0.0);
  surface.ao = mix(0.86, 1.0, veins);
  surface.roughness = mix(0.68, 1.0, veins);
  surface.metalness = 0.0;
  surface.height = n * 0.35 + veinMask * 0.16;
  return surface;
}
`),
  fire: {
    name: "Ember Rise",
    fragment: common + /* glsl */ `
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * uResolution) / uResolution.y;
  float t = shaderTime();
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
  float t = shaderTime();
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
  wood: makeSurfaceShader("Oak Planks", /* glsl */ `
SurfaceData sampleSurface(vec2 inputUv) {
  vec2 p = inputUv * uScale;
  float row = floor(p.y * 2.0);
  vec2 local = vec2(p.x + hash(vec2(row, 3.0)) * 7.0, fract(p.y * 2.0));
  float seam = smoothstep(0.0, 0.035, local.y) * smoothstep(1.0, 0.965, local.y);
  vec2 q = vec2(local.x * 0.7, local.y * 0.5 + row * 3.1);
  float bend = fbm(q * vec2(1.3, 2.4) + shaderTime() * 0.05) * (0.6 + uWarp);
  float rings = fract((q.y + bend) * 6.0);
  float late = smoothstep(0.55, 0.95, rings);
  float fiber = noise(vec2(local.x * 3.0, local.y * 90.0 + row * 17.0));
  float grain = late * 0.75 + fiber * 0.25;
  SurfaceData surface;
  surface.baseColor = mix(uColorB, uColorA, grain);
  surface.baseColor = mix(surface.baseColor, uAccent, smoothstep(0.7, 1.0, fbm(q * 3.0)) * 0.25);
  surface.baseColor *= mix(0.35, 1.0, seam);
  surface.emissive = vec3(0.0);
  surface.ao = mix(0.45, 1.0, seam);
  surface.roughness = mix(0.55, 0.85, grain);
  surface.metalness = 0.0;
  surface.height = seam * 0.6 + (1.0 - late) * 0.12 + fiber * 0.06;
  return surface;
}
`),
  rust: makeSurfaceShader("Corroded Iron", /* glsl */ `
SurfaceData sampleSurface(vec2 inputUv) {
  vec2 p = inputUv * uScale * 2.0;
  float t = shaderTime() * 0.05;
  float n = fbm(p + uWarp * fbm(p * 1.9 + t));
  float rust = smoothstep(0.42, 0.62, n);
  float pits = smoothstep(0.6, 0.8, fbm(p * 6.0 + 4.0));
  float streak = fbm(vec2(p.x * 6.0, p.y * 0.6));
  vec3 metal = mix(uAccent * 0.7, uAccent, streak);
  vec3 oxide = mix(uColorA, uColorB, fbm(p * 4.0));
  SurfaceData surface;
  surface.baseColor = mix(metal, oxide, rust);
  surface.emissive = vec3(0.0);
  surface.ao = 1.0 - pits * 0.45 * rust;
  surface.roughness = mix(0.26 + streak * 0.14, 0.94, rust);
  surface.metalness = mix(1.0, 0.04, rust);
  surface.height = rust * 0.25 - pits * 0.2 * rust + fbm(p * 8.0) * 0.08 * rust;
  return surface;
}
`),
  scifi: makeSurfaceShader("Sci-Fi Panel", /* glsl */ `
SurfaceData sampleSurface(vec2 inputUv) {
  vec2 p = inputUv * uScale * 2.0;
  vec2 cell = floor(p);
  vec2 f = fract(p);
  float r = hash(cell);
  if (r > 0.55) {
    cell = cell * 2.0 + floor(f * 2.0);
    f = fract(f * 2.0);
    r = hash(cell + 7.0);
  }
  float edge = min(min(f.x, f.y), min(1.0 - f.x, 1.0 - f.y));
  float groove = smoothstep(0.015, 0.045, edge);
  float bevel = smoothstep(0.045, 0.1, edge);
  float pulse = 0.5 + 0.5 * sin(shaderTime() * 2.0 + r * 30.0);
  vec2 c = f - 0.5;
  float bolt = smoothstep(0.035, 0.02, length(abs(c) - 0.4));
  float seamLight = (1.0 - smoothstep(0.0, 0.02, edge)) * step(0.7, r);
  float stripe = step(0.86, r) * step(abs(c.y), 0.05) * step(abs(c.x), 0.34);
  float glowMask = max(seamLight, stripe) * (0.55 + 0.45 * pulse);
  vec3 panel = mix(uColorA, uColorB, 0.35 + 0.4 * r);
  panel *= 0.85 + 0.15 * fbm(p * 5.0);
  SurfaceData surface;
  surface.baseColor = mix(panel * 0.3, panel, groove);
  surface.baseColor = mix(surface.baseColor, uColorB * 1.2, bolt);
  surface.baseColor = mix(surface.baseColor, uAccent, glowMask);
  surface.emissive = uAccent * glowMask * (0.5 + uGlow);
  surface.ao = mix(0.35, 1.0, groove);
  surface.roughness = mix(0.6, 0.3 + 0.25 * fbm(p * 9.0), groove);
  surface.metalness = mix(0.4, 0.92, step(0.3, r)) * (1.0 - glowMask);
  surface.height = groove * 0.4 + bevel * 0.2 + bolt * 0.15 - stripe * 0.1;
  return surface;
}
`),
  carbon: makeSurfaceShader("Carbon Weave", /* glsl */ `
SurfaceData sampleSurface(vec2 inputUv) {
  vec2 p = inputUv * uScale * 12.0;
  vec2 cell = floor(p);
  vec2 f = fract(p);
  float checker = mod(cell.x + cell.y, 2.0);
  float across = checker < 0.5 ? f.y : f.x;
  float tow = sin(across * 3.14159);
  float fibers = 0.5 + 0.5 * sin(across * 3.14159 * 14.0 + noise(p * 3.0) * uWarp);
  float shade = tow * (0.75 + 0.25 * fibers);
  SurfaceData surface;
  surface.baseColor = mix(uColorA, uColorB, shade * (0.55 + 0.45 * checker));
  surface.baseColor = mix(surface.baseColor, uAccent, pow(shade, 6.0) * 0.25);
  surface.emissive = vec3(0.0);
  surface.ao = mix(0.55, 1.0, tow);
  surface.roughness = mix(0.55, 0.3, tow);
  surface.metalness = 0.0;
  surface.height = tow * 0.5 + fibers * 0.04;
  return surface;
}
`),
  rock: makeSurfaceShader("Weathered Rock", /* glsl */ `
SurfaceData sampleSurface(vec2 inputUv) {
  vec2 p = inputUv * uScale * 3.0;
  p += uWarp * 0.35 * vec2(fbm(p * 0.8), fbm(p * 0.8 + 5.2));
  vec3 v = voronoi(p, 0.0);
  float crack = 1.0 - smoothstep(0.0, 0.08, v.y);
  float detail = fbm(p * 4.0);
  float strata = fbm(p * vec2(0.6, 3.0));
  vec3 stone = mix(uColorA, uColorB, 0.35 + 0.5 * v.z);
  stone = mix(stone, uAccent, smoothstep(0.55, 0.8, strata) * 0.35);
  stone *= 0.8 + 0.35 * detail;
  SurfaceData surface;
  surface.baseColor = mix(stone, stone * 0.25, crack);
  surface.emissive = uAccent * crack * max(uGlow - 1.0, 0.0);
  surface.ao = mix(1.0, 0.3, crack) * (0.85 + 0.15 * detail);
  surface.roughness = 0.72 + 0.28 * detail;
  surface.metalness = 0.0;
  surface.height = (1.0 - crack) * 0.5 + detail * 0.2 - v.x * 0.15;
  return surface;
}
`),
  hammered: makeSurfaceShader("Hammered Metal", /* glsl */ `
SurfaceData sampleSurface(vec2 inputUv) {
  vec2 p = inputUv * uScale * 6.0;
  p += uWarp * 0.2 * vec2(noise(p * 0.7), noise(p * 0.7 + 3.1));
  vec3 v = voronoi(p, 0.0);
  float rim = 1.0 - smoothstep(0.0, 0.06, v.y);
  float smudge = fbm(p * 0.6);
  SurfaceData surface;
  surface.baseColor = mix(uColorB, uAccent, v.z * 0.35 + smudge * 0.2);
  surface.baseColor = mix(surface.baseColor, uColorA, smoothstep(0.55, 0.9, smudge) * 0.5);
  surface.emissive = vec3(0.0);
  surface.ao = 1.0 - rim * 0.2;
  surface.roughness = 0.16 + 0.2 * smudge + rim * 0.15;
  surface.metalness = 1.0;
  surface.height = v.x * v.x * 0.9;
  return surface;
}
`),
  tiles: makeSurfaceShader("Glazed Tiles", /* glsl */ `
SurfaceData sampleSurface(vec2 inputUv) {
  vec2 p = inputUv * uScale * 3.0;
  p.x += step(1.0, mod(floor(p.y), 2.0)) * 0.5 * uWarp;
  vec2 cell = floor(p);
  vec2 f = fract(p);
  float edge = min(min(f.x, f.y), min(1.0 - f.x, 1.0 - f.y));
  float grout = 1.0 - smoothstep(0.03, 0.05, edge);
  float bevel = smoothstep(0.05, 0.12, edge);
  float r = hash(cell);
  vec3 tile = mix(uColorB, uAccent, step(0.78, r) * 0.65 + r * 0.12);
  tile *= 0.92 + 0.08 * fbm(p * 6.0);
  SurfaceData surface;
  surface.baseColor = mix(tile, uColorA, grout);
  surface.emissive = vec3(0.0);
  surface.ao = mix(0.5, 1.0, bevel);
  surface.roughness = mix(0.92, 0.1 + 0.1 * fbm(p * 10.0), 1.0 - grout);
  surface.metalness = 0.0;
  surface.height = (1.0 - grout) * 0.4 + bevel * 0.2 + fbm(p * 14.0) * 0.02;
  return surface;
}
`),
  caustics: {
    name: "Caustics",
    fragment: common + /* glsl */ `
void main() {
  float t = shaderTime() + 23.0;
  vec2 p = mod(vUv * uScale * 6.2831, 6.2831) - 250.0;
  vec2 i = p;
  float c = 1.0;
  float inten = 0.005 * (0.6 + uWarp * 0.4);
  for (int n = 0; n < 5; n++) {
    float tt = t * (1.0 - (3.5 / float(n + 1)));
    i = p + vec2(cos(tt - i.x) + sin(tt + i.y), sin(tt - i.y) + cos(tt + i.x));
    c += 1.0 / length(vec2(p.x / (sin(i.x + tt) / inten), p.y / (cos(i.y + tt) / inten)));
  }
  c /= 5.0;
  c = 1.17 - pow(c, 1.4);
  float light = clamp(pow(abs(c), 8.0), 0.0, 1.6);
  vec3 col = mix(uColorA, uColorB, 0.35 + 0.65 * vUv.y);
  col += uAccent * light * (0.55 + uGlow * 0.6);
  gl_FragColor = vec4(grade(col), 1.0);
}
`,
  },
  hologram: {
    name: "Hologram",
    fragment: common + /* glsl */ `
void main() {
  vec2 uv = vUv;
  float t = shaderTime();
  float block = floor(uv.y * 18.0);
  float glitch = step(0.94, hash(vec2(block, floor(t * 7.0))));
  uv.x += glitch * (hash(vec2(block, 9.0)) - 0.5) * 0.08 * uWarp;
  vec2 p = uv * uScale * 8.0;
  vec2 r = vec2(1.0, 1.7320508);
  vec2 a = mod(p, r) - r * 0.5;
  vec2 b = mod(p - r * 0.5, r) - r * 0.5;
  vec2 g = dot(a, a) < dot(b, b) ? a : b;
  vec2 ag = abs(g);
  float hexDist = max(dot(ag, vec2(0.5, 0.8660254)), ag.x);
  float line = smoothstep(0.07, 0.0, 0.5 - hexDist);
  float scan = 0.5 + 0.5 * sin(uv.y * 260.0 - t * 8.0);
  float sweep = exp(-pow((fract(uv.y - t * 0.2) - 0.5) * 10.0, 2.0));
  float flicker = 0.88 + 0.12 * sin(t * 37.0) * sin(t * 13.0);
  float n = fbm(p * 0.25 + t * 0.2);
  vec3 col = uColorA + uColorB * n * 0.6;
  col += uAccent * line * (0.45 + uGlow * 0.55);
  col += uAccent * sweep * 0.55 * uGlow;
  col *= (0.72 + 0.28 * scan) * flicker;
  gl_FragColor = vec4(grade(col), 1.0);
}
`,
  },
  vortex: {
    name: "Portal Vortex",
    fragment: common + /* glsl */ `
void main() {
  vec2 uv = vUv - 0.5;
  float t = shaderTime();
  float r = length(uv);
  float a = atan(uv.y, uv.x);
  float swirl = a + uWarp * 2.2 / (r + 0.15) - t * 1.2;
  vec2 ring = vec2(cos(swirl), sin(swirl));
  float n = fbm(ring * 1.6 + vec2(r * uScale * 3.0 - t * 0.6, 0.0));
  float arms = 0.5 + 0.5 * sin(swirl * 3.0 + n * 4.0);
  float energy = arms * n;
  vec3 col = mix(uColorA, uColorB, smoothstep(0.1, 0.6, energy));
  col = mix(col, uAccent, pow(clamp(energy * 1.6, 0.0, 1.0), 3.0));
  col *= smoothstep(0.52, 0.12, r);
  col += uAccent * exp(-r * 9.0) * uGlow;
  col += uColorB * smoothstep(0.03, 0.0, abs(r - 0.42)) * 0.6 * uGlow;
  gl_FragColor = vec4(grade(col), 1.0);
}
`,
  },
  rain: {
    name: "Digital Rain",
    fragment: common + /* glsl */ `
void main() {
  vec2 uv = vUv;
  float t = shaderTime();
  float cols = floor(22.0 * uScale);
  vec2 grid = vec2(uv.x * cols, uv.y * cols * 1.4);
  vec2 cell = floor(grid);
  vec2 f = fract(grid);
  float colSeed = hash(vec2(cell.x, 0.0));
  float speed = 0.6 + colSeed * 1.4;
  float headY = 1.0 - fract(t * speed * 0.2 + colSeed * 7.0);
  float y = (cell.y + 0.5) / (cols * 1.4);
  float dist = y - headY;
  float trail = step(0.0, dist) * exp(-dist * (7.0 - uWarp * 2.0));
  float glyphTime = floor(t * 6.0 * (0.3 + hash(cell)));
  vec2 gp = floor(f * vec2(3.0, 5.0));
  float bit = step(0.45, hash(cell * 1.7 + gp * 13.1 + glyphTime));
  float inside = step(0.15, f.x) * step(f.x, 0.85) * step(0.1, f.y) * step(f.y, 0.9);
  float glyph = bit * inside;
  float head = smoothstep(1.2 / (cols * 1.4), 0.0, abs(dist));
  vec3 col = uColorA;
  col += uColorB * glyph * trail;
  col += uAccent * glyph * head * (1.0 + uGlow);
  gl_FragColor = vec4(grade(col), 1.0);
}
`,
  },
  cells: {
    name: "Living Cells",
    fragment: common + /* glsl */ `
void main() {
  vec2 p = vUv * uScale * 4.0;
  p += uWarp * 0.3 * vec2(fbm(p + shaderTime() * 0.2), fbm(p - 3.7));
  vec3 v = voronoi(p, shaderTime());
  float membrane = 1.0 - smoothstep(0.0, 0.08 + uGlow * 0.04, v.y);
  float nucleus = smoothstep(0.2, 0.06, v.x);
  vec3 col = mix(uColorA, uColorB, v.z * 0.7 + v.x * 0.3);
  col += uAccent * membrane * (0.45 + uGlow * 0.5);
  col += mix(uColorB, uAccent, v.z) * nucleus * 0.5;
  gl_FragColor = vec4(grade(col), 1.0);
}
`,
  },

  // ---------- 以下基于可平铺库（tuxalin/procedural-tileable-shaders，MIT） ----------
  kintsugi: makeSurfaceShader("Kintsugi", /* glsl */ `
SurfaceData sampleSurface(vec2 uv) {
  float t = shaderTime();
  vec3 c = cracks(uv, tiles(3.0), 0.85, 0.018 + 0.012 * uGlow, 0.015, 0.35 + uWarp * 0.4, 2.0, true, t * 0.2, uSeed);
  float vein = 1.0 - c.x;
  float glaze = fbm(uv, tiles(4.0), 5, 0.0, t * 0.05, 0.5, 2.0, 0.0, uSeed);
  SurfaceData surface;
  vec3 ceramic = mix(uColorA, uColorB, smoothstep(0.25, 0.85, glaze));
  surface.baseColor = mix(ceramic, uAccent, vein);
  surface.emissive = uAccent * vein * 0.12 * uGlow;
  surface.ao = 1.0 - vein * 0.15;
  surface.roughness = mix(0.1 + glaze * 0.12, 0.24, vein);
  surface.metalness = vein;
  surface.height = vein * 0.28 + glaze * 0.04;
  return surface;
}
`, { tileable: true }),
  crackedLava: makeSurfaceShader("Cracked Magma", /* glsl */ `
SurfaceData sampleSurface(vec2 uv) {
  float t = shaderTime();
  vec3 c = cracks(uv, tiles(4.0), 1.0, 0.05 + 0.04 * uGlow, 0.07, 0.5 + uWarp * 0.5, 2.0, true, t * 0.12, uSeed);
  float line = 1.0 - c.x;
  float crust = fbm(uv, tiles(6.0), 5, 0.0, 0.0, 0.55, 2.0, 0.0, uSeed);
  float pulse = 0.6 + 0.4 * sin(t * 0.8 + hash1D(c.yz) * 6.2831);
  vec3 hot = mix(uColorB, uAccent, line * pulse);
  SurfaceData surface;
  surface.baseColor = mix(uColorA * (0.55 + crust * 0.7), hot, line);
  surface.emissive = hot * line * pulse * (0.7 + uGlow);
  surface.ao = mix(0.55, 1.0, c.x);
  surface.roughness = mix(0.9, 0.45, line);
  surface.metalness = 0.0;
  surface.height = crust * 0.45 - line * 0.55;
  return surface;
}
`, { tileable: true }),
  crystal: makeSurfaceShader("Crystal Facets", /* glsl */ `
SurfaceData sampleSurface(vec2 uv) {
  float t = shaderTime();
  // 每个 Voronoi 格子是一座小金字塔（高度 = 到格子边缘的距离），法线就是一块块平面晶面
  vec3 v = voronoi(uv, tiles(5.0), 0.9, t * 0.12, uSeed);
  float id = hash1D(v.yz + uSeed);
  float facet = clamp(v.x * 3.2, 0.0, 1.0);
  float rim = 1.0 - smoothstep(0.0, 0.05, v.x);
  vec3 rainbow = spectrum(id + facet * 0.35 + t * 0.04);
  SurfaceData surface;
  surface.baseColor = mix(mix(uColorA, uColorB, id), rainbow * uAccent, 0.2 + 0.3 * uWarp);
  surface.emissive = rainbow * pow(facet, 5.0) * uGlow * 0.5 + uAccent * rim * uGlow * 0.15;
  surface.ao = mix(0.5, 1.0, facet);
  surface.roughness = 0.03 + rim * 0.35;
  surface.metalness = 0.35;
  surface.height = facet * 0.9;
  return surface;
}
`, { tileable: true }),
  hexArmor: makeSurfaceShader("Hex Armor", /* glsl */ `
SurfaceData sampleSurface(vec2 uv) {
  float t = shaderTime();
  float edge;
  vec4 h = tileHexagons(uv, tiles(5.0), false, edge);
  float id = hash1D(h.zw * 37.0 + uSeed);
  float seam = 1.0 - smoothstep(0.03, 0.09, edge);
  float bevel = smoothstep(0.05, 0.3, edge);
  // 能量沿斜向扫过，扫到的格子缝隙变亮
  float sweep = pow(0.5 + 0.5 * sin(t * 0.6 - (h.z + h.w) * 9.0 + id * 1.5), 12.0);
  SurfaceData surface;
  surface.baseColor = mix(uColorA, uColorB, 0.3 + 0.45 * id) * mix(0.7, 1.0, bevel);
  surface.emissive = uAccent * seam * (0.25 + uGlow * 0.5 + sweep * 2.0) + uAccent * sweep * bevel * 0.06;
  surface.ao = mix(0.45, 1.0, bevel);
  surface.roughness = mix(0.5, 0.2 + id * 0.15, bevel);
  surface.metalness = 0.92;
  surface.height = bevel * 0.5 - seam * 0.3;
  return surface;
}
`, { tileable: true }),
  weave: makeSurfaceShader("Silk Weave", /* glsl */ `
SurfaceData sampleSurface(vec2 uv) {
  vec2 cells = tiles(10.0);
  vec3 w = tileWeave(uv, cells, 3.0, 0.62, 0.25);
  float thread = w.x;
  vec2 cell = floor(uv * cells);
  float dir = mod(cell.x + cell.y, 2.0);
  float fiber = noise(uv * cells * vec2(12.0, 1.0), cells * vec2(12.0, 1.0), uSeed) * 0.5 + 0.5;
  SurfaceData surface;
  surface.baseColor = mix(uColorA, mix(uColorB, uAccent, dir * 0.6), thread) * (0.85 + fiber * 0.15);
  surface.emissive = vec3(0.0);
  surface.ao = mix(0.35, 1.0, thread);
  surface.roughness = mix(0.9, 0.42 - uGlow * 0.15, thread);
  surface.metalness = 0.0;
  surface.height = thread * 0.6 + fiber * 0.05;
  return surface;
}
`, { tileable: true }),
  scales: makeSurfaceShader("Dragon Scales", /* glsl */ `
SurfaceData sampleSurface(vec2 uv) {
  float t = shaderTime();
  float edge;
  vec4 h = tileHexagons(uv, tiles(7.0), true, edge);
  float id = hash1D(h.zw * 53.0 + uSeed);
  // 每片鳞从上到下鼓起，下缘压暗，形成叠瓦感
  vec2 local = h.xy * 2.0 - 1.0;
  float dome = clamp(1.0 - dot(local * vec2(1.0, 1.3) + vec2(0.0, 0.35), local * vec2(1.0, 1.3) + vec2(0.0, 0.35)), 0.0, 1.0);
  float rim = smoothstep(0.0, 0.25, edge);
  vec3 sheen = spectrum(id * 0.25 + dome * 0.5 + t * 0.03);
  SurfaceData surface;
  surface.baseColor = mix(uColorA, uColorB, dome * rim) ;
  surface.baseColor = mix(surface.baseColor, sheen * uAccent, (0.25 + 0.35 * uWarp) * dome);
  surface.emissive = uAccent * (1.0 - rim) * uGlow * 0.2;
  surface.ao = mix(0.3, 1.0, rim * (0.4 + 0.6 * dome));
  surface.roughness = mix(0.55, 0.18, dome);
  surface.metalness = 0.75;
  surface.height = dome * rim * 0.8;
  return surface;
}
`, { tileable: true }),
  circuit: makeSurfaceShader("Circuit Board", /* glsl */ `
SurfaceData sampleSurface(vec2 uv) {
  float t = shaderTime();
  vec2 cells = tiles(8.0);
  vec2 g = uv * cells;
  vec2 cell = mod(floor(g), cells);
  vec2 f = fract(g) - 0.5;
  float r = hash1D(cell + uSeed);
  // 每格随机走横线 / 竖线 / 拐角，再随机放焊盘
  float w = 0.06;
  float hor = 1.0 - smoothstep(w, w + 0.03, abs(f.y));
  float ver = 1.0 - smoothstep(w, w + 0.03, abs(f.x));
  float trace = r < 0.33 ? hor : r < 0.66 ? ver : max(hor * step(0.0, f.x), ver * step(0.0, f.y));
  float pad = (1.0 - smoothstep(0.16, 0.2, length(f))) * step(0.82, hash1D(cell + uSeed + 7.0));
  float hole = 1.0 - smoothstep(0.05, 0.08, length(f));
  trace = max(trace, pad);
  float pulse = pow(0.5 + 0.5 * sin(t * 1.0 - (cell.x + cell.y * 1.7) * 0.9), 10.0);
  float board = fbm(uv, tiles(6.0), 4, 0.0, 0.0, 0.5, 2.0, 0.0, uSeed);
  SurfaceData surface;
  surface.baseColor = mix(uColorA * (0.8 + board * 0.4), uColorB, trace);
  surface.baseColor = mix(surface.baseColor, vec3(0.02), hole * pad);
  surface.emissive = uAccent * trace * (pulse * (1.0 + uGlow * 2.0) + 0.05 * uGlow);
  surface.ao = mix(0.75, 1.0, trace);
  surface.roughness = mix(0.6, 0.25, trace);
  surface.metalness = trace * 0.95;
  surface.height = trace * 0.35 - hole * pad * 0.3;
  return surface;
}
`, { tileable: true }),
  biolume: makeSurfaceShader("Bioluminescence", /* glsl */ `
SurfaceData sampleSurface(vec2 uv) {
  float t = shaderTime();
  float blob = metaballs(uv, tiles(4.0), 1.0, t * 0.3, 0.18, 0.35, uSeed);
  float fine = metaballs(uv, tiles(9.0), 1.0, -t * 0.4, 0.12, 0.3, uSeed + 3.0);
  // 只让团块中心发光，周围保持深色皮肤
  float glow = smoothstep(0.55, 1.0, blob * 0.85 + fine * 0.35);
  float flesh = fbm(uv, tiles(5.0), 5, 0.0, t * 0.1, 0.5, 2.0, 0.0, uSeed);
  SurfaceData surface;
  surface.baseColor = mix(uColorA * (0.5 + flesh * 0.7), uColorB, glow * 0.3);
  surface.emissive = mix(uColorB, uAccent, glow) * glow * (0.5 + uGlow * 1.2);
  surface.ao = mix(0.6, 1.0, glow);
  surface.roughness = mix(0.4, 0.2, glow);
  surface.metalness = 0.0;
  surface.height = flesh * 0.45 + glow * 0.3;
  return surface;
}
`, { tileable: true }),
  liquidChrome: makeSurfaceShader("Liquid Chrome", /* glsl */ `
SurfaceData sampleSurface(vec2 uv) {
  float t = shaderTime();
  vec2 q;
  vec2 r;
  float n = curlWarp(uv + vec2(t * 0.02, -t * 0.015), tiles(2.0), vec2(0.5 + uWarp * 0.5), vec4(1.0, 2.0, 3.0, 4.0), 0.5, uSeed, q, r);
  float flow = n * 0.5 + 0.5;
  // 大块起伏 + 少量亮带，靠法线和环境反射出「液态」感
  float bands = 0.5 + 0.5 * sin(flow * 6.0 + length(r) * 2.0 - t * 0.4);
  SurfaceData surface;
  surface.baseColor = mix(uColorA, uColorB, smoothstep(0.1, 0.9, bands));
  surface.baseColor = mix(surface.baseColor, uAccent, smoothstep(0.85, 1.0, bands) * 0.5);
  surface.emissive = uAccent * smoothstep(0.95, 1.0, bands) * uGlow * 0.3;
  surface.ao = 1.0;
  surface.roughness = 0.04 + (1.0 - bands) * 0.08;
  surface.metalness = 1.0;
  surface.height = flow;
  return surface;
}
`, { tileable: true }),
  holoFoil: makeSurfaceShader("Holo Foil", /* glsl */ `
SurfaceData sampleSurface(vec2 uv) {
  float t = shaderTime();
  float n = fbm(uv, tiles(3.0), 5, 0.0, t * 0.15, 0.5, 2.0, 0.0, uSeed);
  // 镭射膜的衍射条纹：沿对角线的细密彩虹，被噪声扭一下
  float stripes = fract((uv.x + uv.y) * floor(tiles(12.0).x) + n * (1.5 + uWarp * 2.0) - t * 0.08);
  vec3 rainbow = spectrum(stripes + n * 0.6);
  float sparkle = step(0.985, hash1D(floor(uv * tiles(60.0)) + floor(t * 1.5)));
  SurfaceData surface;
  surface.baseColor = mix(uColorB, rainbow, 0.75) * mix(vec3(1.0), uAccent, 0.2);
  surface.emissive = rainbow * sparkle * (0.8 + uGlow) + rainbow * uGlow * 0.06;
  surface.ao = 1.0;
  surface.roughness = 0.12 + n * 0.12;
  surface.metalness = 1.0;
  surface.height = n * 0.25;
  return surface;
}
`, { tileable: true }),
  // ---------- 写实材质（Substance 风格）：程序贴图 + 物理参数（透射 / IOR / 色散在预设里） ----------
  ice: makeSurfaceShader("Frozen Lake", /* glsl */ `
// 冰湖表面（参考 Substance 的 Frozen Lake）：暗蓝透明的底，冰下的碎冰由材质的「冰下碎冰」视差层画（materialFx.js）；
// 这里只管表面：大块冰板的白色裂缝（边缘带压碎的白边）、细裂纹、薄霜、少量气泡
SurfaceData sampleSurface(vec2 uv) {
  vec3 big = cracks(uv, tiles(3.0), 0.9, 0.006 + 0.004 * uWarp, 0.02, 0.7, 2.0, true, 0.0, uSeed);
  float crack = 1.0 - big.x;
  // 裂缝两侧压碎的白边，宽且软
  float crush = 1.0 - cracks(uv, tiles(3.0), 0.9, 0.04 + 0.02 * uWarp, 0.06, 0.7, 2.0, true, uSeed);
  float fine = 1.0 - cracks(uv, tiles(8.0), 1.0, 0.004, 0.01, 0.4, 2.0, false, uSeed + 2.0);
  float plateTone = hash1D(big.yz + uSeed);
  float frost = fbm(uv, tiles(4.0), 6, 0.0, 0.0, 0.55, 2.0, 0.0, uSeed + 5.0);
  float frosted = smoothstep(0.58, 0.82, frost) * 0.8;
  float streak = noise(uv, vec2(tiles(3.0).x, tiles(40.0).x), 0.0, uSeed + 9.0) * 0.5 + 0.5;
  vec2 cells = tiles(18.0);
  vec2 bub = cellularNoise(uv, cells, 1.0, 0.0, uSeed + 7.0);
  float bubble = (1.0 - smoothstep(0.04, 0.08, bub.x)) * step(0.75, hash1D(mod(floor(uv * cells), cells) + uSeed));
  float white = max(max(crack, crush * 0.55), max(fine * 0.45, frosted * (0.6 + streak * 0.4)));
  SurfaceData surface;
  surface.baseColor = mix(uColorA, uColorB, plateTone * 0.6 + streak * 0.2);
  surface.baseColor = mix(surface.baseColor, uAccent, max(white, bubble * 0.6));
  surface.emissive = uAccent * crack * uGlow * 0.04;
  surface.ao = 1.0 - crush * 0.15;
  surface.roughness = mix(0.03, 0.5, max(frosted, crush * 0.6));
  surface.metalness = 0.0;
  surface.height = frost * 0.06 - crack * 0.5 - crush * 0.15 - fine * 0.15 + bubble * 0.05;
  return surface;
}
`, { tileable: true }),
  diamond: makeSurfaceShader("Brilliant Diamond", /* glsl */ `
SurfaceData sampleSurface(vec2 uv) {
  float t = shaderTime();
  // 大切面 + 小切面两层「金字塔」，法线是一块块平面；切面闪光逐格随机亮起
  vec3 v = voronoi(uv, tiles(3.0), 0.7, 0.0, uSeed);
  vec3 v2 = voronoi(uv, tiles(9.0), 0.8, 0.0, uSeed + 5.0);
  float facet = clamp(v.x * 2.5, 0.0, 1.0);
  float facet2 = clamp(v2.x * 2.5, 0.0, 1.0);
  float edge = 1.0 - smoothstep(0.0, 0.03, v.x);
  float sparkle = pow(hash1D(v2.yz + floor(t * 0.8)), 24.0);
  SurfaceData surface;
  surface.baseColor = mix(uColorB, vec3(1.0), edge * 0.5);
  surface.emissive = spectrum(hash1D(v2.yz) + t * 0.05) * sparkle * uGlow * 1.5;
  surface.ao = 1.0;
  surface.roughness = 0.02 + edge * 0.05;
  surface.metalness = 0.0;
  surface.height = facet * 0.8 + facet2 * 0.25;
  return surface;
}
`, { tileable: true }),
  quartz: makeSurfaceShader("Clear Quartz", /* glsl */ `
SurfaceData sampleSurface(vec2 uv) {
  float t = shaderTime();
  float veil = fbm(uv + vec2(0.0, t * 0.01), tiles(3.0), 6, 0.0, 0.0, 0.55, 2.0, 0.0, uSeed);
  float milky = smoothstep(0.62, 0.9, veil);
  float crack = 1.0 - cracks(uv, tiles(2.0), 0.8, 0.006 + uWarp * 0.004, 0.012, 0.8, 2.0, true, uSeed);
  SurfaceData surface;
  surface.baseColor = mix(uColorB, vec3(1.0), max(milky * 0.7, crack * 0.8));
  surface.emissive = uAccent * crack * uGlow * 0.1;
  surface.ao = 1.0;
  surface.roughness = mix(0.02, 0.3, milky * 0.5 + crack * 0.5);
  surface.metalness = 0.0;
  surface.height = veil * 0.05 - crack * 0.2;
  return surface;
}
`, { tileable: true }),
  emerald: makeSurfaceShader("Emerald", /* glsl */ `
SurfaceData sampleSurface(vec2 uv) {
  float t = shaderTime();
  // 祖母绿的「花园」：内部云雾状包裹体；切面偏规整
  vec3 v = voronoi(uv, tiles(4.0), 0.4, 0.0, uSeed);
  float facet = clamp(v.x * 2.2, 0.0, 1.0);
  float garden = fbm(uv + vec2(t * 0.01, 0.0), tiles(5.0), 6, 0.0, 0.0, 0.55, 2.0, 0.0, uSeed + 3.0);
  float inclusion = smoothstep(0.55, 0.8, garden);
  SurfaceData surface;
  surface.baseColor = mix(uColorB, uColorA, inclusion * 0.8);
  surface.emissive = uAccent * pow(facet, 8.0) * uGlow * 0.15;
  surface.ao = 1.0;
  surface.roughness = 0.02 + inclusion * 0.2;
  surface.metalness = 0.0;
  surface.height = facet * 0.6;
  return surface;
}
`, { tileable: true }),
  amber: makeSurfaceShader("Baltic Amber", /* glsl */ `
SurfaceData sampleSurface(vec2 uv) {
  float t = shaderTime();
  float flow = fbm(uv + vec2(t * 0.01, 0.0), tiles(2.0), 5, 0.0, 0.0, 0.5, 2.0, 0.0, uSeed);
  float band = 0.5 + 0.5 * sin(flow * 10.0 + uv.y * 6.2831 * tiles(2.0).x);
  vec2 cells = tiles(10.0);
  vec2 b = cellularNoise(uv, cells, 1.0, 0.0, uSeed + 5.0);
  float has = step(0.75, hash1D(mod(floor(uv * cells), cells) + uSeed));
  float bubble = (1.0 - smoothstep(0.04, 0.07, b.x)) * has;
  float rim = (smoothstep(0.03, 0.05, b.x) - smoothstep(0.05, 0.07, b.x)) * has;
  SurfaceData surface;
  surface.baseColor = mix(uColorA, uColorB, band) + uAccent * rim * 0.5;
  surface.emissive = uAccent * band * uGlow * 0.05;
  surface.ao = 1.0;
  surface.roughness = 0.05 + bubble * 0.1;
  surface.metalness = 0.0;
  surface.height = flow * 0.1 + bubble * 0.1;
  return surface;
}
`, { tileable: true }),
  jade: makeSurfaceShader("Imperial Jade", /* glsl */ `
SurfaceData sampleSurface(vec2 uv) {
  float t = shaderTime();
  float cloud = fbm(uv + vec2(t * 0.01, 0.0), tiles(3.0), 6, 0.0, 0.0, 0.55, 2.0, 0.0, uSeed);
  float vein = 1.0 - cracks(uv, tiles(2.0), 0.8, 0.02, 0.05, 1.0, 2.0, true, uSeed + 1.0);
  SurfaceData surface;
  surface.baseColor = mix(uColorA, uColorB, smoothstep(0.3, 0.8, cloud));
  surface.baseColor = mix(surface.baseColor, uAccent, vein * 0.5);
  surface.emissive = vec3(0.0);
  surface.ao = 1.0;
  surface.roughness = 0.12 + cloud * 0.1;
  surface.metalness = 0.0;
  surface.height = cloud * 0.05;
  return surface;
}
`, { tileable: true }),
  brushedScratch: makeSurfaceShader("Scratched Brushed Metal", /* glsl */ `
SurfaceData sampleSurface(vec2 uv) {
  // 拉丝：沿 x 方向的细长噪声；划痕：每格一条随机方向的短线，三层不同密度
  float streak = noise(uv, vec2(4.0, 512.0), 0.0, uSeed) * 0.5 + 0.5;
  float streak2 = noise(uv, vec2(16.0, 1024.0), 0.0, uSeed + 1.0) * 0.5 + 0.5;
  float scratch = 0.0;
  for (int i = 0; i < 3; i++) {
    vec2 cells = tiles(3.0 + float(i) * 2.0);
    vec2 g = uv * cells;
    vec2 h = hash2D(mod(floor(g), cells) + uSeed + float(i) * 17.0);
    float angle = h.x * 3.1416;
    vec2 dir = vec2(cos(angle), sin(angle));
    vec2 rel = fract(g) - 0.5 - (h - 0.5) * 0.3;
    float along = dot(rel, dir);
    float across = abs(dot(rel, vec2(-dir.y, dir.x)));
    float len = 0.22 + 0.2 * h.y;
    float line = (1.0 - smoothstep(0.0, 0.012, across)) * (1.0 - smoothstep(len * 0.7, len, abs(along)));
    scratch = max(scratch, line * step(0.35, h.y) * (0.5 + 0.5 * uWarp));
  }
  SurfaceData surface;
  surface.baseColor = mix(uColorA, uColorB, streak * 0.6 + streak2 * 0.4);
  surface.baseColor = mix(surface.baseColor, uAccent, scratch * 0.5);
  surface.emissive = vec3(0.0);
  surface.ao = 1.0 - scratch * 0.2;
  surface.roughness = 0.22 + streak2 * 0.15 + scratch * 0.25;
  surface.metalness = 1.0;
  surface.height = streak * 0.03 - scratch * 0.25;
  return surface;
}
`, { tileable: true }),
  wornPaint: makeSurfaceShader("Worn Paint", /* glsl */ `
SurfaceData sampleSurface(vec2 uv) {
  float n = fbm(uv, tiles(3.0), 6, 0.0, 0.0, 0.55, 2.0, 0.0, uSeed);
  float detail = fbm(uv, tiles(12.0), 4, 0.0, 0.0, 0.5, 2.0, 0.0, uSeed + 2.0);
  float edge = 0.62 - uWarp * 0.2;
  float wear = smoothstep(edge, edge + 0.03, n + detail * 0.18);
  float lip = smoothstep(edge - 0.04, edge, n + detail * 0.18) - wear;
  float rust = smoothstep(0.55, 0.8, fbm(uv, tiles(5.0), 5, 0.0, 0.0, 0.5, 2.0, 0.0, uSeed + 9.0)) * wear;
  vec3 metal = mix(uAccent, vec3(0.32, 0.14, 0.05), rust);
  SurfaceData surface;
  surface.baseColor = mix(uColorB * (0.85 + detail * 0.25), metal, wear);
  surface.baseColor *= 1.0 - lip * 0.35;
  surface.emissive = vec3(0.0);
  surface.ao = 1.0 - lip * 0.4;
  surface.roughness = mix(0.45, mix(0.3, 0.9, rust), wear);
  surface.metalness = wear * (1.0 - rust);
  surface.height = (1.0 - wear) * 0.25 + detail * 0.03;
  return surface;
}
`, { tileable: true }),
  damascus: makeSurfaceShader("Damascus Steel", /* glsl */ `
SurfaceData sampleSurface(vec2 uv) {
  float w = fbm(uv, tiles(2.0), 5, 0.0, 0.0, 0.5, 2.0, 0.0, uSeed);
  float w2 = fbm(uv, tiles(6.0), 4, 0.0, 0.0, 0.5, 2.0, 0.0, uSeed + 3.0);
  float layers = sin((uv.y + (w - 0.5) * (0.6 + uWarp * 0.6) + (w2 - 0.5) * 0.08) * 6.2831 * tiles(10.0).x);
  float band = smoothstep(-0.25, 0.25, layers);
  SurfaceData surface;
  surface.baseColor = mix(uColorA, uColorB, band);
  surface.emissive = vec3(0.0);
  surface.ao = 1.0;
  surface.roughness = mix(0.38, 0.18, band);
  surface.metalness = 1.0;
  surface.height = band * 0.08;
  return surface;
}
`, { tileable: true }),
  patina: makeSurfaceShader("Verdigris Copper", /* glsl */ `
SurfaceData sampleSurface(vec2 uv) {
  float n = fbm(uv, tiles(3.0), 6, 0.0, 0.0, 0.55, 2.0, 0.0, uSeed);
  float detail = fbm(uv, tiles(10.0), 4, 0.0, 0.0, 0.5, 2.0, 0.0, uSeed + 4.0);
  float pat = smoothstep(0.5 - uWarp * 0.15, 0.62 - uWarp * 0.15, n + detail * 0.15);
  float tone = fbm(uv, tiles(4.0), 4, 0.0, 0.0, 0.5, 2.0, 0.0, uSeed + 8.0);
  SurfaceData surface;
  surface.baseColor = mix(mix(uColorA, uColorB, tone), uAccent * (0.8 + detail * 0.4), pat);
  surface.emissive = vec3(0.0);
  surface.ao = 1.0 - pat * 0.15;
  surface.roughness = mix(0.28, 0.85, pat);
  surface.metalness = 1.0 - pat;
  surface.height = pat * 0.15 + detail * 0.03;
  return surface;
}
`, { tileable: true }),
  concrete: makeSurfaceShader("Raw Concrete", /* glsl */ `
SurfaceData sampleSurface(vec2 uv) {
  float n = fbm(uv, tiles(4.0), 6, 0.0, 0.0, 0.55, 2.0, 0.0, uSeed);
  float stain = fbm(uv, tiles(2.0), 4, 0.0, 0.0, 0.5, 2.0, 0.0, uSeed + 2.0);
  vec2 cells = tiles(24.0);
  vec2 pore = cellularNoise(uv, cells, 1.0, 0.0, uSeed + 5.0);
  float pores = (1.0 - smoothstep(0.04, 0.1, pore.x)) * step(0.6, hash1D(mod(floor(uv * cells), cells) + uSeed));
  float aggregate = step(0.82, noise(uv, tiles(64.0), 0.0, uSeed + 3.0) * 0.5 + 0.5);
  SurfaceData surface;
  surface.baseColor = uColorB * (0.8 + n * 0.3) * mix(1.0, 0.75, smoothstep(0.4, 0.8, stain));
  surface.baseColor = mix(surface.baseColor, uColorA, pores * 0.8);
  surface.baseColor = mix(surface.baseColor, uAccent, aggregate * 0.3);
  surface.emissive = vec3(0.0);
  surface.ao = 1.0 - pores * 0.5;
  surface.roughness = 0.82 + n * 0.12;
  surface.metalness = 0.0;
  surface.height = n * 0.3 - pores * 0.4;
  return surface;
}
`, { tileable: true }),
  granite: makeSurfaceShader("Polished Granite", /* glsl */ `
SurfaceData sampleSurface(vec2 uv) {
  float r = voronoiPattern(uv, tiles(40.0), 1.0, 1.0, 1.0, uSeed).r;
  vec3 mineral = r < 0.45 ? uColorA : r < 0.8 ? uColorB : uAccent;
  float fine = noise(uv, tiles(120.0), 0.0, uSeed) * 0.5 + 0.5;
  SurfaceData surface;
  surface.baseColor = mineral * (0.85 + fine * 0.3);
  surface.emissive = vec3(0.0);
  surface.ao = 1.0;
  surface.roughness = 0.1 + fine * 0.06;
  surface.metalness = 0.0;
  surface.height = fine * 0.02;
  return surface;
}
`, { tileable: true }),
  terrazzo: makeSurfaceShader("Terrazzo", /* glsl */ `
SurfaceData sampleSurface(vec2 uv) {
  // 碎石 = 收缩后的 Voronoi 格子，只挑一部分格子做石子，其余是水泥底
  vec3 v = voronoi(uv, tiles(9.0), 1.0, 0.0, uSeed);
  float id = hash1D(v.yz + uSeed);
  float chip = smoothstep(0.08, 0.1, v.x) * step(0.45, id);
  vec3 chipColor = id < 0.65 ? uColorA : id < 0.85 ? uAccent : vec3(0.92);
  float speck = step(0.93, noise(uv, tiles(90.0), 0.0, uSeed + 3.0) * 0.5 + 0.5);
  SurfaceData surface;
  surface.baseColor = mix(uColorB, chipColor, chip);
  surface.baseColor = mix(surface.baseColor, uColorA * 0.6, speck * (1.0 - chip));
  surface.emissive = vec3(0.0);
  surface.ao = 1.0;
  surface.roughness = 0.2;
  surface.metalness = 0.0;
  surface.height = chip * 0.05;
  return surface;
}
`, { tileable: true }),
  sand: makeSurfaceShader("Dune Sand", /* glsl */ `
SurfaceData sampleSurface(vec2 uv) {
  float t = shaderTime();
  float w = fbm(uv + vec2(t * 0.01, 0.0), tiles(2.0), 5, 0.0, 0.0, 0.5, 2.0, 0.0, uSeed);
  float ripple = sin((uv.y + (w - 0.5) * (0.3 + uWarp * 0.4)) * 6.2831 * tiles(14.0).x);
  float grain = noise(uv, tiles(160.0), 0.0, uSeed) * 0.5 + 0.5;
  // 闪烁颗粒：少数沙粒（石英、云母）各自按随机相位一闪一闪
  vec2 glintCells = tiles(70.0);
  vec2 glintCell = floor(uv * glintCells);
  float glintId = hash1D(mod(glintCell, glintCells) + uSeed);
  float glintShape = 1.0 - smoothstep(0.15, 0.4, length(fract(uv * glintCells) - 0.5));
  float glint = step(0.94, glintId) * glintShape * pow(0.5 + 0.5 * sin(t * 15.0 + glintId * 80.0), 10.0);
  SurfaceData surface;
  surface.baseColor = mix(uColorA, uColorB, 0.5 + 0.5 * ripple) * (0.85 + grain * 0.3);
  surface.emissive = vec3(1.0, 0.95, 0.85) * glint * (1.5 + uGlow * 2.0);
  surface.ao = mix(0.85, 1.0, 0.5 + 0.5 * ripple);
  surface.roughness = 0.9 - glint * 0.7;
  surface.metalness = 0.0;
  surface.height = ripple * 0.3 + grain * 0.05;
  return surface;
}
`, { tileable: true }),
  snow: makeSurfaceShader("Snowy Ground", /* glsl */ `
SurfaceData sampleSurface(vec2 uv) {
  // 雪下面的冻土岩石；雪本身由「积雪」覆盖（src/materialFx.js）按朝向盖在上面
  float rock = fbm(uv, tiles(3.0), 6, 0.0, 0.0, 0.55, 2.0, 0.0, uSeed);
  float detail = fbm(uv, tiles(10.0), 4, 0.0, 0.0, 0.5, 2.0, 0.0, uSeed + 3.0);
  float crack = 1.0 - cracks(uv, tiles(4.0), 0.9, 0.015, 0.02, 0.6, 2.0, false, uSeed + 5.0);
  float frost = smoothstep(0.62, 0.8, detail) * 0.6;
  SurfaceData surface;
  surface.baseColor = mix(uColorA, uColorB, rock) * (1.0 - crack * 0.5);
  surface.baseColor = mix(surface.baseColor, uAccent, frost);
  surface.emissive = vec3(0.0);
  surface.ao = 1.0 - crack * 0.5;
  surface.roughness = mix(0.85, 0.4, frost);
  surface.metalness = 0.0;
  surface.height = rock * 0.6 + detail * 0.15 - crack * 0.3;
  return surface;
}
`, { tileable: true }),
  leather: makeSurfaceShader("Pebbled Leather", /* glsl */ `
SurfaceData sampleSurface(vec2 uv) {
  // 荔枝纹：细胞之间（F2 - F1 小）是褶皱，细胞中间鼓起
  vec2 c = cellularNoise(uv, tiles(32.0), 0.9, 0.0, uSeed);
  float crease = smoothstep(0.0, 0.12, c.y - c.x);
  float pebble = 1.0 - c.x;
  float tone = fbm(uv, tiles(3.0), 5, 0.0, 0.0, 0.5, 2.0, 0.0, uSeed + 2.0);
  SurfaceData surface;
  surface.baseColor = mix(uColorA, uColorB, tone) * mix(0.6, 1.0, crease);
  surface.emissive = vec3(0.0);
  surface.ao = mix(0.55, 1.0, crease);
  surface.roughness = mix(0.75, 0.5, pebble * crease);
  surface.metalness = 0.0;
  surface.height = crease * pebble * 0.5;
  return surface;
}
`, { tileable: true }),
  // ---------- 墙面 / 地面（参考 Substance Designer 的风格化材质） ----------
  plasterWall: makeSurfaceShader("Peeling Plaster", /* glsl */ `
SurfaceData sampleSurface(vec2 uv) {
  // 三层：最底下的砖、中间灰泥、最外面的漆；漆和灰泥按噪声剥落
  vec4 b = bricks(uv, vec2(floor(tiles(4.0).x), floor(tiles(12.0).x)));
  float brick = bevel(b.x, 0.004, 0.012);
  float n = fbm(uv, tiles(3.0), 6, 0.0, 0.0, 0.55, 2.0, 0.0, uSeed);
  float detail = fbm(uv, tiles(12.0), 4, 0.0, 0.0, 0.5, 2.0, 0.0, uSeed + 2.0);
  float edgeNoise = n + detail * 0.12;
  // edgeNoise 实测中位数约 0.70：漆约占一半，露砖约四分之一；扭曲越大剥得越多
  float paintLine = 0.7 + uWarp * 0.1;
  float plasterLine = paintLine - 0.1;
  float paint = smoothstep(paintLine, paintLine + 0.01, edgeNoise);
  float plaster = smoothstep(plasterLine, plasterLine + 0.02, edgeNoise);
  float lip = smoothstep(paintLine - 0.02, paintLine, edgeNoise) - paint;
  float grime = fbm(uv, tiles(2.0), 5, 0.0, 0.0, 0.5, 2.0, 0.0, uSeed + 7.0);
  vec3 brickColor = mix(uColorA * 0.7, uColorA * 1.25, b.y) * (0.8 + detail * 0.4);
  brickColor = mix(vec3(0.16, 0.15, 0.14), brickColor, brick);
  vec3 plasterColor = uAccent * (0.8 + detail * 0.35);
  vec3 paintColor = uColorB * (0.75 + detail * 0.3) * mix(1.0, 0.7, smoothstep(0.4, 0.8, grime));
  SurfaceData surface;
  surface.baseColor = mix(mix(brickColor, plasterColor, plaster), paintColor, paint);
  surface.baseColor *= 1.0 - lip * 0.35;
  surface.emissive = vec3(0.0);
  surface.ao = mix(0.6 + brick * 0.4, 1.0, plaster) * (1.0 - lip * 0.3);
  surface.roughness = mix(mix(0.85, 0.95, plaster), 0.55, paint);
  surface.metalness = 0.0;
  surface.height = mix(brick * 0.35 - 0.5, mix(0.15 + detail * 0.15, 0.3 + detail * 0.06, paint), plaster);
  return surface;
}
`, { tileable: true }),
  stylizedBrick: makeSurfaceShader("Stylized Brick", /* glsl */ `
SurfaceData sampleSurface(vec2 uv) {
  vec4 b = bricks(uv, vec2(floor(tiles(5.0).x), floor(tiles(14.0).x)));
  // 风格化：倒角宽、边缘缺口、每块砖略微倾斜，倒角朝上的一侧提亮（手绘高光）
  float chip = noise(uv, tiles(40.0), 0.0, uSeed + 3.0) * 0.5 + 0.5;
  float d = b.x - chip * 0.006 * (0.5 + uWarp);
  float face = bevel(d, 0.003, 0.016);
  float tilt = (hash1D(vec2(b.y, 7.0)) - 0.5) * (b.w - 0.5) * 0.3;
  float tone = hash1D(vec2(b.y, 3.0));
  float detail = fbm(uv, tiles(16.0), 4, 0.0, 0.0, 0.5, 2.0, 0.0, uSeed);
  vec3 brick = mix(uColorA, uColorB, tone) * (0.85 + detail * 0.3);
  brick += uAccent * (smoothstep(0.75, 1.0, b.w) * smoothstep(0.2, 0.8, face) * (1.0 - smoothstep(0.85, 1.0, face))) * 0.35;
  vec3 mortar = vec3(0.32, 0.28, 0.24) * (0.8 + detail * 0.4);
  SurfaceData surface;
  surface.baseColor = mix(mortar, brick, smoothstep(0.0, 0.3, face));
  surface.emissive = vec3(0.0);
  surface.ao = mix(0.45, 1.0, face);
  surface.roughness = mix(0.95, 0.6 + detail * 0.2, face);
  surface.metalness = 0.0;
  surface.height = face * (0.6 + tilt + detail * 0.08) - 0.3;
  return surface;
}
`, { tileable: true }),
  stoneWall: makeSurfaceShader("Mossy Cobblestone", /* glsl */ `
SurfaceData sampleSurface(vec2 uv) {
  vec3 v = voronoi(uv, tiles(11.0), 0.85, 0.0, uSeed);
  float id = hash1D(v.yz + uSeed);
  float detail = fbm(uv, tiles(20.0), 4, 0.0, 0.0, 0.5, 2.0, 0.0, uSeed + 1.0);
  // 石头是圆鼓的：离缝越远越高，顶部偏平；边缘有缺口
  float edge = v.x + (detail - 0.5) * 0.03;
  float stone = smoothstep(0.02, 0.06, edge);
  float dome = sqrt(clamp(edge * 3.0, 0.0, 1.0));
  // 苔藓：长在缝里，也往石头底部爬一点
  float mossNoise = fbm(uv, tiles(5.0), 5, 0.0, 0.0, 0.5, 2.0, 0.0, uSeed + 4.0);
  float moss = (1.0 - smoothstep(0.015, 0.05 + mossNoise * 0.05 * uWarp, edge)) * smoothstep(0.55, 0.7, mossNoise);
  vec3 rock = mix(uColorA, uColorB, id * 0.7 + detail * 0.3);
  // 风格化：石头顶部提亮、底部压暗
  rock *= mix(0.65, 1.3, dome);
  SurfaceData surface;
  surface.baseColor = mix(vec3(0.05, 0.06, 0.05), rock, stone);
  surface.baseColor = mix(surface.baseColor, uAccent * (0.6 + mossNoise * 0.6), moss);
  surface.emissive = vec3(0.0);
  surface.ao = mix(0.35, 1.0, stone) * (1.0 - moss * 0.2);
  surface.roughness = mix(0.9, 0.55 + detail * 0.2, stone);
  surface.metalness = 0.0;
  surface.height = stone * (dome * 0.8 + detail * 0.12) - 0.4 + moss * 0.15;
  return surface;
}
`, { tileable: true }),
  limestoneBrick: makeSurfaceShader("Limestone Pavers", /* glsl */ `
SurfaceData sampleSurface(vec2 uv) {
  vec4 b = bricks(uv, vec2(floor(tiles(4.0).x), floor(tiles(10.0).x)));
  float detail = fbm(uv, tiles(12.0), 5, 0.0, 0.0, 0.55, 2.0, 0.0, uSeed);
  float pits = cellularNoise(uv, tiles(30.0), 1.0, 0.0, uSeed + 2.0).x;
  float chip = noise(uv, tiles(24.0), 0.0, uSeed + 5.0) * 0.5 + 0.5;
  float face = bevel(b.x - chip * 0.01 * (0.5 + uWarp), 0.004, 0.02);
  float tone = hash1D(vec2(b.y, 9.0));
  // 草：灰缝里一丛丛的，按噪声决定哪段灰缝长草
  float grassNoise = fbm(uv, tiles(6.0), 4, 0.0, 0.0, 0.5, 2.0, 0.0, uSeed + 8.0);
  float blades = noise(uv, tiles(160.0), 0.0, uSeed + 11.0) * 0.5 + 0.5;
  float grass = (1.0 - smoothstep(0.0, 0.25, face)) * smoothstep(0.45, 0.65, grassNoise) * smoothstep(0.35, 0.7, blades);
  vec3 stone = mix(uColorA, uColorB, tone * 0.6 + detail * 0.4);
  stone *= 1.0 - (1.0 - smoothstep(0.02, 0.1, pits)) * 0.25;
  stone = mix(stone, stone * 1.3, smoothstep(0.6, 0.95, face) * smoothstep(0.6, 1.0, b.w) * 0.5);
  SurfaceData surface;
  surface.baseColor = mix(vec3(0.18, 0.15, 0.1), stone, smoothstep(0.0, 0.3, face));
  surface.baseColor = mix(surface.baseColor, uAccent * (0.6 + blades * 0.6), grass);
  surface.emissive = vec3(0.0);
  surface.ao = mix(0.4, 1.0, face);
  surface.roughness = mix(0.95, 0.7 + detail * 0.2, face);
  surface.metalness = 0.0;
  surface.height = face * (0.55 + detail * 0.12 - (1.0 - smoothstep(0.02, 0.1, pits)) * 0.08) - 0.3 + grass * 0.25;
  return surface;
}
`, { tileable: true }),
  formworkConcrete: makeSurfaceShader("Board-Formed Concrete", /* glsl */ `
SurfaceData sampleSurface(vec2 uv) {
  // 木模板浇筑的清水混凝土：横向木板压痕 + 木纹拓印 + 对拉螺栓孔
  float boards = floor(tiles(8.0).x);
  float row = floor(uv.y * boards);
  float local = fract(uv.y * boards);
  float seam = 1.0 - smoothstep(0.0, 0.03, min(local, 1.0 - local));
  float boardTone = hash1D(vec2(row, uSeed));
  float grain = noise(uv + vec2(0.0, boardTone), vec2(tiles(4.0).x, boards * 16.0), 0.0, uSeed + row) * 0.5 + 0.5;
  float n = fbm(uv, tiles(4.0), 6, 0.0, 0.0, 0.55, 2.0, 0.0, uSeed + 2.0);
  vec2 holeCells = vec2(floor(tiles(3.0).x), boards * 0.5);
  vec2 hf = fract(uv * holeCells) - 0.5;
  float hole = 1.0 - smoothstep(0.03, 0.045, length(hf * vec2(1.0, holeCells.x / holeCells.y)));
  float pores = step(0.9, noise(uv, tiles(90.0), 0.0, uSeed + 4.0) * 0.5 + 0.5);
  SurfaceData surface;
  surface.baseColor = uColorB * (0.82 + n * 0.25 + (boardTone - 0.5) * 0.12 + (grain - 0.5) * 0.08);
  surface.baseColor = mix(surface.baseColor, uColorA, max(seam * 0.5, max(hole, pores * 0.6)));
  surface.emissive = vec3(0.0);
  surface.ao = 1.0 - seam * 0.3 - hole * 0.6;
  surface.roughness = 0.82 + n * 0.12;
  surface.metalness = 0.0;
  surface.height = (grain - 0.5) * 0.12 + (boardTone - 0.5) * 0.1 - seam * 0.3 - hole * 0.6 - pores * 0.1;
  return surface;
}
`, { tileable: true }),
  mosaic: makeSurfaceShader("Mosaic", /* glsl */ `
SurfaceData sampleSurface(vec2 uv) {
  // 小方块瓷片：图案按每块瓷片中心取一次色（所以是一块块的颜色）；图案 = 大圆环 + 噪声色块
  vec2 count = tiles(34.0);
  vec2 cell = floor(uv * count);
  vec2 f = fract(uv * count);
  vec2 jitter = (hash2D(mod(cell, count) + uSeed) - 0.5) * 0.08;
  vec2 g = abs(f - 0.5 - jitter);
  float tile = 1.0 - smoothstep(0.38, 0.44, max(g.x, g.y));
  vec2 center = (cell + 0.5) / count;
  vec3 big = voronoi(center, tiles(3.0), 0.8, 0.0, uSeed);
  float ring = smoothstep(0.08, 0.1, big.x) - smoothstep(0.14, 0.16, big.x);
  float core = smoothstep(0.18, 0.2, big.x);
  float blob = smoothstep(0.55, 0.57, fbm(center, tiles(2.0), 4, 0.0, 0.0, 0.5, 2.0, 0.0, uSeed + 3.0));
  float outline = 1.0 - smoothstep(0.0, 0.02, big.x);
  vec3 col = uColorB;
  col = mix(col, uAccent, blob);
  col = mix(col, uColorA, ring);
  // 一半的大圆中心填成点缀色
  col = mix(col, uAccent, core * step(0.5, hash1D(big.yz + uSeed)));
  col = mix(col, vec3(0.12), outline);
  float shade = hash1D(mod(cell, count) + uSeed + 9.0);
  SurfaceData surface;
  surface.baseColor = mix(vec3(0.35, 0.34, 0.32), col * (0.85 + shade * 0.25), tile);
  surface.emissive = vec3(0.0);
  surface.ao = mix(0.5, 1.0, tile);
  surface.roughness = mix(0.9, 0.25 + shade * 0.2, tile);
  surface.metalness = 0.0;
  surface.height = tile * (0.5 + (shade - 0.5) * 0.2) - 0.25;
  return surface;
}
`, { tileable: true }),
  treeBark: makeSurfaceShader("Old Tree Bark", /* glsl */ `
SurfaceData sampleSurface(vec2 uv) {
  // 树皮：竖向长条的脊（|Perlin| 反过来就是脊线）+ 横向断开的裂口；沟里暗、脊上有竖向纤维；背阴处少量苔藓
  vec2 ridgeScale = vec2(floor(tiles(14.0).x), floor(tiles(2.0).x));
  float warp = fbm(uv, tiles(3.0), 4, 0.0, 0.0, 0.5, 2.0, 0.0, uSeed) - 0.6;
  float ridge = 1.0 - abs(perlinNoise(uv + vec2(warp * 0.04 * (1.0 + uWarp), 0.0), ridgeScale, uSeed));
  float breaks = 1.0 - cracks(uv, vec2(floor(tiles(10.0).x), floor(tiles(4.0).x)), 0.9, 0.01, 0.02, 0.5, 2.0, false, uSeed + 4.0);
  float plate = smoothstep(0.35, 0.75, ridge) * (1.0 - breaks * 0.8);
  float fiber = noise(uv, vec2(floor(tiles(90.0).x), floor(tiles(6.0).x)), 0.0, uSeed + 2.0) * 0.5 + 0.5;
  float detail = fbm(uv, tiles(10.0), 5, 0.0, 0.0, 0.5, 2.0, 0.0, uSeed + 3.0);
  float mossNoise = fbm(uv, tiles(3.0), 5, 0.0, 0.0, 0.55, 2.0, 0.0, uSeed + 6.0);
  float moss = smoothstep(0.74, 0.86, mossNoise + (1.0 - plate) * 0.1) * smoothstep(0.4, 0.7, detail);
  vec3 bark = mix(uColorA, uColorB, plate * (0.7 + 0.3 * detail)) * (0.75 + fiber * 0.35);
  SurfaceData surface;
  surface.baseColor = mix(bark, uAccent * (0.6 + detail * 0.6), moss);
  surface.emissive = vec3(0.0);
  surface.ao = mix(0.3, 1.0, plate);
  surface.roughness = mix(0.95, 0.75, plate);
  surface.metalness = 0.0;
  surface.height = plate * (0.6 + fiber * 0.2 + detail * 0.15) - 0.5 + moss * 0.1;
  return surface;
}
`, { tileable: true }),
  snowTracks: makeSurfaceShader("Snow Tracks", /* glsl */ `
SurfaceData sampleSurface(vec2 uv) {
  float t = shaderTime();
  // 积雪地面 + 两道轮胎印：印里是花纹，印两侧被挤起的雪埂
  float lumps = fbm(uv, tiles(4.0), 6, 0.0, 0.0, 0.55, 2.0, 0.0, uSeed);
  float fine = fbm(uv, tiles(20.0), 4, 0.0, 0.0, 0.5, 2.0, 0.0, uSeed + 2.0);
  float wobble = (fbm(vec2(0.5, uv.y), tiles(2.0), 3, 0.0, 0.0, 0.5, 2.0, 0.0, uSeed + 5.0) - 0.5) * 0.04;
  float track = 0.0;
  float berm = 0.0;
  float tread = 0.0;
  for (int i = 0; i < 2; i++) {
    float center = 0.32 + float(i) * 0.36 + wobble;
    float d = abs(uv.x - center);
    float inside = 1.0 - smoothstep(0.06, 0.075, d);
    track = max(track, inside);
    berm = max(berm, smoothstep(0.06, 0.08, d) * (1.0 - smoothstep(0.08, 0.12 + fine * 0.03, d)));
    // 人字形胎纹
    float chevron = fract(uv.y * floor(tiles(30.0).x) + abs(uv.x - center) * 6.0);
    tread = max(tread, inside * smoothstep(0.4, 0.5, chevron) * (1.0 - smoothstep(0.85, 0.95, chevron)));
  }
  float glint = step(0.993, noise(uv, tiles(220.0), t * 0.5, uSeed + 7.0) * 0.5 + 0.5);
  SurfaceData surface;
  surface.baseColor = mix(uColorB, uColorA, track * (0.7 - tread * 0.3) + (1.0 - lumps) * 0.15);
  surface.emissive = uAccent * glint * (0.5 + uGlow) * (1.0 - track * 0.7);
  surface.ao = 1.0 - track * 0.25 + tread * 0.1;
  surface.roughness = mix(0.75, 0.55, track) - glint * 0.4;
  surface.metalness = 0.0;
  surface.height = lumps * 0.35 + fine * 0.08 + berm * 0.35 - track * 0.55 + tread * 0.2;
  return surface;
}
`, { tileable: true }),
  nebula: makeVfxShader("Nebula", /* glsl */ `
void main() {
  vec2 uv = vUv;
  float t = shaderTime();
  vec2 q;
  vec2 r;
  float n = curlWarp(uv + vec2(t * 0.012, t * 0.008), tiles(2.0), vec2(0.8 + uWarp * 0.6), vec4(5.0, 7.0, 11.0, 13.0), 0.4, uSeed, q, r) * 0.5 + 0.5;
  float dust = fbm(uv + r * 0.05, tiles(4.0), 6, 0.0, t * 0.05, 0.55, 2.0, 0.0, uSeed);
  vec3 col = mix(uColorA, uColorB, smoothstep(0.2, 0.8, n));
  col = mix(col, uAccent, smoothstep(0.55, 1.0, n * dust * 1.6) * (0.6 + uGlow * 0.4));
  col *= 0.35 + dust * 0.9;
  vec2 starCell = floor(uv * tiles(48.0));
  float star = step(0.992, hash1D(starCell + uSeed));
  float twinkle = 0.5 + 0.5 * sin(t * 1.2 + hash1D(starCell) * 40.0);
  col += vec3(1.0) * star * twinkle * (0.8 + uGlow);
  gl_FragColor = vec4(grade(col), 1.0);
}
`),
  shield: makeVfxShader("Energy Shield", /* glsl */ `
void main() {
  vec2 uv = vUv;
  float t = shaderTime();
  float edge;
  vec4 h = tileHexagons(uv, tiles(8.0), false, edge);
  float id = hash1D(h.zw * 19.0 + uSeed);
  float line = 1.0 - smoothstep(0.0, 0.07 + uGlow * 0.04, edge);
  // 几道冲击波从不同中心扩散，波前经过的格子整块亮起
  float wave = 0.0;
  for (int i = 0; i < 3; i++) {
    vec2 center = hash2D(vec2(float(i) + uSeed, 3.0)) * 0.5 + 0.5;
    vec2 d = abs(h.zw - center);
    d = min(d, 1.0 - d);
    float ring = fract(length(d) * 2.2 - t * 0.15 - float(i) * 0.33);
    wave += pow(smoothstep(0.0, 0.08, ring) * smoothstep(0.25, 0.08, ring), 1.5);
  }
  vec3 col = uColorA;
  col += uColorB * line * (0.35 + 0.25 * id);
  col += uAccent * (line * 1.2 + 0.25) * wave;
  col += uAccent * step(0.97, id) * (0.5 + 0.5 * sin(t * 1.5 + id * 30.0)) * 0.4;
  gl_FragColor = vec4(grade(col), 1.0);
}
`),
  plasmaNet: makeVfxShader("Plasma Net", /* glsl */ `
void main() {
  vec2 uv = vUv;
  float t = shaderTime();
  vec2 warp = vec2(noise(uv, tiles(3.0), t * 0.2, uSeed), noise(uv, tiles(3.0), t * 0.2, uSeed + 9.0));
  vec3 v = voronoi(uv + warp * 0.02 * (1.0 + uWarp * 2.0), tiles(5.0), 1.0, t * 0.4, uSeed);
  float arc = 0.012 / (v.x + 0.012);
  float flicker = 0.75 + 0.25 * noise(uv * 4.0, tiles(12.0), t * 2.0, uSeed);
  vec3 col = uColorA + uColorB * hash1D(v.yz) * 0.25;
  col += mix(uColorB, uAccent, arc) * arc * flicker * (0.9 + uGlow);
  gl_FragColor = vec4(grade(col), 1.0);
}
`),
  lightning: makeVfxShader("Arc Lightning", /* glsl */ `
void main() {
  vec2 uv = vUv;
  float t = shaderTime();
  vec3 col = uColorA;
  // 三条横向电弧，每条用两层可平铺 Perlin 扭出锯齿，并随时间重新放电
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float strike = floor(t * 1.2 + fi * 1.7);
    float seed = uSeed + fi * 13.0 + strike;
    float y = (fi + 0.5) / 3.0;
    float jag = perlinNoise(vec2(uv.x, 0.5), vec2(tiles(4.0).x, 2.0), seed) * 0.12;
    jag += perlinNoise(vec2(uv.x, 0.5), vec2(tiles(16.0).x, 2.0), seed + 5.0) * 0.035;
    float d = abs(uv.y - y - jag * (0.6 + uWarp));
    float core = 0.0016 / (d + 0.0016);
    float halo = 0.02 / (d + 0.02);
    float alive = 0.55 + 0.45 * step(0.35, fract(t * 1.2 + fi * 1.7));
    col += (uAccent * core * 1.4 + uColorB * halo * 0.25 * (0.5 + uGlow)) * alive;
  }
  gl_FragColor = vec4(grade(col), 1.0);
}
`),
};

// 每个 Shader 在「速度 1」时的动画快慢：预设默认速度都是 1（动态效果）或 0（静态写实材质），
// 要整体调某个效果的快慢就改这里，不要改预设里的 uSpeed
const timeScales = {
  lookdev: 0,
  aurora: 0.55,
  lava: 0.42,
  ocean: 0.7,
  plasma: 0.85,
  stars: 0.35,
  marble: 0.22,
  fire: 0.9,
  neon: 0.65,
  wood: 0.3,
  rust: 0.3,
  scifi: 0.6,
  carbon: 0.3,
  rock: 0.3,
  hammered: 0.3,
  tiles: 0.3,
  caustics: 0.5,
  hologram: 0.7,
  vortex: 0.8,
  rain: 0.8,
  cells: 0.45,
  kintsugi: 0.3,
  crackedLava: 0.5,
  crystal: 0.15,
  hexArmor: 0.5,
  weave: 0.3,
  scales: 0.2,
  circuit: 0.6,
  biolume: 0.35,
  liquidChrome: 0.3,
  holoFoil: 0.25,
  ice: 0.2,
  diamond: 0.3,
  quartz: 0.1,
  emerald: 0.1,
  amber: 0.1,
  jade: 0.1,
  brushedScratch: 0.3,
  wornPaint: 0.3,
  damascus: 0.3,
  patina: 0.3,
  concrete: 0.3,
  granite: 0.3,
  terrazzo: 0.3,
  sand: 0.2,
  snow: 0.3,
  leather: 0.3,
  nebula: 0.3,
  shield: 0.6,
  plasmaNet: 0.5,
  lightning: 0.6,
  plasterWall: 0.3,
  stylizedBrick: 0.3,
  stoneWall: 0.3,
  limestoneBrick: 0.3,
  formworkConcrete: 0.3,
  mosaic: 0.3,
  treeBark: 0.3,
  snowTracks: 0.3,
};
for (const [id, scale] of Object.entries(timeScales)) shaders[id].timeScale = scale;

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

  gl_FragColor = vec4(ao, rough, metal, 0.5);
}
`,
  ormFlat: common + /* glsl */ `
void main() {
  gl_FragColor = vec4(1.0, 1.0, 1.0, 0.5);
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
  emissiveFlat: common + /* glsl */ `
void main() {
  gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
}
`,
};

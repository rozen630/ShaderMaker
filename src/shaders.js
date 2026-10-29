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

function makeSurfaceShader(name, definition) {
  const source = common + surfaceContract + definition;
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
    1.0
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
  lava: makeSurfaceShader("Molten Core", /* glsl */ `
SurfaceData sampleSurface(vec2 inputUv) {
  vec2 uv = inputUv - 0.5;
  float t = uTime * uSpeed;
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
  float t = uTime * uSpeed;
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
  marble: makeSurfaceShader("Liquid Marble", /* glsl */ `
SurfaceData sampleSurface(vec2 inputUv) {
  vec2 uv = inputUv - 0.5;
  float t = uTime * uSpeed * 0.35;
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
  wood: makeSurfaceShader("Oak Planks", /* glsl */ `
SurfaceData sampleSurface(vec2 inputUv) {
  vec2 p = inputUv * uScale;
  float row = floor(p.y * 2.0);
  vec2 local = vec2(p.x + hash(vec2(row, 3.0)) * 7.0, fract(p.y * 2.0));
  float seam = smoothstep(0.0, 0.035, local.y) * smoothstep(1.0, 0.965, local.y);
  vec2 q = vec2(local.x * 0.7, local.y * 0.5 + row * 3.1);
  float bend = fbm(q * vec2(1.3, 2.4) + uTime * uSpeed * 0.05) * (0.6 + uWarp);
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
  float t = uTime * uSpeed * 0.05;
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
  float pulse = 0.5 + 0.5 * sin(uTime * uSpeed * 2.0 + r * 30.0);
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
  float t = uTime * uSpeed + 23.0;
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
  float t = uTime * uSpeed;
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
  float t = uTime * uSpeed;
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
  float t = uTime * uSpeed;
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
  p += uWarp * 0.3 * vec2(fbm(p + uTime * uSpeed * 0.2), fbm(p - 3.7));
  vec3 v = voronoi(p, uTime * uSpeed);
  float membrane = 1.0 - smoothstep(0.0, 0.08 + uGlow * 0.04, v.y);
  float nucleus = smoothstep(0.2, 0.06, v.x);
  vec3 col = mix(uColorA, uColorB, v.z * 0.7 + v.x * 0.3);
  col += uAccent * membrane * (0.45 + uGlow * 0.5);
  col += mix(uColorB, uAccent, v.z) * nucleus * 0.5;
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
  emissiveFlat: common + /* glsl */ `
void main() {
  gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
}
`,
};

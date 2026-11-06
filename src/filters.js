// 画面滤镜注册表：每个滤镜一份数据（名字、口语关键词、参数、GLSL）。stylize.js 按它生成后处理 pass，
// 面板滑条、set_look 的 filters 参数、自然语言都从这里读，新增滤镜只改这个文件。
//
// 滤镜写法：GLSL 里定义 vec3 stylize(vec2 uv, vec3 src, vec2 frag)
//   uv   屏幕 0–1；src 当前输入颜色（显示空间，已色调映射）；frag 以 CSS 像素计的屏幕坐标
//   可用：tDiffuse（输入画面）、tND（法线 rgb + 线性深度 a，edges: true 时才有内容）、uResolution（物理像素）、
//   uPixelRatio、uTime，以及下面 filterLibrary 里的函数。参数 { key } 在 GLSL 里是 uniform float p_<key>。
// bloom：开着这个滤镜时的辉光强度（只在「全局」作用范围生效，叠加时取最大值）。

export const MAX_FILTERS = 3;

export const filterLibrary = /* glsl */ `
float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
vec3 saturate3(vec3 c, float s) { return mix(vec3(luma(c)), c, s); }
float rnd(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(rnd(i), rnd(i + vec2(1.0, 0.0)), f.x), mix(rnd(i + vec2(0.0, 1.0)), rnd(i + vec2(1.0, 1.0)), f.x), f.y);
}

// 铅笔排线：每条笔触位置轻微抖动、有断笔、有轻重
float pencilLayer(vec2 p, float angle, float period, float seed) {
  vec2 d = vec2(cos(angle), sin(angle));
  float across = dot(p, vec2(-d.y, d.x));
  float along = dot(p, d);
  float row = floor(across / period);
  float wobble = (vnoise(vec2(row * 1.7 + seed, along * 0.015)) - 0.5) * period * 0.5;
  float f = abs(fract((across + wobble) / period) - 0.5) * 2.0;
  float line = 1.0 - smoothstep(0.0, 0.42, f);
  float gaps = smoothstep(0.22, 0.42, vnoise(vec2(row * 3.1 + seed, along / 38.0)));
  float pressure = 0.55 + 0.45 * vnoise(vec2(row * 0.7 + seed, along / 24.0));
  return line * gaps * pressure;
}

float bayer2(vec2 a) { a = floor(a); return fract(dot(a, vec2(0.5, a.y * 0.75))); }
float bayer4(vec2 a) { return bayer2(0.5 * a) * 0.25 + bayer2(a); }

// 法线 + 深度不连续处出线；colorWeight > 0 时叠加颜色 Sobel
float edgeAt(vec2 uv, float width, float colorWeight) {
  vec2 px = width * uPixelRatio / uResolution;
  vec4 c = texture2D(tND, uv);
  vec4 l = texture2D(tND, uv - vec2(px.x, 0.0));
  vec4 r = texture2D(tND, uv + vec2(px.x, 0.0));
  vec4 d = texture2D(tND, uv - vec2(0.0, px.y));
  vec4 u = texture2D(tND, uv + vec2(0.0, px.y));
  float dn = length(l.rgb - r.rgb) + length(d.rgb - u.rgb);
  float dd = (abs(l.a - r.a) + abs(d.a - u.a)) / max(c.a, 0.02);
  float e = max(smoothstep(0.35, 0.75, dn), smoothstep(0.04, 0.1, dd));
  if (colorWeight > 0.0) {
    float cl = luma(texture2D(tDiffuse, uv - vec2(px.x, 0.0)).rgb);
    float cr = luma(texture2D(tDiffuse, uv + vec2(px.x, 0.0)).rgb);
    float cd = luma(texture2D(tDiffuse, uv - vec2(0.0, px.y)).rgb);
    float cu = luma(texture2D(tDiffuse, uv + vec2(0.0, px.y)).rgb);
    e = max(e, smoothstep(0.12, 0.3, abs(cl - cr) + abs(cd - cu)) * colorWeight);
  }
  return clamp(e, 0.0, 1.0);
}

vec3 bands(vec3 c, float steps, float softness) {
  float l = luma(c);
  float x = l * steps;
  float q = (floor(x) + smoothstep(0.5 - softness, 0.5 + softness, fract(x))) / steps;
  return l > 0.002 ? clamp(c * (q / l), 0.0, 1.0) : c;
}

// Kuwahara：四个象限里取方差最小那块的均值，笔触感；radius 以 CSS 像素计
vec3 kuwahara(vec2 uv, float radius) {
  vec2 px = radius * uPixelRatio / uResolution;
  vec3 m0 = vec3(0.0); vec3 m1 = vec3(0.0); vec3 m2 = vec3(0.0); vec3 m3 = vec3(0.0);
  vec3 s0 = vec3(0.0); vec3 s1 = vec3(0.0); vec3 s2 = vec3(0.0); vec3 s3 = vec3(0.0);
  for (int j = 0; j <= 4; j++) {
    for (int i = 0; i <= 4; i++) {
      vec2 o = vec2(float(i), float(j)) * px;
      vec3 a = texture2D(tDiffuse, uv + vec2(-o.x, -o.y)).rgb; m0 += a; s0 += a * a;
      vec3 b = texture2D(tDiffuse, uv + vec2(o.x, -o.y)).rgb; m1 += b; s1 += b * b;
      vec3 c = texture2D(tDiffuse, uv + vec2(o.x, o.y)).rgb; m2 += c; s2 += c * c;
      vec3 d = texture2D(tDiffuse, uv + vec2(-o.x, o.y)).rgb; m3 += d; s3 += d * d;
    }
  }
  m0 /= 25.0; m1 /= 25.0; m2 /= 25.0; m3 /= 25.0;
  float v0 = dot(abs(s0 / 25.0 - m0 * m0), vec3(1.0));
  float v1 = dot(abs(s1 / 25.0 - m1 * m1), vec3(1.0));
  float v2 = dot(abs(s2 / 25.0 - m2 * m2), vec3(1.0));
  float v3 = dot(abs(s3 / 25.0 - m3 * m3), vec3(1.0));
  vec3 best = m0; float bv = v0;
  if (v1 < bv) { best = m1; bv = v1; }
  if (v2 < bv) { best = m2; bv = v2; }
  if (v3 < bv) { best = m3; }
  return best;
}
`;

const list = [
  {
    id: "pixel",
    name: "像素",
    keys: ["像素", "pixel", "8bit", "8-bit", "复古游戏"],
    edges: true,
    params: [
      { key: "size", label: "像素大小", min: 2, max: 16, step: 1, default: 5 },
      { key: "levels", label: "色阶", min: 2, max: 16, step: 1, default: 6 },
    ],
    code: /* glsl */ `
vec3 stylize(vec2 uv, vec3 src, vec2 frag) {
  float size = p_size * uPixelRatio;
  vec2 cells = uResolution / size;
  vec2 puv = (floor(uv * cells) + 0.5) / cells;
  vec3 c = texture2D(tDiffuse, puv).rgb;
  float dither = bayer4(floor(gl_FragCoord.xy / size)) - 0.5;
  c = floor(saturate3(pow(c, vec3(0.85)), 1.3) * p_levels + 0.5 + dither * 0.45) / p_levels;
  return mix(c, c * 0.25, edgeAt(puv, 2.0, 0.0));
}`,
  },
  {
    id: "comic",
    name: "漫画",
    keys: ["漫画", "美漫", "网点", "comic", "halftone"],
    edges: true,
    params: [
      { key: "dot", label: "网点大小", min: 3, max: 16, step: 0.5, default: 6 },
      { key: "ink", label: "勾线粗细", min: 0.5, max: 4, step: 0.1, default: 2.2 },
    ],
    code: /* glsl */ `
vec3 stylize(vec2 uv, vec3 src, vec2 frag) {
  vec3 lifted = pow(src, vec3(0.6)) * 1.15;
  vec3 flatCol = saturate3(bands(lifted, 3.0, 0.03), 1.5);
  vec2 hp = mat2(0.7071, -0.7071, 0.7071, 0.7071) * frag / p_dot;
  float radius = sqrt(clamp(1.0 - luma(lifted) * 1.25, 0.0, 1.0)) * 0.6;
  float dotMask = smoothstep(radius + 0.06, radius - 0.06, length(fract(hp) - 0.5));
  vec3 col = flatCol * (1.0 - dotMask * 0.55);
  return mix(col * vec3(1.0, 0.98, 0.92), vec3(0.03), edgeAt(uv, p_ink, 0.6));
}`,
  },
  {
    id: "oil",
    name: "油画",
    keys: ["油画", "oil painting", "oil"],
    bloom: 0.15,
    params: [{ key: "brush", label: "笔触大小", min: 1, max: 4, step: 0.1, default: 2.2 }],
    code: /* glsl */ `
vec3 stylize(vec2 uv, vec3 src, vec2 frag) {
  vec3 k = kuwahara(uv, p_brush);
  float canvas = 0.94 + 0.06 * rnd(floor(frag / 2.0));
  return saturate3(pow(k, vec3(0.9)), 1.22) * canvas;
}`,
  },
  {
    id: "sketch",
    name: "素描",
    keys: ["素描", "铅笔", "手绘", "sketch", "pencil"],
    edges: true,
    params: [
      { key: "hatch", label: "排线间距", min: 0.5, max: 2.5, step: 0.05, default: 1 },
      { key: "line", label: "轮廓粗细", min: 0.5, max: 3, step: 0.1, default: 1 },
    ],
    code: /* glsl */ `
vec3 stylize(vec2 uv, vec3 src, vec2 frag) {
  // 先按亮度自动拉伸（暗场景也能画出层次），再铺铅灰明暗 + 三层排线 + 轮廓
  float l = pow(clamp(luma(src) * 1.8, 0.0, 1.0), 0.75);
  float tone = 1.0 - l;
  float ink = pencilLayer(frag, 0.62, 5.5 * p_hatch, 1.0) * smoothstep(0.28, 0.48, tone);
  ink = max(ink, pencilLayer(frag, -0.55, 6.0 * p_hatch, 7.0) * smoothstep(0.52, 0.7, tone));
  ink = max(ink, pencilLayer(frag, 1.45, 4.5 * p_hatch, 13.0) * smoothstep(0.74, 0.9, tone) * 0.9);
  float contour = edgeAt(uv, p_line, 0.6);
  contour *= 0.6 + 0.4 * vnoise(frag / 6.0);
  float grain = vnoise(frag * 0.9) * 0.5 + vnoise(frag / 9.0) * 0.5;
  vec3 paper = vec3(0.95, 0.93, 0.88) * (0.95 + 0.05 * grain);
  vec3 graphite = vec3(0.22, 0.22, 0.25);
  vec3 col = mix(paper, graphite, tone * 0.28 * (0.8 + 0.2 * grain));
  return mix(col, graphite, clamp(ink * 0.75 + contour * 0.9, 0.0, 1.0));
}`,
  },
  {
    id: "cyber",
    name: "赛博",
    keys: ["赛博", "cyberpunk", "cyber", "故障风", "glitch art"],
    edges: true,
    bloom: 0.9,
    params: [
      { key: "glitch", label: "故障频率", min: 0, max: 0.2, step: 0.005, default: 0.025 },
      { key: "scan", label: "扫描线", min: 0, max: 0.4, step: 0.01, default: 0.14 },
    ],
    code: /* glsl */ `
vec3 stylize(vec2 uv, vec3 src, vec2 frag) {
  float block = floor(uv.y * 28.0);
  float glitch = step(1.0 - p_glitch, rnd(vec2(block, floor(uTime * 9.0))));
  vec2 guv = uv + vec2(glitch * (rnd(vec2(block, 3.0)) - 0.5) * 0.04, 0.0);
  vec2 ca = (guv - 0.5) * 0.008 + vec2(glitch * 0.004, 0.0);
  vec3 c = vec3(texture2D(tDiffuse, guv + ca).r, texture2D(tDiffuse, guv).g, texture2D(tDiffuse, guv - ca).b);
  float l = luma(c);
  vec3 col = c * 0.65 + mix(vec3(0.0, 0.55, 0.7), vec3(1.0, 0.25, 0.85), smoothstep(0.2, 0.8, l)) * l * 0.6;
  col += vec3(0.2, 1.0, 0.95) * edgeAt(guv, 1.0, 0.0) * 0.55;
  col *= 1.0 - p_scan + p_scan * sin(gl_FragCoord.y * 1.4);
  return col * smoothstep(1.0, 0.35, length(uv - 0.5));
}`,
  },
  {
    id: "film",
    name: "胶片",
    keys: ["胶片", "电影感", "电影", "film", "cinematic"],
    bloom: 0.25,
    params: [
      { key: "grain", label: "颗粒", min: 0, max: 0.25, step: 0.005, default: 0.07 },
      { key: "vignette", label: "暗角", min: 0, max: 0.7, step: 0.01, default: 0.38 },
    ],
    code: /* glsl */ `
vec3 stylize(vec2 uv, vec3 src, vec2 frag) {
  vec3 c = pow(src, vec3(0.94, 1.0, 1.1));
  c = c * 0.9 + vec3(0.05, 0.04, 0.025);
  c = mix(c, smoothstep(0.0, 1.0, c), 0.45);
  c += (rnd(frag + fract(uTime * 7.31) * 113.0) - 0.5) * p_grain;
  return c * mix(1.0 - p_vignette, 1.0, smoothstep(0.9, 0.3, length(uv - 0.5)));
}`,
  },
  {
    id: "blueprint",
    name: "蓝图",
    keys: ["蓝图", "线稿", "工程图", "blueprint", "wireframe"],
    edges: true,
    params: [
      { key: "grid", label: "网格大小", min: 8, max: 64, step: 1, default: 24 },
      { key: "line", label: "线条粗细", min: 0.5, max: 3, step: 0.1, default: 1 },
    ],
    code: /* glsl */ `
vec3 stylize(vec2 uv, vec3 src, vec2 frag) {
  vec3 bg = vec3(0.05, 0.2, 0.45);
  vec2 g = abs(fract(frag / p_grid) - 0.5);
  vec2 G = abs(fract(frag / (p_grid * 5.0)) - 0.5);
  float minor = 1.0 - smoothstep(0.0, 0.04, 0.5 - max(g.x, g.y));
  float major = 1.0 - smoothstep(0.0, 0.012, 0.5 - max(G.x, G.y));
  vec3 col = bg + vec3(0.4, 0.6, 1.0) * (minor * 0.07 + major * 0.14) + luma(src) * 0.1;
  return mix(col, vec3(0.88, 0.95, 1.0), edgeAt(uv, p_line, 0.5));
}`,
  },
];

// none 只是「关掉滤镜」的选项，不是可叠加的滤镜
export const noFilter = { id: "none", name: "无", keys: ["无滤镜", "去掉滤镜", "关掉滤镜", "no filter"] };

export const filters = Object.fromEntries(
  list.map((filter) => [filter.id, { bloom: 0, edges: false, params: [], ...filter }]),
);

export function filterDefaults(id) {
  return Object.fromEntries((filters[id]?.params || []).map((param) => [param.key, param.default]));
}

// 把 set_look / 自然语言给的滤镜列表整理成 [{ id, amount, params }]：去掉未知 id 和重复项，参数截断到范围内
export function normalizeChain(input, warnings = []) {
  const chain = [];
  for (const raw of Array.isArray(input) ? input : []) {
    const entry = typeof raw === "string" ? { id: raw } : raw || {};
    const filter = filters[entry.id];
    if (!filter) {
      if (entry.id !== "none") warnings.push(`未知的滤镜：${entry.id}`);
      continue;
    }
    if (chain.some((item) => item.id === filter.id)) continue;
    if (chain.length >= MAX_FILTERS) {
      warnings.push(`最多叠加 ${MAX_FILTERS} 个滤镜，${filter.name} 没有加上`);
      continue;
    }
    const params = filterDefaults(filter.id);
    for (const [key, value] of Object.entries(entry.params || {})) {
      const def = filter.params.find((param) => param.key === key);
      if (!def) {
        warnings.push(`${filter.name} 没有参数 ${key}`);
        continue;
      }
      if (Number.isFinite(Number(value))) params[key] = Math.min(def.max, Math.max(def.min, Number(value)));
    }
    const amount = Number.isFinite(Number(entry.amount)) ? Math.min(1, Math.max(0, Number(entry.amount))) : 1;
    chain.push({ id: filter.id, amount, params });
  }
  return chain;
}

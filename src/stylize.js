// 一键风格化：作为后处理叠在 PBR 渲染之上，不改材质。
// 管线：RenderPass → Bloom → OutputPass（色调映射 + sRGB）→ StylePass（显示空间）
import * as THREE from "three";
import { applyFxVertex } from "./materialFx.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";

// 画面滤镜（与 PBR / NPR 渲染模式正交）。index 对应 GLSL 里的 uStyle；edges = 需要法线/深度描边预渲染
// 卡通 / 动漫已由 npr.js 的真实光照模型取代，1、2 号分支不再使用
export const styles = {
  none: { id: "none", name: "无", index: 0, bloom: 0, edges: false, keys: ["无滤镜", "去掉滤镜", "关掉滤镜", "no filter"] },
  pixel: { id: "pixel", name: "像素", index: 3, bloom: 0, edges: true, keys: ["像素", "pixel", "8bit", "8-bit", "复古游戏"] },
  comic: { id: "comic", name: "漫画", index: 4, bloom: 0, edges: true, keys: ["漫画", "美漫", "网点", "comic", "halftone"] },
  oil: { id: "oil", name: "油画", index: 5, bloom: 0.15, edges: false, keys: ["油画", "oil painting", "oil"] },
  sketch: { id: "sketch", name: "素描", index: 6, bloom: 0, edges: true, keys: ["素描", "铅笔", "手绘", "sketch", "pencil"] },
  cyber: { id: "cyber", name: "赛博", index: 7, bloom: 0.9, edges: true, keys: ["赛博", "cyberpunk", "cyber", "故障风", "glitch art"] },
  film: { id: "film", name: "胶片", index: 8, bloom: 0.25, edges: false, keys: ["胶片", "电影感", "电影", "film", "cinematic"] },
  blueprint: { id: "blueprint", name: "蓝图", index: 9, bloom: 0, edges: true, keys: ["蓝图", "线稿", "工程图", "blueprint", "wireframe"] },
};

export const defaultStyle = "none";

// 「仅模型」作用范围：放在这个图层上的物体才会被滤镜处理
export const MASK_LAYER = 5;

const styleVertex = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const styleFragment = /* glsl */ `
uniform sampler2D tDiffuse;
uniform sampler2D tND;
uniform vec2 uResolution;
uniform float uPixelRatio;
uniform float uTime;
uniform float uAmount;
uniform int uStyle;
uniform sampler2D tMask;
uniform float uMaskOn;
varying vec2 vUv;

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

// 仅模型模式：主体遮罩稍微外扩，让主体描边也能被滤镜处理
float maskAt(vec2 uv) {
  if (uMaskOn < 0.5) return 1.0;
  vec2 px = 2.0 * uPixelRatio / uResolution;
  float m = texture2D(tMask, uv).r;
  m = max(m, texture2D(tMask, uv + vec2(px.x, 0.0)).r);
  m = max(m, texture2D(tMask, uv - vec2(px.x, 0.0)).r);
  m = max(m, texture2D(tMask, uv + vec2(0.0, px.y)).r);
  m = max(m, texture2D(tMask, uv - vec2(0.0, px.y)).r);
  return m;
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

vec3 kuwahara(vec2 uv) {
  vec2 px = 2.2 * uPixelRatio / uResolution;
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

void main() {
  vec2 uv = vUv;
  vec3 src = texture2D(tDiffuse, uv).rgb;
  vec3 col = src;
  vec2 frag = gl_FragCoord.xy / uPixelRatio;

  if (uStyle == 3) {
    float size = 5.0 * uPixelRatio;
    vec2 cells = uResolution / size;
    vec2 puv = (floor(uv * cells) + 0.5) / cells;
    vec3 c = texture2D(tDiffuse, puv).rgb;
    float dither = bayer4(floor(gl_FragCoord.xy / size)) - 0.5;
    c = floor(saturate3(pow(c, vec3(0.85)), 1.3) * 6.0 + 0.5 + dither * 0.45) / 6.0;
    col = mix(c, c * 0.25, edgeAt(puv, 2.0, 0.0));
  } else if (uStyle == 4) {
    vec3 lifted = pow(src, vec3(0.6)) * 1.15;
    vec3 flatCol = saturate3(bands(lifted, 3.0, 0.03), 1.5);
    vec2 hp = mat2(0.7071, -0.7071, 0.7071, 0.7071) * frag / 6.0;
    float radius = sqrt(clamp(1.0 - luma(lifted) * 1.25, 0.0, 1.0)) * 0.6;
    float dotMask = smoothstep(radius + 0.06, radius - 0.06, length(fract(hp) - 0.5));
    col = flatCol * (1.0 - dotMask * 0.55);
    col = mix(col * vec3(1.0, 0.98, 0.92), vec3(0.03), edgeAt(uv, 2.2, 0.6));
  } else if (uStyle == 5) {
    vec3 k = kuwahara(uv);
    float canvas = 0.94 + 0.06 * rnd(floor(frag / 2.0));
    col = saturate3(pow(k, vec3(0.9)), 1.22) * canvas;
  } else if (uStyle == 6) {
    // 先按亮度自动拉伸（暗场景也能画出层次），再铺铅灰明暗 + 三层排线 + 轮廓
    float l = pow(clamp(luma(src) * 1.8, 0.0, 1.0), 0.75);
    float tone = 1.0 - l;
    float ink = pencilLayer(frag, 0.62, 5.5, 1.0) * smoothstep(0.28, 0.48, tone);
    ink = max(ink, pencilLayer(frag, -0.55, 6.0, 7.0) * smoothstep(0.52, 0.7, tone));
    ink = max(ink, pencilLayer(frag, 1.45, 4.5, 13.0) * smoothstep(0.74, 0.9, tone) * 0.9);
    float contour = edgeAt(uv, 1.0, 0.6);
    contour *= 0.6 + 0.4 * vnoise(frag / 6.0);
    float grain = vnoise(frag * 0.9) * 0.5 + vnoise(frag / 9.0) * 0.5;
    vec3 paper = vec3(0.95, 0.93, 0.88) * (0.95 + 0.05 * grain);
    vec3 graphite = vec3(0.22, 0.22, 0.25);
    col = mix(paper, graphite, tone * 0.28 * (0.8 + 0.2 * grain));
    col = mix(col, graphite, clamp(ink * 0.75 + contour * 0.9, 0.0, 1.0));
  } else if (uStyle == 7) {
    float block = floor(uv.y * 28.0);
    float glitch = step(0.975, rnd(vec2(block, floor(uTime * 9.0))));
    vec2 guv = uv + vec2(glitch * (rnd(vec2(block, 3.0)) - 0.5) * 0.04, 0.0);
    vec2 ca = (guv - 0.5) * 0.008 + vec2(glitch * 0.004, 0.0);
    vec3 c = vec3(texture2D(tDiffuse, guv + ca).r, texture2D(tDiffuse, guv).g, texture2D(tDiffuse, guv - ca).b);
    float l = luma(c);
    col = c * 0.65 + mix(vec3(0.0, 0.55, 0.7), vec3(1.0, 0.25, 0.85), smoothstep(0.2, 0.8, l)) * l * 0.6;
    col += vec3(0.2, 1.0, 0.95) * edgeAt(guv, 1.0, 0.0) * 0.55;
    col *= 0.86 + 0.14 * sin(gl_FragCoord.y * 1.4);
    col *= smoothstep(1.0, 0.35, length(uv - 0.5));
  } else if (uStyle == 8) {
    vec3 c = pow(src, vec3(0.94, 1.0, 1.1));
    c = c * 0.9 + vec3(0.05, 0.04, 0.025);
    c = mix(c, smoothstep(0.0, 1.0, c), 0.45);
    c += (rnd(frag + fract(uTime * 7.31) * 113.0) - 0.5) * 0.07;
    col = c * mix(0.62, 1.0, smoothstep(0.9, 0.3, length(uv - 0.5)));
  } else if (uStyle == 9) {
    vec3 bg = vec3(0.05, 0.2, 0.45);
    vec2 g = abs(fract(frag / 24.0) - 0.5);
    vec2 G = abs(fract(frag / 120.0) - 0.5);
    float minor = 1.0 - smoothstep(0.0, 0.04, 0.5 - max(g.x, g.y));
    float major = 1.0 - smoothstep(0.0, 0.012, 0.5 - max(G.x, G.y));
    col = bg + vec3(0.4, 0.6, 1.0) * (minor * 0.07 + major * 0.14) + luma(src) * 0.1;
    col = mix(col, vec3(0.88, 0.95, 1.0), edgeAt(uv, 1.0, 0.5));
  }

  gl_FragColor = vec4(mix(src, col, uAmount * maskAt(uv)), 1.0);
}
`;

// 输出 view-space 法线（rgb）与线性深度（a），只给描边用。
// 支持体素（实例化）和主体的积雪 / 置换外推（applyFxVertex 接在 begin_vertex 后面）
const normalDepthMaterial = new THREE.ShaderMaterial({
  side: THREE.DoubleSide,
  vertexShader: /* glsl */ `
varying vec3 vNormalView;
varying float vDepth;
void main() {
  #include <begin_vertex>
  vec4 local = vec4(transformed, 1.0);
#ifdef USE_INSTANCING
  local = instanceMatrix * local;
#endif
  vec4 mv = modelViewMatrix * local;
  vNormalView = normalize(normalMatrix * normal);
  vDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
}
`,
  fragmentShader: /* glsl */ `
varying vec3 vNormalView;
varying float vDepth;
void main() {
  vec3 n = normalize(vNormalView);
  if (!gl_FrontFacing) n = -n;
  gl_FragColor = vec4(n * 0.5 + 0.5, vDepth / 20.0);
}
`,
});
applyFxVertex(normalDepthMaterial);

export function createStylizer(renderer, scene, camera) {
  // stencilBuffer：NPR 主体描边靠模板缓冲避开主体本身
  const sceneTarget = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4, stencilBuffer: true });
  const composer = new EffectComposer(renderer, sceneTarget);
  composer.addPass(new RenderPass(scene, camera));
  const bloomPass = new UnrealBloomPass(new THREE.Vector2(1, 1), 0, 0.55, 0.82);
  composer.addPass(bloomPass);
  composer.addPass(new OutputPass());
  const stylePass = new ShaderPass({
    uniforms: {
      tDiffuse: { value: null },
      tND: { value: null },
      uResolution: { value: new THREE.Vector2(1, 1) },
      uPixelRatio: { value: 1 },
      uTime: { value: 0 },
      uAmount: { value: 1 },
      uStyle: { value: 0 },
      tMask: { value: null },
      uMaskOn: { value: 0 },
    },
    vertexShader: styleVertex,
    fragmentShader: styleFragment,
  });
  composer.addPass(stylePass);

  const ndTarget = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType });
  stylePass.uniforms.tND.value = ndTarget.texture;
  const maskTarget = new THREE.WebGLRenderTarget(1, 1);
  stylePass.uniforms.tMask.value = maskTarget.texture;
  const maskMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });
  applyFxVertex(maskMaterial);
  let subjectOnly = true;
  const clearColor = new THREE.Color();

  let current = styles[defaultStyle];
  let amount = 1;
  let bypass = false;

  function syncPasses() {
    const active = !bypass && current.index !== 0;
    stylePass.enabled = active;
    // 仅模型时不开 Bloom：辉光会扩散到背景和地面
    bloomPass.enabled = active && current.bloom > 0 && !subjectOnly;
    stylePass.uniforms.uMaskOn.value = subjectOnly ? 1 : 0;
    bloomPass.strength = current.bloom;
    stylePass.uniforms.uStyle.value = current.index;
    stylePass.uniforms.uAmount.value = amount;
  }

  function renderNormalDepth() {
    const background = scene.background;
    const autoShadow = renderer.shadowMap.autoUpdate;
    const clearAlpha = renderer.getClearAlpha();
    renderer.getClearColor(clearColor);
    scene.background = null;
    scene.overrideMaterial = normalDepthMaterial;
    renderer.shadowMap.autoUpdate = false;
    renderer.setClearColor(0x8080ff, 1);
    renderer.setRenderTarget(ndTarget);
    renderer.clear();
    renderer.render(scene, camera);
    renderer.setRenderTarget(null);
    renderer.setClearColor(clearColor, clearAlpha);
    renderer.shadowMap.autoUpdate = autoShadow;
    scene.overrideMaterial = null;
    scene.background = background;
  }

  // 只渲染 MASK_LAYER 上的物体（主体 + 主体描边）为白色
  function renderMask() {
    const background = scene.background;
    const autoShadow = renderer.shadowMap.autoUpdate;
    const clearAlpha = renderer.getClearAlpha();
    const layers = camera.layers.mask;
    renderer.getClearColor(clearColor);
    scene.background = null;
    scene.overrideMaterial = maskMaterial;
    camera.layers.set(MASK_LAYER);
    renderer.shadowMap.autoUpdate = false;
    renderer.setClearColor(0x000000, 1);
    renderer.setRenderTarget(maskTarget);
    renderer.clear();
    renderer.render(scene, camera);
    renderer.setRenderTarget(null);
    renderer.setClearColor(clearColor, clearAlpha);
    renderer.shadowMap.autoUpdate = autoShadow;
    camera.layers.mask = layers;
    scene.overrideMaterial = null;
    scene.background = background;
  }

  syncPasses();

  return {
    get style() {
      return current;
    },
    setStyle(id) {
      current = styles[id] || styles[defaultStyle];
      syncPasses();
      return current;
    },
    setAmount(value) {
      amount = value;
      syncPasses();
    },
    // 通道查看时临时关掉风格，保证看到的是原始贴图
    setBypass(value) {
      bypass = value;
      syncPasses();
    },
    setSubjectOnly(value) {
      subjectOnly = value;
      syncPasses();
    },
    setSize(width, height, pixelRatio) {
      composer.setPixelRatio(pixelRatio);
      composer.setSize(width, height);
      ndTarget.setSize(Math.round(width * pixelRatio), Math.round(height * pixelRatio));
      maskTarget.setSize(Math.round(width * pixelRatio), Math.round(height * pixelRatio));
      stylePass.uniforms.uResolution.value.set(width * pixelRatio, height * pixelRatio);
      stylePass.uniforms.uPixelRatio.value = pixelRatio;
    },
    render(time) {
      stylePass.uniforms.uTime.value = time;
      if (stylePass.enabled && current.edges) renderNormalDepth();
      if (stylePass.enabled && subjectOnly) renderMask();
      composer.render();
    },
  };
}

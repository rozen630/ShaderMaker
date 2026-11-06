// 一键风格化：作为后处理叠在 PBR 渲染之上，不改材质。
// 管线：RenderPass → Bloom → OutputPass（色调映射 + sRGB）→ 滤镜 pass × 最多 3 个（显示空间，按叠加顺序）
import * as THREE from "three";
import { applyFxVertex } from "./materialFx.js";
import { applyInstanceVertex } from "./effects.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { filters, filterLibrary, normalizeChain, MAX_FILTERS } from "./filters.js";

// 画面滤镜的数据在 filters.js；这里只负责把它们编译成后处理 pass、按顺序叠加
// 「仅模型」作用范围：放在这个图层上的物体才会被滤镜处理
export const MASK_LAYER = 5;

const styleVertex = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

// 每个滤镜一个程序：公共 uniform + 自己的参数 uniform + 函数库 + stylize()
function filterFragment(filter) {
  const params = filter.params.map((param) => `uniform float p_${param.key};`).join("\n");
  return /* glsl */ `
uniform sampler2D tDiffuse;
uniform sampler2D tND;
uniform vec2 uResolution;
uniform float uPixelRatio;
uniform float uTime;
uniform float uAmount;
uniform float uFilterAmount;
uniform sampler2D tMask;
uniform float uMaskOn;
${params}
varying vec2 vUv;
${filterLibrary}

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
${filter.code}

void main() {
  vec2 uv = vUv;
  vec3 src = texture2D(tDiffuse, uv).rgb;
  vec3 col = stylize(uv, src, gl_FragCoord.xy / uPixelRatio);
  gl_FragColor = vec4(mix(src, col, uAmount * uFilterAmount * maskAt(uv)), 1.0);
}
`;
}

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
applyInstanceVertex(normalDepthMaterial);

export function createStylizer(renderer, scene, camera) {
  // stencilBuffer：NPR 主体描边靠模板缓冲避开主体本身
  const sceneTarget = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4, stencilBuffer: true });
  const composer = new EffectComposer(renderer, sceneTarget);
  composer.addPass(new RenderPass(scene, camera));
  const bloomPass = new UnrealBloomPass(new THREE.Vector2(1, 1), 0, 0.55, 0.82);
  composer.addPass(bloomPass);
  composer.addPass(new OutputPass());

  const ndTarget = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType });
  const maskTarget = new THREE.WebGLRenderTarget(1, 1);
  // 所有滤镜程序共用这些 uniform 对象（改一处全部生效）
  const shared = {
    tND: { value: ndTarget.texture },
    uResolution: { value: new THREE.Vector2(1, 1) },
    uPixelRatio: { value: 1 },
    uTime: { value: 0 },
    uAmount: { value: 1 },
    tMask: { value: maskTarget.texture },
    uMaskOn: { value: 0 },
  };
  // 滤镜程序按需编译、缓存
  const materials = new Map();
  function materialFor(id) {
    if (!materials.has(id)) {
      const filter = filters[id];
      const uniforms = { ...shared, tDiffuse: { value: null }, uFilterAmount: { value: 1 } };
      for (const param of filter.params) uniforms[`p_${param.key}`] = { value: param.default };
      materials.set(id, new THREE.ShaderMaterial({ uniforms, vertexShader: styleVertex, fragmentShader: filterFragment(filter) }));
    }
    return materials.get(id);
  }
  // 叠加用的几个 pass，按 chain 顺序换上对应滤镜的程序
  const firstFilter = Object.keys(filters)[0];
  const slots = Array.from({ length: MAX_FILTERS }, () => {
    const pass = new ShaderPass(materialFor(firstFilter));
    pass.enabled = false;
    composer.addPass(pass);
    return pass;
  });

  const maskMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });
  applyFxVertex(maskMaterial);
  applyInstanceVertex(maskMaterial);
  let subjectOnly = true;
  const clearColor = new THREE.Color();

  let chain = [];
  let amount = 1;
  let bypass = false;

  function syncPasses() {
    const active = !bypass && chain.length > 0;
    slots.forEach((pass, index) => {
      const entry = chain[index];
      pass.enabled = active && Boolean(entry);
      if (!entry) return;
      const material = materialFor(entry.id);
      pass.material = material;
      pass.uniforms = material.uniforms;
      material.uniforms.uFilterAmount.value = entry.amount;
      for (const [key, value] of Object.entries(entry.params)) material.uniforms[`p_${key}`].value = value;
    });
    const bloom = Math.max(0, ...chain.map((entry) => filters[entry.id].bloom));
    // 仅模型时不开 Bloom：辉光会扩散到背景和地面
    bloomPass.enabled = active && bloom > 0 && !subjectOnly;
    bloomPass.strength = bloom;
    shared.uMaskOn.value = subjectOnly ? 1 : 0;
    shared.uAmount.value = amount;
  }

  const needsEdges = () => chain.some((entry) => filters[entry.id].edges);

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
    // 当前叠加的滤镜 [{ id, amount, params }]（副本）
    get chain() {
      return chain.map((entry) => ({ ...entry, params: { ...entry.params } }));
    },
    setChain(next, warnings = []) {
      chain = normalizeChain(next, warnings);
      syncPasses();
      return this.chain;
    },
    // 只改某个已叠加滤镜的强度 / 参数
    updateFilter(id, { amount: filterAmount, params } = {}) {
      const entry = chain.find((item) => item.id === id);
      if (!entry) return;
      const [next] = normalizeChain([{ id, amount: filterAmount ?? entry.amount, params: { ...entry.params, ...params } }]);
      Object.assign(entry, next);
      syncPasses();
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
      shared.uResolution.value.set(width * pixelRatio, height * pixelRatio);
      shared.uPixelRatio.value = pixelRatio;
    },
    render(time) {
      shared.uTime.value = time;
      const active = slots[0].enabled;
      if (active && needsEdges()) renderNormalDepth();
      if (active && subjectOnly) renderMask();
      composer.render();
    },
  };
}

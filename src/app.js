import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RGBELoader } from "three/addons/loaders/RGBELoader.js";
import { loadPackedHdr } from "./packedHdr.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { vertexShader, shaders, channelShaders } from "./shaders.js";
import { presets, pbrCategories, shaderCategories, sliderGroups, sliderDefs, shaderPreset } from "./presets.js";
import {
  shaderGuide,
  libraryReference,
  customCategory,
  checkShader,
  formatErrors,
  buildShader,
  defaultValues,
  loadCustomShaders,
  saveCustomShader,
  removeCustomShader,
} from "./customShaders.js";
import { interpretPrompt, hintPrompts } from "./nl.js";
import { environments, defaultEnvironment } from "./environments.js";
import { createStylizer, styles, defaultStyle, MASK_LAYER } from "./stylize.js";
import { createNpr, nprPresets, nprSliders, defaultNprPreset } from "./npr.js";
import {
  displayModels,
  defaultDisplayModel,
  loadDisplayModel,
  calibrationColor,
  assignParts,
  forgetDisplayModel,
  measureExposure,
} from "./models.js";
import { voxelResolution, voxelPresets, applyVoxelSupport, voxelize, buildVoxelMesh } from "./voxel.js";
import {
  applyTriplanar,
  updateTriplanar,
  createTiler,
  triplanarUniforms,
  triplanarVertexHead,
  triplanarVertexBody,
  triplanarFragmentHead,
} from "./triplanar.js";
import { applyMaterialFx, applyFxVertex, materialFxUniforms } from "./materialFx.js";
import {
  effectInputs,
  effectGuide,
  effectUses,
  setActiveEffect,
  activeEffect,
  effectParamValue,
  setEffectParam,
  createInstanceLayer,
  normalizeEffect,
  checkEffect,
  formatEffectErrors,
} from "./effects.js";
import { effectExamples } from "./effectExamples.js";
import { loadAll, saveRecord, removeRecord, loadRecord } from "./store.js";

const canvas = document.getElementById("stage");
const presetRoot = document.getElementById("presets");
const presetTitle = document.getElementById("preset-title");
const envRoot = document.getElementById("environments");
const styleRoot = document.getElementById("styles");
const styleAmountInput = document.getElementById("style-amount");
const styleAmountValue = document.getElementById("style-amount-value");
const channelRoot = document.getElementById("channels");
const channelSection = document.getElementById("channel-section");
const randomButton = document.getElementById("random-variant");
const renderModeRoot = document.getElementById("render-modes");
const nprPresetRoot = document.getElementById("npr-presets");
const scopeRoot = document.getElementById("scope-modes");
const shapeRoot = document.getElementById("shape-modes");
const voxelToggle = document.getElementById("voxel-toggle");
const voxelSlider = document.getElementById("voxel-resolution");
const voxelValue = document.getElementById("voxel-resolution-value");
const tierRoot = document.getElementById("tier-modes");
const sliderRoot = document.getElementById("sliders");
const parameterTitle = document.getElementById("parameter-title");
const hintRoot = document.getElementById("hints");
const form = document.getElementById("prompt-form");
const promptInput = document.getElementById("prompt");
const logEl = document.getElementById("nl-log");
const nameEl = document.getElementById("shader-name");
const stateEl = document.getElementById("compile-state");

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  powerPreference: "high-performance",
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x141820);
scene.backgroundBlurriness = 0;
scene.backgroundIntensity = 1;

const camera = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 0.1, 50);
camera.position.set(2.4, 1.85, 4.2);

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.minDistance = 2.4;
controls.maxDistance = 12;
controls.maxPolarAngle = Math.PI * 0.92;
controls.target.set(0, 1.05, 0);
controls.update();

const pmrem = new THREE.PMREMGenerator(renderer);
const hdrLoader = new RGBELoader();
const envCache = new Map();
const roomEnv = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

const hemi = new THREE.HemisphereLight(0xdde7ff, 0x1a1512, 0.18);
scene.add(hemi);

const keyLight = new THREE.DirectionalLight(0xfff3e2, 0.55);
keyLight.position.set(3.4, 5.2, 2.6);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(1024, 1024);
keyLight.shadow.camera.near = 1;
keyLight.shadow.camera.far = 18;
keyLight.shadow.camera.left = -4;
keyLight.shadow.camera.right = 4;
keyLight.shadow.camera.top = 4;
keyLight.shadow.camera.bottom = -4;
keyLight.shadow.bias = -0.0006;
scene.add(keyLight);

const fillLight = new THREE.DirectionalLight(0xa9c8ff, 0.16);
fillLight.position.set(-3.6, 2.0, -1.8);
scene.add(fillLight);

const rimLight = new THREE.PointLight(0x8ee7c5, 2.2, 10, 2);
rimLight.position.set(-1.5, 2.3, 2.2);
scene.add(rimLight);

// 展示方式参照 MaterialX Viewer：模型悬浮在清晰的 HDR 环境前，不放地面、背景板和台座

const shaderUniforms = {
  uTime: { value: 0 },
  uResolution: { value: new THREE.Vector2(1024, 1024) },
  uColorA: { value: new THREE.Color() },
  uColorB: { value: new THREE.Color() },
  uAccent: { value: new THREE.Color() },
  uSpeed: { value: 0.12 },
  uScale: { value: 1 },
  uIntensity: { value: 1 },
  uContrast: { value: 1 },
  uWarp: { value: 0 },
  uGlow: { value: 0 },
  uSeed: { value: 1 },
  // 每个 Shader 在速度 1 时的动画快慢（shaders.js 的 timeScales），让「速度 1」对所有 Shader 都是自然速度
  uTimeScale: { value: 1 },
};

function makeSurfaceMaterial(fragment) {
  return new THREE.ShaderMaterial({
    uniforms: shaderUniforms,
    vertexShader,
    fragmentShader: fragment,
    depthTest: false,
    depthWrite: false,
  });
}

const albedoMaterial = makeSurfaceMaterial(shaders.lookdev.fragment);
const ormMaterial = makeSurfaceMaterial(channelShaders.orm);
const normalMaterial = makeSurfaceMaterial(channelShaders.normalFlat);
const emissiveMaterial = makeSurfaceMaterial(channelShaders.emissiveFlat);

const surfaceScene = new THREE.Scene();
const surfaceCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const surfaceMesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), albedoMaterial);
surfaceScene.add(surfaceMesh);

// Shader 预设缩略图：用独立 uniforms 离屏渲染一次 Base Color，缓存成 dataURL
const THUMB_SIZE = 112;
const thumbTarget = new THREE.WebGLRenderTarget(THUMB_SIZE, THUMB_SIZE);
const thumbUniforms = THREE.UniformsUtils.clone(shaderUniforms);
const thumbMaterial = new THREE.ShaderMaterial({
  uniforms: thumbUniforms,
  vertexShader,
  fragmentShader: shaders.lookdev.fragment,
  depthTest: false,
  depthWrite: false,
});
const thumbScene = new THREE.Scene();
thumbScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), thumbMaterial));
const thumbCache = new Map();
const thumbPixels = new Uint8Array(THUMB_SIZE * THUMB_SIZE * 4);
const thumbCanvas = document.createElement("canvas");
thumbCanvas.width = THUMB_SIZE;
thumbCanvas.height = THUMB_SIZE;
const thumbContext = thumbCanvas.getContext("2d");

function renderThumbnail(preset) {
  const shader = shaders[preset.shader];
  if (!shader) return null;
  thumbMaterial.fragmentShader = shader.fragment;
  thumbMaterial.needsUpdate = true;
  for (const key of ["uColorA", "uColorB", "uAccent"]) thumbUniforms[key].value.setRGB(...preset[key]);
  for (const key of ["uSpeed", "uScale", "uIntensity", "uContrast", "uWarp", "uGlow", "uSeed"]) {
    thumbUniforms[key].value = preset[key];
  }
  thumbUniforms.uTime.value = 4.2;
  thumbUniforms.uTimeScale.value = shader.timeScale ?? 1;
  thumbUniforms.uResolution.value.set(THUMB_SIZE, THUMB_SIZE);
  renderer.setRenderTarget(thumbTarget);
  renderer.render(thumbScene, surfaceCamera);
  renderer.readRenderTargetPixels(thumbTarget, 0, 0, THUMB_SIZE, THUMB_SIZE, thumbPixels);
  renderer.setRenderTarget(null);
  const image = thumbContext.createImageData(THUMB_SIZE, THUMB_SIZE);
  const row = THUMB_SIZE * 4;
  for (let y = 0; y < THUMB_SIZE; y += 1) {
    image.data.set(thumbPixels.subarray((THUMB_SIZE - 1 - y) * row, (THUMB_SIZE - y) * row), y * row);
  }
  thumbContext.putImageData(image, 0, 0);
  return thumbCanvas.toDataURL("image/png");
}

let thumbQueue = [];
function queueThumbnails(entries) {
  thumbQueue = entries.filter(([id]) => !thumbCache.has(id));
  if (thumbQueue.length) setTimeout(drainThumbnails, 30);
}

function drainThumbnails() {
  const next = thumbQueue.shift();
  if (!next) return;
  const [id, preset] = next;
  const url = renderThumbnail(preset);
  if (url) {
    thumbCache.set(id, url);
    for (const img of presetRoot.querySelectorAll(`img[data-thumb="${id}"]`)) img.src = url;
  }
  if (thumbQueue.length) setTimeout(drainThumbnails, 16);
}

function makeTarget(colorSpace) {
  const target = new THREE.WebGLRenderTarget(1024, 1024, {
    type: THREE.HalfFloatType,
    colorSpace,
  });
  target.texture.generateMipmaps = true;
  target.texture.minFilter = THREE.LinearMipmapLinearFilter;
  target.texture.magFilter = THREE.LinearFilter;
  target.texture.wrapS = THREE.RepeatWrapping;
  target.texture.wrapT = THREE.RepeatWrapping;
  return target;
}

const albedoTarget = makeTarget(THREE.SRGBColorSpace);
const ormTarget = makeTarget(THREE.NoColorSpace);
const normalTarget = makeTarget(THREE.NoColorSpace);
const emissiveTarget = makeTarget(THREE.SRGBColorSpace);

const cubeMaterial = new THREE.MeshPhysicalMaterial({
  map: albedoTarget.texture,
  roughnessMap: ormTarget.texture,
  metalnessMap: ormTarget.texture,
  aoMap: ormTarget.texture,
  aoMapIntensity: 1,
  normalMap: normalTarget.texture,
  normalScale: new THREE.Vector2(0, 0),
  emissiveMap: emissiveTarget.texture,
  emissive: new THREE.Color(0xffffff),
  emissiveIntensity: 0,
  metalness: 1,
  roughness: 1,
  envMapIntensity: 1.15,
  clearcoat: 0,
  clearcoatRoughness: 0.22,
  sheen: 0,
  sheenRoughness: 0.45,
  sheenColor: new THREE.Color(0xffffff),
  transmission: 0,
  ior: 1.5,
  thickness: 0.5,
  attenuationDistance: 10,
  attenuationColor: new THREE.Color(0xffffff),
  dispersion: 0,
  iridescence: 0,
  iridescenceIOR: 1.3,
  iridescenceThicknessRange: [100, 400],
  specularIntensity: 1,
  specularColor: new THREE.Color(0xffffff),
  anisotropy: 0,
  anisotropyRotation: 0,
  opacity: 1,
});

// 展示模型挂在 display 组下，自转作用在组上；materialMeshes 挂当前材质，neutralMeshes 是 18% 灰参照
const display = new THREE.Group();
scene.add(display);
let displayParts = { root: null, materialMeshes: [], neutralMeshes: [] };
let displayDef = displayModels[defaultDisplayModel];
const viewBounds = new THREE.Box3(new THREE.Vector3(-0.66, 0, -0.66), new THREE.Vector3(0.66, 1.84, 0.66));

// NPR：主体与展台各有一份 NPR 材质，切换渲染模式时整体换掉；颜色对象与 PBR 材质共享，环境切换自动同步
const npr = createNpr();
const nprSubjectMaterial = npr.makeMaterial({ color: 0xffffff });
nprSubjectMaterial.normalScale = cubeMaterial.normalScale;

// 体素：PBR / NPR 材质都打上体素补丁（实例化时按每块的 voxelUv 取贴图），校色件体素用实例颜色
applyVoxelSupport(cubeMaterial);
applyVoxelSupport(nprSubjectMaterial);
// 程序贴图改用三向投影，避免模型 UV 接缝处的裂缝
applyTriplanar(cubeMaterial);
applyTriplanar(nprSubjectMaterial);
// 次表面散射、积雪、置换、冰下碎冰：写实和卡通材质都打（卡通版光照分阶）
applyMaterialFx(cubeMaterial);
applyMaterialFx(nprSubjectMaterial, { toon: true });
// 阴影也要跟着积雪 / 置换推出去，否则影子还是原来的形状
const displacedDepthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
applyFxVertex(displacedDepthMaterial);
// 效果的实例层（effects.js）：挂在 display 组下，坐标就是展示空间；也进主体遮罩，「仅模型」滤镜会处理它
const instanceLayer = createInstanceLayer(npr);
display.add(instanceLayer.mesh);
instanceLayer.mesh.layers.enable(MASK_LAYER);
const voxelNeutralMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.55, metalness: 0 });
applyVoxelSupport(voxelNeutralMaterial);
let voxelGroup = null;
const voxelCache = new Map();


// Lite / Pro：只决定界面显示多少控制项，材质和设置在两种模式间保留
const TIER_KEY = "shadermaker.tier";
function savedTier() {
  try {
    return localStorage.getItem(TIER_KEY) === "pro" ? "pro" : "lite";
  } catch {
    return "lite";
  }
}

const state = {
  tier: savedTier(),
  mode: "pbr",
  pbrCategory: "all",
  shaderCategory: "all",
  // 进来默认是雪地：积雪带置换，一打开就能看到曲面细分后的起伏（Lookdev 色卡球留在材质库「校准」里）
  preset: "snow",
  // 当前效果 id（effects.js），null = 没有
  effect: null,
  shader: "snow",
  environment: defaultEnvironment,
  style: defaultStyle,
  render: "pbr",
  voxelOn: false,
  voxelRes: voxelResolution.default,
  scope: "subject",
  displayModel: defaultDisplayModel,
  nprPreset: defaultNprPreset,
  channel: "final",
  params: { ...presets.snow },
};

const stylizer = createStylizer(renderer, scene, camera);

// 通道查看：把 4 张程序贴图逐个贴到主体上，确认 Surface 输出是否正确
const channels = [
  { id: "final", label: "最终", index: 0 },
  { id: "base", label: "Base", index: 1 },
  { id: "ao", label: "AO", index: 2 },
  { id: "roughness", label: "粗糙", index: 3 },
  { id: "metalness", label: "金属", index: 4 },
  { id: "normal", label: "法线", index: 5 },
  { id: "emissive", label: "自发光", index: 6 },
];

const channelMaterial = new THREE.ShaderMaterial({
  uniforms: {
    tAlbedo: { value: albedoTarget.texture },
    tOrm: { value: ormTarget.texture },
    tNormal: { value: normalTarget.texture },
    tEmissive: { value: emissiveTarget.texture },
    uChannel: { value: 1 },
    uUvRepeat: { value: 1 },
    ...triplanarUniforms,
  },
  vertexShader: /* glsl */ `
varying vec2 vUv;
${triplanarVertexHead}
#ifdef USE_INSTANCING
#define FX_HAS_VOXEL_UV
attribute vec2 voxelUv;
#endif
void main() {
${triplanarVertexBody}
  vUv = uv;
  #include <begin_vertex>
  vec4 local = vec4(transformed, 1.0);
#ifdef USE_INSTANCING
  vUv = voxelUv;
  local = instanceMatrix * local;
#endif
  gl_Position = projectionMatrix * modelViewMatrix * local;
}
`,
  // 输出线性值；看通道时关闭色调映射，OutputPass 只做 sRGB 编码，所以屏幕上就是贴图原值
  fragmentShader: /* glsl */ `
uniform sampler2D tAlbedo;
uniform sampler2D tOrm;
uniform sampler2D tNormal;
uniform sampler2D tEmissive;
uniform int uChannel;
uniform float uUvRepeat;
varying vec2 vUv;
${triplanarFragmentHead}
vec3 toLinear(vec3 c) { return pow(c, vec3(2.2)); }
void main() {
  vec2 uv = vUv * uUvRepeat;
  vec3 orm = triSample(tOrm, uv).rgb;
  vec3 c = triSample(tAlbedo, uv).rgb;
  if (uChannel == 2) c = toLinear(vec3(orm.r));
  else if (uChannel == 3) c = toLinear(vec3(orm.g));
  else if (uChannel == 4) c = toLinear(vec3(orm.b));
  else if (uChannel == 5) c = toLinear(triSample(tNormal, uv).rgb);
  else if (uChannel == 6) c = triSample(tEmissive, uv).rgb;
  gl_FragColor = vec4(c, 1.0);
}
`,
});
// 看通道时形状也和最终一致（积雪 / 置换照样推出去）
applyFxVertex(channelMaterial, { declareTri: false });


function presetFamily(preset) {
  return preset?.family || "pbr";
}

function presetsForMode(mode = state.mode) {
  return Object.entries(presets).filter(([, preset]) => presetFamily(preset) === mode);
}

const nprGroup = { id: "npr", label: "NPR", items: nprSliders.map((def) => ({ ...def, npr: true })) };

function slidersForMode(mode = state.mode) {
  const groupId = mode === "shader" && shaders[state.shader]?.kind === "surface" ? "surface" : mode;
  const groups = sliderGroups.filter((group) => group.id === groupId);
  const all = state.render === "npr" ? [nprGroup, ...groups] : groups;
  if (state.tier === "pro") return all;
  return all.map((group) => ({ ...group, items: group.items.filter((def) => def.lite) }));
}

// 滑条已拖过的部分用 --fill 着色
function paintRange(input) {
  const min = Number(input.min);
  const max = Number(input.max);
  const ratio = max > min ? (Number(input.value) - min) / (max - min) : 0;
  input.style.setProperty("--fill", `${(THREE.MathUtils.clamp(ratio, 0, 1) * 100).toFixed(1)}%`);
}

function sliderValue(def) {
  return def.npr ? npr.values[def.key] : state.params[def.key];
}

function applyLight(light, spec) {
  light.color.setHex(spec.color);
  light.intensity = spec.intensity;
  light.position.set(...spec.position);
}

async function loadEnvironmentMap(url) {
  if (envCache.has(url)) return envCache.get(url);
  // .jpg 是插件包里压缩过的 HDR（src/packedHdr.js），.hdr 是 Poly Haven 原文件
  const load = url.endsWith(".jpg") ? loadPackedHdr(url) : hdrLoader.loadAsync(url);
  const pending = load.then((texture) => {
    texture.mapping = THREE.EquirectangularReflectionMapping;
    const envMap = pmrem.fromEquirectangular(texture).texture;
    texture.dispose();
    envCache.set(url, envMap);
    return envMap;
  });
  envCache.set(url, pending);
  return pending;
}

function applyEnvironmentRotation(radians) {
  if (scene.environmentRotation) scene.environmentRotation.set(0, radians, 0);
  if (scene.backgroundRotation) scene.backgroundRotation.set(0, radians, 0);
}

let currentEnvMap = null;

// NPR 下背景用环境的平涂底色，照片 HDR 背景和卡通主体放一起会很突兀
function applyBackground() {
  const env = environments[state.environment];
  const flat = state.render === "npr" && state.scope === "global";
  scene.background = !flat && currentEnvMap ? currentEnvMap : new THREE.Color(env.background);
}

async function setEnvironment(id) {
  const env = environments[id] || environments[defaultEnvironment];
  state.environment = env.id;
  currentEnvMap = null;
  applyBackground();
  renderer.toneMappingExposure = env.exposure;
  applyLight(keyLight, env.key);
  applyLight(fillLight, env.fill);
  applyLight(rimLight, env.rim);
  npr.setLightReference(keyLight);
  hemi.intensity = env.hemi;
  refreshRenderState();
  applyEnvironmentRotation(env.rotation);
  highlightEnvironment();
  try {
    const envMap = await loadEnvironmentMap(env.hdr);
    if (state.environment !== env.id) return;
    scene.environment = envMap;
    currentEnvMap = envMap;
    applyBackground();
    applyEnvironmentRotation(env.rotation);
    setCompileState(true, "ready");
  } catch (error) {
    console.warn("HDR environment failed", error);
    scene.environment = roomEnv;
    currentEnvMap = null;
    applyBackground();
    applyEnvironmentRotation(0);
    setCompileState(false, "hdr fallback");
  }
}

function highlightEnvironment() {
  if (!envRoot) return;
  for (const button of envRoot.querySelectorAll(".chip")) {
    button.classList.toggle("active", button.dataset.id === state.environment);
  }
}

function setCompileState(ok, text) {
  stateEl.textContent = text;
  stateEl.className = ok ? "ok" : "err";
}

function usesMaps(params = state.params) {
  return params.useMaps !== false;
}

function updateChannelShaders() {
  const lookdevMaps = state.shader === "lookdev" && usesMaps();
  const shader = shaders[state.shader];
  const surfaceChannels = shader?.kind === "surface" ? shader.channels : null;
  ormMaterial.fragmentShader = lookdevMaps
    ? channelShaders.orm
    : surfaceChannels?.orm || channelShaders.ormFlat;
  normalMaterial.fragmentShader =
    lookdevMaps || state.params.uNormal <= 0.001
      ? channelShaders.normalFlat
      : surfaceChannels?.normal || channelShaders.normal;
  emissiveMaterial.fragmentShader = lookdevMaps
    ? channelShaders.emissiveFlat
    : surfaceChannels?.emissive || shader?.fragment || channelShaders.emissiveFlat;
  ormMaterial.needsUpdate = true;
  normalMaterial.needsUpdate = true;
  emissiveMaterial.needsUpdate = true;
}

function applyPhysical(params) {
  const mapped = usesMaps(params);
  cubeMaterial.metalness = params.uMetalness;
  cubeMaterial.roughness = params.uRoughness;
  cubeMaterial.envMapIntensity = params.uEnv;
  cubeMaterial.emissiveIntensity = params.uEmissive;
  cubeMaterial.clearcoat = params.uClearcoat;
  cubeMaterial.clearcoatRoughness = params.uClearcoatRoughness;
  cubeMaterial.sheen = params.uSheen;
  cubeMaterial.sheenRoughness = params.uSheenRoughness;
  cubeMaterial.sheenColor.setRGB(...params.uSheenColor);
  cubeMaterial.transmission = params.uTransmission;
  cubeMaterial.ior = params.uIor;
  cubeMaterial.thickness = params.uThickness;
  cubeMaterial.attenuationDistance = params.uAttenuationDistance;
  cubeMaterial.attenuationColor.setRGB(...params.uAttenuationColor);
  cubeMaterial.dispersion = params.uDispersion;
  cubeMaterial.iridescence = params.uIridescence;
  cubeMaterial.iridescenceIOR = params.uIridescenceIor;
  cubeMaterial.iridescenceThicknessRange = [100, params.uIridescenceThickness];
  cubeMaterial.specularIntensity = params.uSpecularIntensity;
  cubeMaterial.specularColor.setRGB(...params.uSpecularColor);
  cubeMaterial.anisotropy = params.uAnisotropy;
  cubeMaterial.anisotropyRotation = params.uAnisotropyRotation;
  // 体素每块是平面，法线贴图按单点取样只会让每块随机歪一下，所以体素开启时关掉
  cubeMaterial.normalScale.setScalar(mapped && state.shader !== "lookdev" && !state.voxelOn ? params.uNormal : 0);
  cubeMaterial.map = mapped ? albedoTarget.texture : null;
  cubeMaterial.roughnessMap = mapped ? ormTarget.texture : null;
  cubeMaterial.metalnessMap = mapped ? ormTarget.texture : null;
  cubeMaterial.aoMap = mapped ? ormTarget.texture : null;
  cubeMaterial.normalMap = mapped ? normalTarget.texture : null;
  cubeMaterial.emissiveMap = mapped ? emissiveTarget.texture : null;
  // VFX 特效的贴图同时是底色和自发光；底色压暗，否则被环境光照亮后整体发灰，看不出发光
  const vfx = state.mode === "shader" && state.shader !== "lookdev" && shaders[state.shader]?.kind !== "surface";
  if (mapped) cubeMaterial.color.setScalar(vfx ? 0.08 : 1);
  else cubeMaterial.color.setRGB(...params.uColorB);
  materialFxUniforms.uSss.value = params.uSss ?? 0;
  materialFxUniforms.uSssColor.value.setRGB(...(params.uAttenuationColor || [1, 1, 1]));
  materialFxUniforms.uSnow.value = params.uSnow ?? 0;
  materialFxUniforms.uSnowDepth.value = params.uSnowDepth ?? 0.05;
  // 置换只对 Surface Shader 有意义（ORM 的 alpha 里才有高度）；体素开着时按块拉长（materialFx.js）
  materialFxUniforms.uDisplace.value = mapped && shaders[state.shader]?.kind === "surface" ? params.uDisplace ?? 0 : 0;
  materialFxUniforms.tDisplace.value = ormTarget.texture;
  materialFxUniforms.uIceLayers.value = params.uIceLayers ?? 0;
  if (params.uIceLayers) {
    materialFxUniforms.uIceDeepColor.value.setRGB(...params.uColorA);
    materialFxUniforms.uIcePlateColor.value.setRGB(...params.uColorB).lerp(new THREE.Color(...params.uAccent), 0.45);
  }
  cubeMaterial.opacity = 1;
  cubeMaterial.transparent = params.uTransmission > 0.001;
  cubeMaterial.needsUpdate = true;

  nprSubjectMaterial.map = cubeMaterial.map;
  nprSubjectMaterial.normalMap = cubeMaterial.normalMap;
  nprSubjectMaterial.aoMap = cubeMaterial.aoMap;
  nprSubjectMaterial.emissiveMap = cubeMaterial.emissiveMap;
  nprSubjectMaterial.emissive.setRGB(1, 1, 1);
  nprSubjectMaterial.emissiveIntensity = params.uEmissive;
  nprSubjectMaterial.color.copy(cubeMaterial.color);
  npr.applyPhysical(nprSubjectMaterial, params, {
    useOrm: mapped,
    ormTexture: ormTarget.texture,
    outlineColor: new THREE.Color().setRGB(...(mapped ? params.uColorA : params.uColorB)),
  });
  nprSubjectMaterial.needsUpdate = true;
}

function applyParams(params) {
  state.params = { ...params };
  shaderUniforms.uColorA.value.setRGB(...params.uColorA);
  shaderUniforms.uColorB.value.setRGB(...params.uColorB);
  shaderUniforms.uAccent.value.setRGB(...params.uAccent);
  shaderUniforms.uSpeed.value = params.uSpeed;
  shaderUniforms.uScale.value = params.uScale;
  shaderUniforms.uIntensity.value = params.uIntensity;
  shaderUniforms.uContrast.value = params.uContrast;
  shaderUniforms.uWarp.value = params.uWarp;
  shaderUniforms.uGlow.value = params.uGlow;
  shaderUniforms.uSeed.value = params.uSeed;
  updateChannelShaders();
  applyPhysical(params);
  syncSliders();
}

function setPreset(id, params = presets[id] || state.params) {
  const shaderId = params.shader || id;
  const shader = shaders[shaderId];
  if (!shader) return;
  const nextMode = presetFamily(params);
  state.mode = nextMode;
  state.preset = id;
  state.shader = shaderId;
  albedoMaterial.fragmentShader = shader.fragment;
  albedoMaterial.needsUpdate = true;
  shaderUniforms.uTimeScale.value = shader.timeScale ?? 1;

  applyParams({ ...params, shader: shaderId });
  highlightMode();
  renderPresets();
  renderSliders();
  syncSliders();
  renderHints();
  highlightPreset();
  setChannel(state.channel);
  updateTitle();
  setCompileState(true, "ready");
}

function highlightPreset() {
  for (const button of presetRoot.querySelectorAll("[data-id]")) {
    button.classList.toggle("active", button.dataset.id === state.preset);
  }
}

function highlightMode() {
  for (const button of document.querySelectorAll(".mode-tab")) {
    button.classList.toggle("active", button.dataset.mode === state.mode);
  }
}

function setChannel(id) {
  const channel = channels.find((item) => item.id === id) || channels[0];
  state.channel = usesMaps() ? channel.id : "final";
  channelMaterial.uniforms.uChannel.value = channel.index;
  refreshRenderState();
  if (channelSection) channelSection.hidden = !usesMaps();
  for (const button of channelRoot?.querySelectorAll("[data-id]") || []) {
    button.classList.toggle("active", button.dataset.id === state.channel);
  }
}

// 主体材质 / 展台材质 / 描边 / 背景 / 色调映射统一由渲染模式、作用范围和通道查看决定
function refreshRenderState() {
  const nprOn = state.render === "npr";
  const global = state.scope === "global";
  const debug = state.channel !== "final";
  const subjectMaterial = debug ? channelMaterial : nprOn ? nprSubjectMaterial : cubeMaterial;
  for (const mesh of displayParts.materialMeshes) mesh.material = subjectMaterial;
  instanceLayer.setRender(nprOn);
  // 体素化时实例根部埋在方块里、通道查看只看贴图，都不画实例（overlay 照常）
  instanceLayer.setHidden(debug || state.voxelOn);
  // 校色件（内芯色环、灰底盘）是参照物，任何模式下都保持写实
  // 导入模型保留原材质的部件：卡通模式用一份按原材质转出来的卡通材质
  for (const mesh of displayParts.neutralMeshes) {
    mesh.material = nprOn && mesh.userData.originalMaterial && !debug ? toonFor(mesh.userData.originalMaterial) : mesh.userData.pbrMaterial;
  }
  for (const mesh of voxelGroup?.children || []) {
    mesh.material = mesh.userData.voxelKind === "material" ? subjectMaterial : voxelNeutralMaterial;
  }
  npr.setOutlinesVisible(nprOn && !debug);
  // 全局 NPR：整幅画面不走 ACES，平涂色直出；仅模型：画面仍走 ACES，NPR 材质输出 ACES 反函数抵消
  renderer.toneMapping = debug || (nprOn && global) ? THREE.NoToneMapping : THREE.ACESFilmicToneMapping;
  npr.setInverseTone(nprOn && !global, renderer.toneMappingExposure);
  stylizer.setBypass(debug);
  stylizer.setSubjectOnly(!global);
  applyBackground();
}

function setScope(scope) {
  state.scope = scope === "global" ? "global" : "subject";
  for (const button of scopeRoot?.querySelectorAll("[data-scope]") || []) {
    button.classList.toggle("active", button.dataset.scope === state.scope);
  }
  refreshRenderState();
}

// 体素化：按「模型 + 精细度」缓存最近 8 份；开启时隐藏原网格（描边外壳是它的子节点，一起隐藏）
const VOXEL_CACHE_LIMIT = 8;

function disposeVoxelGroup(group) {
  for (const mesh of group.children) {
    mesh.geometry.dispose();
    mesh.dispose();
  }
}

function applyVoxel() {
  if (voxelGroup) display.remove(voxelGroup);
  voxelGroup = null;
  const on = state.voxelOn && Boolean(displayParts.root);
  for (const mesh of [...displayParts.materialMeshes, ...displayParts.neutralMeshes]) mesh.visible = !on;
  if (on) {
    const key = `${state.displayModel}:${enabledPartKeys().join(",")}:${state.voxelRes}`;
    let built = voxelCache.get(key);
    if (built) {
      voxelCache.delete(key);
    } else {
      const started = performance.now();
      const meshes = [
        ...displayParts.materialMeshes.map((mesh) => ({ mesh, kind: "material" })),
        ...displayParts.neutralMeshes.map((mesh) => ({ mesh, kind: "neutral" })),
      ];
      const data = voxelize(meshes, display, state.voxelRes);
      built = new THREE.Group();
      if (data.material.length) {
        const mesh = buildVoxelMesh(data.material, data.size, cubeMaterial);
        mesh.userData.voxelKind = "material";
        mesh.customDepthMaterial = displacedDepthMaterial;
        built.add(mesh);
      }
      if (data.neutral.length) {
        // 导入模型的非材质部件按原材质颜色，Shader Ball 的校色件按色环规则
        const colorOf = (voxel) => voxel.mesh?.userData.voxelColor?.clone() || calibrationColor(voxel.local);
        const mesh = buildVoxelMesh(data.neutral, data.size, voxelNeutralMaterial, colorOf);
        mesh.userData.voxelKind = "neutral";
        built.add(mesh);
      }
      for (const mesh of built.children) {
        mesh.layers.enable(MASK_LAYER);
        mesh.userData.display = true;
      }
      built.userData.count = data.material.length + data.neutral.length;
      built.userData.size = data.size;
      built.userData.ms = Math.round(performance.now() - started);
    }
    // Map 按插入顺序排列：重新插到末尾，超出上限时淘汰最早的
    voxelCache.set(key, built);
    while (voxelCache.size > VOXEL_CACHE_LIMIT) {
      const [oldestKey, oldest] = voxelCache.entries().next().value;
      voxelCache.delete(oldestKey);
      disposeVoxelGroup(oldest);
    }
    voxelGroup = built;
    display.add(built);
    materialFxUniforms.uVoxelSize.value = built.userData.size;
  }
  applyPhysical(state.params);
  refreshRenderState();
  syncVoxelControls();
  updateTitle();
  return voxelGroup?.userData;
}

function setVoxel(on, resolution = state.voxelRes) {
  state.voxelOn = on;
  state.voxelRes = THREE.MathUtils.clamp(Math.round(resolution), voxelResolution.min, voxelResolution.max);
  const info = applyVoxel();
  logEl.textContent = info
    ? `体素化：精细度 ${state.voxelRes}，${info.count.toLocaleString()} 块（生成 ${info.ms} ms）`
    : "关闭体素";
}

function syncVoxelControls() {
  if (voxelToggle) voxelToggle.checked = state.voxelOn;
  if (voxelSlider) {
    voxelSlider.value = String(state.voxelRes);
    voxelSlider.disabled = !state.voxelOn;
    paintRange(voxelSlider);
  }
  if (voxelValue) voxelValue.textContent = String(state.voxelRes);
}

function initVoxelControls() {
  if (!voxelSlider) return;
  voxelSlider.min = String(voxelResolution.min);
  voxelSlider.max = String(voxelResolution.max);
  voxelSlider.step = String(voxelResolution.step);
  syncVoxelControls();
}

// ---- 效果（effects.js）：输入、效果库、面板 ----

const effectRoot = document.getElementById("effects");
const effectControls = document.getElementById("effect-controls");
const effectHint = document.getElementById("effect-hint");
const builtinEffects = new Map(Object.values(effectExamples).map((record) => [record.id, normalizeEffect(record)]));
for (const [id, record] of builtinEffects) record.keys = effectExamples[id].keys || [];
const customEffects = new Map();
const effectChannel = new BroadcastChannel("shadermaker-effects");
// 每个效果调过的参数值（切走再切回来时保留）
const effectValues = new Map();
const input = { clicks: [], frozenAge: null, pointerDirty: false, pointerEvent: null };

function allEffects() {
  return [...builtinEffects.values(), ...customEffects.values()];
}

function findEffect(id) {
  return customEffects.get(id) || builtinEffects.get(id) || null;
}

function updateModelInputs(meshes) {
  const box = new THREE.Box3();
  display.updateMatrixWorld(true);
  const inverse = new THREE.Matrix4().copy(display.matrixWorld).invert();
  for (const mesh of meshes) {
    mesh.geometry.computeBoundingBox();
    box.union(mesh.geometry.boundingBox.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(inverse, mesh.matrixWorld)));
  }
  box.getCenter(effectInputs.uModelCenter.value);
  effectInputs.uModelSize.value = box.getSize(new THREE.Vector3()).length();
}

// 屏幕坐标（NDC）→ 模型表面上的点（展示空间）；没打到返回 null
const surfaceRaycaster = new THREE.Raycaster();
function pickSurface(ndcX, ndcY) {
  surfaceRaycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), camera);
  const hit = surfaceRaycaster.intersectObjects(displayParts.materialMeshes, false)[0];
  return hit ? display.worldToLocal(hit.point.clone()) : null;
}

// 记一次点击：uClickPos / uClickAge / uClickCount，上一次的进 uPrev*
function pushClick(point) {
  input.clicks.unshift({ point: point.clone(), time: clock.getElapsedTime() });
  input.clicks.length = Math.min(input.clicks.length, 2);
  effectInputs.uClickCount.value += 1;
  input.frozenAge = null;
}

// 没有指定位置时：画面正中对着的那一点，正中没有模型就取模型顶部
function defaultClickPoint() {
  const hit = pickSurface(0, 0);
  if (hit) return hit;
  const center = effectInputs.uModelCenter.value;
  return new THREE.Vector3(center.x, center.y + effectInputs.uModelSize.value * 0.3, center.z);
}

function updateEffectInputs(elapsed) {
  effectInputs.uTime.value = elapsed;
  const [last, previous] = input.clicks;
  if (last) {
    effectInputs.uClickPos.value.copy(last.point);
    effectInputs.uClickAge.value = input.frozenAge ?? elapsed - last.time;
  } else effectInputs.uClickAge.value = 1e4;
  if (previous) {
    effectInputs.uPrevClickPos.value.copy(previous.point);
    effectInputs.uPrevClickAge.value = elapsed - previous.time;
  } else effectInputs.uPrevClickAge.value = 1e4;
  // 指针：只有效果用到 uPointer 时才每帧拾取，鼠标没动就不重算
  if (input.pointerDirty && input.pointerEvent && effectUses(activeEffect(), "uPointerPos")) {
    input.pointerDirty = false;
    const rect = canvas.getBoundingClientRect();
    const event = input.pointerEvent;
    const point = pickSurface(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
    effectInputs.uPointerOn.value = point ? 1 : 0;
    if (point) effectInputs.uPointerPos.value.copy(point);
  }
}

function initEffectInput() {
  let down = null;
  canvas.addEventListener("pointerdown", (event) => {
    down = { x: event.clientX, y: event.clientY, time: performance.now() };
  });
  // 点击（不是拖动视角）模型：记一次点击
  canvas.addEventListener("pointerup", (event) => {
    if (!down) return;
    const moved = Math.hypot(event.clientX - down.x, event.clientY - down.y);
    const quick = performance.now() - down.time < 400;
    down = null;
    if (moved > 5 || !quick || !activeEffect()) return;
    const rect = canvas.getBoundingClientRect();
    const point = pickSurface(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
    if (point) pushClick(point);
  });
  canvas.addEventListener("pointermove", (event) => {
    input.pointerEvent = event;
    input.pointerDirty = true;
  });
  canvas.addEventListener("pointerleave", () => {
    input.pointerEvent = null;
    effectInputs.uPointerOn.value = 0;
  });
}

// 切换当前效果（null = 关闭）
function activateEffect(id) {
  const record = id ? findEffect(id) : null;
  setActiveEffect(record, record ? effectValues.get(record.id) || {} : {});
  state.effect = record?.id || null;
  renderEffects();
  return record;
}

function renderEffects() {
  if (!effectRoot) return;
  effectRoot.innerHTML = "";
  for (const record of [{ id: null, name: "无" }, ...allEffects()]) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "chip";
    button.textContent = record.name;
    if (record.description) button.title = record.description;
    button.classList.toggle("active", (state.effect || null) === record.id);
    button.addEventListener("click", () => {
      activateEffect(record.id);
      logEl.textContent = record.id ? `效果：${record.name}` : "关闭效果";
    });
    effectRoot.append(button);
  }
  renderEffectControls();
}

function renderEffectControls() {
  if (!effectControls) return;
  effectControls.innerHTML = "";
  const record = activeEffect();
  effectControls.hidden = !record;
  if (!record) return;
  if (effectHint) {
    const usesClick = effectUses(record, "uClickPos") || effectUses(record, "uClickAge");
    effectHint.textContent = usesClick ? "点击模型触发" : effectUses(record, "uPointerPos") ? "鼠标移到模型上" : record.description || "";
  }
  for (const def of record.params) {
    const wrap = document.createElement("div");
    wrap.className = def.lite ? "slider" : "slider pro-only";
    if (def.type === "color") {
      wrap.innerHTML = `<label><b>${def.label}</b><input type="color" /></label>`;
      const picker = wrap.querySelector("input");
      picker.className = "effect-color";
      picker.value = effectParamValue(def.key);
      picker.addEventListener("input", () => {
        setEffectParam(def.key, picker.value);
        rememberEffectValue(def.key, picker.value);
      });
    } else {
      const digits = def.max - def.min >= 10 ? 1 : def.max - def.min >= 1 ? 2 : 3;
      wrap.innerHTML = `
        <label><b>${def.label}</b><span></span></label>
        <input type="range" min="${def.min}" max="${def.max}" step="${(def.max - def.min) / 200}" />`;
      const range = wrap.querySelector("input");
      const value = wrap.querySelector("span");
      range.value = String(effectParamValue(def.key));
      value.textContent = Number(range.value).toFixed(digits);
      paintRange(range);
      range.addEventListener("input", () => {
        setEffectParam(def.key, Number(range.value));
        rememberEffectValue(def.key, Number(range.value));
        value.textContent = Number(range.value).toFixed(digits);
        paintRange(range);
      });
    }
    effectControls.append(wrap);
  }
}

function rememberEffectValue(key, value) {
  const id = activeEffect()?.id;
  if (!id) return;
  effectValues.set(id, { ...(effectValues.get(id) || {}), [key]: value });
}

async function reloadCustomEffects() {
  const records = await loadAll("effects");
  customEffects.clear();
  for (const record of records) {
    if (builtinEffects.has(record.id)) continue;
    try {
      customEffects.set(record.id, normalizeEffect(record, reservedUniforms));
      customEffects.get(record.id).createdAt = record.createdAt;
    } catch {
      // 存储里的旧格式记录：跳过
    }
  }
  if (state.effect && !findEffect(state.effect)) activateEffect(null);
  else if (state.effect && customEffects.has(state.effect)) activateEffect(state.effect);
  else renderEffects();
}

// 主体材质里已有的 uniform 名：效果参数不能和它们重名
const reservedUniforms = new Set([...Object.keys(materialFxUniforms), ...Object.keys(triplanarUniforms), "uSpeedScale"]);

function initEffects() {
  initEffectInput();
  effectChannel.addEventListener("message", () => reloadCustomEffects());
  reloadCustomEffects();
  // 万一效果代码在某份没检查到的材质里编译失败：关掉效果，避免整个画面坏掉
  const fallback = renderer.debug.onShaderError;
  renderer.debug.onShaderError = (gl, program, vertexShader, fragmentShader) => {
    if (fallback) fallback(gl, program, vertexShader, fragmentShader);
    else console.error("THREE.WebGLProgram: Shader Error", gl.getShaderInfoLog(fragmentShader) || gl.getShaderInfoLog(vertexShader));
    if (activeEffect()) {
      const name = activeEffect().name;
      setTimeout(() => {
        activateEffect(null);
        logEl.textContent = `效果「${name}」在某个材质里编译失败，已关闭`;
      });
    }
  };
}

// 展示模型：异步加载（Shader Ball 是 GLB），用 token 丢弃过期结果
let displayToken = 0;

async function setDisplayModel(id) {
  const def = modelDef(id);
  const token = ++displayToken;
  setCompileState(true, "loading");
  let parts;
  try {
    parts = await loadDisplayModel(def);
  } catch (error) {
    if (token !== displayToken) return;
    logEl.textContent = `模型加载失败：${error.message}`;
    setCompileState(false, "model error");
    return;
  }
  if (token !== displayToken) return;
  displayDef = def;
  state.displayModel = def.id;
  mountDisplayParts(parts);
  renderModelParts();
  setCompileState(true, "ready");
}

// 把（新的或重新分过部件的）模型挂进场景：描边、阴影、实例散布、体素、取景都按当前部件重建
function mountDisplayParts(parts) {
  const def = displayDef;
  if (displayParts.root) {
    npr.removeOutlines((target) => target.userData.display === true);
    display.remove(displayParts.root);
  }
  displayParts = parts;
  for (const mesh of [...parts.materialMeshes, ...parts.neutralMeshes]) {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.layers.enable(MASK_LAYER);
    mesh.userData.display = true;
  }
  for (const mesh of parts.materialMeshes) {
    mesh.customDepthMaterial = displacedDepthMaterial;
    npr.makeOutline(mesh, { source: nprSubjectMaterial, stencil: true }).layers.enable(MASK_LAYER);
  }
  display.rotation.set(0, 0, 0);
  display.add(parts.root);
  // 换了模型：重新散布实例，更新模型尺寸输入
  instanceLayer.scatter(parts.materialMeshes, display);
  updateModelInputs(parts.materialMeshes);
  applyVoxel();
  // 程序贴图的平铺次数跟着模型走（贴图是共享的，改 repeat 对 PBR / NPR 材质同时生效）
  const repeat = def.uvRepeat || 1;
  for (const target of [albedoTarget, ormTarget, normalTarget, emissiveTarget]) target.texture.repeat.set(repeat, repeat);
  channelMaterial.uniforms.uUvRepeat.value = repeat;
  updateViewBounds();
  refreshRenderState();
  highlightDisplayModel();
  requestViewportSync(false);
}

// ---- 导入的模型：本机浏览器存储里只放名称 / 部件设置（models）和文件字节（modelData，用到时才读） ----

const importedModels = new Map();
const MAX_IMPORT_BYTES = 200 * 1024 * 1024;
const PAINT_NAMES = /paint|body|carpaint|exterior|shell|车身|车漆|漆面|外壳/i;
const importedRoot = document.getElementById("imported-models");
const partsSection = document.getElementById("model-parts-section");
const partsRoot = document.getElementById("model-parts");
const toonCache = new WeakMap();

function modelDef(id) {
  if (displayModels[id]) return displayModels[id];
  const meta = importedModels.get(id);
  if (!meta) return displayModels[defaultDisplayModel];
  return {
    id,
    label: meta.name,
    imported: true,
    parts: meta.parts,
    load: async () => {
      const record = await loadRecord("modelData", id);
      if (!record?.data) throw new Error("模型文件不在本机存储里了");
      return record.data;
    },
  };
}

function enabledPartKeys() {
  return (displayParts.parts || []).filter((part) => part.enabled).map((part) => part.key);
}

// 原材质 → 卡通材质（颜色 / 贴图 / 透明度照搬，粗糙度和金属度走 NPR 的转换规则）
function toonFor(material) {
  if (toonCache.has(material)) return toonCache.get(material);
  const toon = npr.makeMaterial({
    color: material.color ? material.color.clone() : 0xffffff,
    map: material.map || null,
    transparent: material.transparent,
    opacity: material.opacity ?? 1,
    side: material.side,
  });
  npr.applyPhysical(toon, {
    uRoughness: material.roughness ?? 0.6,
    uMetalness: material.metalness ?? 0,
    uClearcoat: material.clearcoat ?? 0,
    uClearcoatRoughness: material.clearcoatRoughness ?? 0.3,
    uSheen: 0,
    uSheenColor: [1, 1, 1],
    uTransmission: material.transmission ?? 0,
    uAttenuationColor: [1, 1, 1],
    uIridescence: 0,
    uDispersion: 0,
  });
  toon.opacity = material.transmission ? 0.35 : material.opacity ?? 1;
  toon.transparent = toon.opacity < 1;
  toonCache.set(material, toon);
  return toon;
}

function renderImportedModels() {
  if (!importedRoot) return;
  importedRoot.innerHTML = "";
  for (const meta of importedModels.values()) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "chip";
    button.dataset.model = meta.id;
    button.textContent = meta.name;
    button.title = `${meta.name} · ${(meta.bytes / 1048576).toFixed(1)} MB`;
    button.addEventListener("click", () => {
      setDisplayModel(meta.id);
      logEl.textContent = `展示模型：${meta.name}`;
    });
    importedRoot.append(button);
  }
  highlightDisplayModel();
}

function renderModelParts() {
  if (!partsSection || !partsRoot) return;
  partsSection.hidden = !displayParts.imported;
  partsRoot.innerHTML = "";
  if (!displayParts.imported) return;
  for (const part of displayParts.parts) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "chip";
    button.textContent = part.label;
    button.title = `面积占 ${Math.round((part.area / displayParts.totalArea) * 100)}%${part.exposure !== undefined ? `，外观可见 ${Math.round(part.exposure * 100)}%` : ""}`;
    button.classList.toggle("active", part.enabled);
    button.addEventListener("click", () => {
      const keys = new Set(enabledPartKeys());
      if (keys.has(part.key)) keys.delete(part.key);
      else keys.add(part.key);
      setModelParts([...keys]);
    });
    partsRoot.append(button);
  }
}

// 改哪些部件套用 ShaderMaker 材质（至少留一个）
async function setModelParts(keys) {
  if (!displayParts.imported) return null;
  const valid = keys.filter((key) => displayParts.parts.some((part) => part.key === key));
  if (!valid.length) {
    logEl.textContent = "至少留一个部件套用材质";
    return null;
  }
  assignParts(displayParts, valid);
  mountDisplayParts(displayParts);
  renderModelParts();
  const meta = importedModels.get(state.displayModel);
  if (meta) {
    meta.parts = valid;
    await saveRecord("models", meta);
  }
  return valid;
}

// 导入：检查大小 → 先试着解析（不合格不存）→ 存进本机 → 切过去
async function importModel(data, name) {
  if (!(data instanceof ArrayBuffer) || !data.byteLength) throw new Error("文件是空的");
  if (data.byteLength > MAX_IMPORT_BYTES) throw new Error(`模型太大（上限 ${MAX_IMPORT_BYTES / 1048576} MB）`);
  const id = `import-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const meta = { id, name: String(name || "导入模型").replace(/\.(glb|gltf)$/i, "").slice(0, 32), bytes: data.byteLength, parts: null, createdAt: Date.now() };
  setCompileState(true, "loading");
  const probe = { ...modelDef("missing"), id, label: meta.name, imported: true, parts: null, load: async () => data };
  try {
    // 默认套用材质的部件：从外面看得到最多的那个（车身，而不是面积更大的内饰）
    // 名字像车身漆面的部件（常被拆成好几种材质）一起选上；没有就选从外面看得到最多的
    const model = await loadDisplayModel(probe);
    const best = measureExposure(model, renderer);
    const painted = model.parts.filter((part) => PAINT_NAMES.test(part.label) && part.exposure > 0.02).map((part) => part.key);
    meta.parts = painted.length ? painted : [best.key];
    assignParts(model, meta.parts);
  } catch (error) {
    forgetDisplayModel(id);
    setCompileState(false, "model error");
    throw error;
  }
  await saveRecord("modelData", { id, data });
  await saveRecord("models", meta);
  importedModels.set(id, meta);
  renderImportedModels();
  modelChannel.postMessage({ type: "changed" });
  await setDisplayModel(id);
  const chosen = displayParts.parts.filter((part) => part.enabled).map((part) => part.label);
  logEl.textContent = `已导入 ${meta.name}：${displayParts.parts.length} 个部件，「${chosen.join("、")}」套用材质`;
  return { id, name: meta.name, parts: partsState() };
}

async function deleteModel(id) {
  const meta = importedModels.get(id);
  if (!meta) throw new Error(displayModels[id] ? "内置模型不能删除" : `没有这个导入模型：${id}`);
  await removeRecord("models", id);
  await removeRecord("modelData", id);
  importedModels.delete(id);
  forgetDisplayModel(id);
  for (const key of [...voxelCache.keys()]) {
    if (key.startsWith(`${id}:`)) {
      disposeVoxelGroup(voxelCache.get(key));
      voxelCache.delete(key);
    }
  }
  modelChannel.postMessage({ type: "changed" });
  renderImportedModels();
  if (state.displayModel === id) await setDisplayModel(defaultDisplayModel);
  logEl.textContent = `已删除模型：${meta.name}`;
  return { deleted: id };
}

function partsState() {
  return displayParts.imported ? displayParts.parts.map((part) => ({ key: part.key, label: part.label, enabled: part.enabled, area: round(part.area / displayParts.totalArea) })) : undefined;
}

const modelChannel = new BroadcastChannel("shadermaker-models");

async function reloadImportedModels() {
  importedModels.clear();
  for (const meta of await loadAll("models")) importedModels.set(meta.id, meta);
  renderImportedModels();
  if (displayParts.imported && !importedModels.has(state.displayModel)) setDisplayModel(defaultDisplayModel);
}

async function importFile(file) {
  if (!file) return;
  try {
    await importModel(await file.arrayBuffer(), file.name);
  } catch (error) {
    logEl.textContent = `导入失败：${error.message}`;
    setCompileState(false, "model error");
  }
}

function initModelImport() {
  const fileInput = document.getElementById("model-file");
  document.getElementById("model-import")?.addEventListener("click", () => fileInput?.click());
  fileInput?.addEventListener("change", () => {
    importFile(fileInput.files[0]);
    fileInput.value = "";
  });
  document.getElementById("model-delete")?.addEventListener("click", () => {
    deleteModel(state.displayModel).catch((error) => (logEl.textContent = error.message));
  });
  // 拖到画面上导入
  const viewport = canvas.closest(".viewport") || document.body;
  let depth = 0;
  window.addEventListener("dragenter", (event) => {
    if (![...(event.dataTransfer?.types || [])].includes("Files")) return;
    depth += 1;
    viewport.classList.add("drop-target");
  });
  window.addEventListener("dragleave", () => {
    depth = Math.max(0, depth - 1);
    if (!depth) viewport.classList.remove("drop-target");
  });
  window.addEventListener("dragover", (event) => event.preventDefault());
  window.addEventListener("drop", (event) => {
    event.preventDefault();
    depth = 0;
    viewport.classList.remove("drop-target");
    const file = [...(event.dataTransfer?.files || [])].find((item) => /\.(glb|gltf)$/i.test(item.name));
    if (file) importFile(file);
    else if (event.dataTransfer?.files?.length) logEl.textContent = "只支持 .glb / .gltf 模型";
  });
  modelChannel.addEventListener("message", () => reloadImportedModels());
  reloadImportedModels();
}

function updateViewBounds() {
  display.rotation.set(0, 0, 0);
  display.updateMatrixWorld(true);
  viewBounds.setFromObject(display);
  // 内置模型共用 Shader Ball 大小的取景框，切换时相机不跳；导入的模型（比如扁长的车）按自己的大小取景
  if (!displayParts.imported) viewBounds.union(new THREE.Box3(new THREE.Vector3(-0.8, 0, -0.8), new THREE.Vector3(0.8, 1.5, 0.8)));
  const radius = Math.max(Math.abs(viewBounds.min.x), Math.abs(viewBounds.max.x), Math.abs(viewBounds.min.z), Math.abs(viewBounds.max.z));
  viewBounds.min.set(-radius, 0, -radius);
  viewBounds.max.set(radius, viewBounds.max.y, radius);
}

function highlightDisplayModel() {
  const buttons = [...(shapeRoot?.querySelectorAll("[data-model]") || []), ...(importedRoot?.querySelectorAll("[data-model]") || [])];
  for (const button of buttons) {
    button.classList.toggle("active", button.dataset.model === state.displayModel);
  }
}

function renderDisplayModels() {
  if (!shapeRoot) return;
  shapeRoot.innerHTML = "";
  for (const def of Object.values(displayModels)) {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.model = def.id;
    button.textContent = def.label;
    shapeRoot.append(button);
  }
}

function setRender(mode) {
  state.render = mode === "npr" ? "npr" : "pbr";
  for (const button of renderModeRoot?.querySelectorAll("[data-render]") || []) {
    button.classList.toggle("active", button.dataset.render === state.render);
  }
  if (nprPresetRoot) nprPresetRoot.hidden = state.render !== "npr";
  refreshRenderState();
  renderSliders();
  syncSliders();
  updateTitle();
}

function setNprPreset(id, activate = true) {
  const preset = nprPresets[id] || nprPresets[defaultNprPreset];
  state.nprPreset = preset.id;
  npr.setValues(preset);
  applyPhysical(state.params);
  for (const button of nprPresetRoot?.querySelectorAll("[data-id]") || []) {
    button.classList.toggle("active", button.dataset.id === state.nprPreset);
  }
  if (activate && state.render !== "npr") setRender("npr");
  else syncSliders();
  updateTitle();
}

function renderNprPresets() {
  if (!nprPresetRoot) return;
  nprPresetRoot.innerHTML = "";
  for (const preset of Object.values(nprPresets)) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "chip";
    button.dataset.id = preset.id;
    button.textContent = preset.name;
    button.addEventListener("click", () => {
      setNprPreset(preset.id);
      logEl.textContent = `NPR 切到 ${preset.name}`;
    });
    nprPresetRoot.append(button);
  }
}

function renderChannels() {
  if (!channelRoot) return;
  channelRoot.innerHTML = "";
  for (const channel of channels) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "segment";
    button.dataset.id = channel.id;
    button.textContent = channel.label;
    button.addEventListener("click", () => {
      setChannel(channel.id);
      logEl.textContent = channel.id === "final" ? "回到最终渲染" : `查看 ${channel.label} 通道（已暂停风格化与色调映射）`;
    });
    channelRoot.append(button);
  }
}

function setStyle(id) {
  const style = stylizer.setStyle(id);
  state.style = style.id;
  for (const button of styleRoot?.querySelectorAll("[data-id]") || []) {
    button.classList.toggle("active", button.dataset.id === state.style);
  }
  updateTitle();
  return style;
}

function renderStyles() {
  if (!styleRoot) return;
  styleRoot.innerHTML = "";
  for (const style of Object.values(styles)) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "chip";
    button.dataset.id = style.id;
    button.textContent = style.name;
    button.addEventListener("click", () => {
      setStyle(style.id);
      logEl.textContent = style.id === "none" ? "关闭画面滤镜" : `滤镜切到 ${style.name}`;
    });
    styleRoot.append(button);
  }
}

function updateTitle() {
  const preset = presets[state.preset];
  const base = state.params.name || preset?.name || shaders[state.shader]?.name || "";
  const parts = [base];
  if (state.render === "npr") parts.push(`卡通 ${nprPresets[state.nprPreset].name}`);
  if (state.voxelOn) parts.push(`体素 ${state.voxelRes}`);
  if (state.style !== "none") parts.push(styles[state.style].name);
  nameEl.textContent = parts.join(" · ");
}

function setMode(mode) {
  if (mode !== "pbr" && mode !== "shader") return;
  if (mode === state.mode) return;
  const fallback = presetsForMode(mode)[0];
  if (!fallback) return;
  setPreset(fallback[0], fallback[1]);
}

function syncSliders() {
  for (const group of slidersForMode()) {
    for (const def of group.items) {
      const input = sliderRoot.querySelector(`input[data-key="${def.key}"]`);
      const value = sliderRoot.querySelector(`span[data-key="${def.key}"]`);
      if (!input || !value) continue;
      input.value = String(sliderValue(def));
      paintRange(input);
      value.textContent = Number(sliderValue(def)).toFixed(def.step >= 1 ? 0 : def.step < 0.01 ? 3 : 2);
    }
  }
}

function renderEnvironments() {
  if (!envRoot) return;
  envRoot.innerHTML = "";
  for (const env of Object.values(environments)) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "chip";
    button.dataset.id = env.id;
    // 色块：主光颜色 → 环境底色，一眼看出冷暖
    const key = `#${env.key.color.toString(16).padStart(6, "0")}`;
    const base = `#${env.background.toString(16).padStart(6, "0")}`;
    button.innerHTML = `<i style="background:linear-gradient(135deg, ${key}, ${base} 70%)"></i><span>${env.name}</span>`;
    button.addEventListener("click", () => {
      setEnvironment(env.id);
      logEl.textContent = `环境切到 ${env.name}`;
    });
    envRoot.append(button);
  }
}

function rgbCss(rgb) {
  return `rgb(${rgb.map((channel) => Math.round(channel * 255)).join(", ")})`;
}

function orbStyle(preset) {
  const mid = rgbCss(preset.uColorB);
  const dark = rgbCss(preset.uColorA);
  const light = rgbCss(preset.uAccent);
  const glass = (preset.uTransmission || 0) > 0.4;
  const metal = (preset.uMetalness || 0) > 0.6;
  const iridescent = (preset.uIridescence || 0) > 0.4;
  const shine = metal ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.45)";
  const fill = iridescent
    ? `radial-gradient(circle at 30% 25%, rgba(255,255,255,0.95), #6de7ff 25%, ${mid} 48%, #ff72cf 70%, ${dark})`
    : glass
    ? `radial-gradient(circle at 32% 28%, rgba(255,255,255,0.85), ${mid} 38%, rgba(180,210,230,0.28) 70%, rgba(255,255,255,0.2))`
    : `radial-gradient(circle at 32% 28%, ${shine}, ${mid} 42%, ${dark} 100%)`;
  return `background:${fill};`;
}

function createPresetButton(id, preset) {
  const button = document.createElement("button");
  button.type = "button";
  const label = preset.name || shaders[preset.shader].name;
  if (state.mode === "pbr") {
    button.className = "preset-ball";
    button.innerHTML = `<span class="orb" style="${orbStyle(preset)}"></span><em>${label}</em>`;
  } else {
    const kind = shaders[preset.shader]?.kind === "surface" ? "Surface" : "VFX";
    button.className = "shader-card";
    button.title = `${label} · ${shaders[preset.shader]?.name || ""}`;
    button.innerHTML = `
      <span class="thumb" style="${orbStyle(preset).replace("radial-gradient(circle at 32% 28%", "linear-gradient(135deg")}">
        <img data-thumb="${id}" alt="" ${thumbCache.has(id) ? `src="${thumbCache.get(id)}"` : ""} />
      </span>
      <em>${label}</em>
      <small>${kind}</small>`;
  }
  button.dataset.id = id;
  button.addEventListener("click", () => {
    setPreset(id, preset);
    logEl.textContent = `已切换到 ${label}`;
  });
  return button;
}

// Shader 预设归到哪一组：VFX 单独一组，Surface 按 shaderCategories 归类，没归类的放「其他」
const SHADER_OTHER = { id: "other", label: "其他" };
const VFX_CATEGORY = { id: "vfx", label: "VFX · 自发光特效" };

function shaderCategoryOf(id, preset) {
  if (preset.custom) return customCategory.id;
  if ((shaders[preset.shader]?.kind || "vfx") !== "surface") return VFX_CATEGORY.id;
  return shaderCategories.find((category) => category.items.includes(id))?.id || SHADER_OTHER.id;
}

function libraryCategories() {
  return state.mode === "pbr"
    ? { list: pbrCategories, of: (id, preset) => preset.category, key: "pbrCategory" }
    : { list: [customCategory, ...shaderCategories, SHADER_OTHER, VFX_CATEGORY], of: shaderCategoryOf, key: "shaderCategory" };
}

// Pro 模式的分类筛选（Lite 由 CSS 隐藏，并且始终显示全部）
function createCategoryTabs(entries) {
  const { list, of, key } = libraryCategories();
  const tabs = document.createElement("div");
  tabs.className = "pbr-category-tabs";
  for (const category of [{ id: "all", label: "全部" }, ...list]) {
    const count = category.id === "all" ? entries.length : entries.filter(([id, preset]) => of(id, preset) === category.id).length;
    if (!count) continue;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "category-chip";
    button.classList.toggle("active", state[key] === category.id);
    button.textContent = `${category.label} ${count}`;
    button.addEventListener("click", () => {
      state[key] = category.id;
      renderPresets();
      highlightPreset();
    });
    tabs.append(button);
  }
  return tabs;
}

function renderPresets() {
  presetRoot.innerHTML = "";
  const entries = presetsForMode();
  if (presetTitle) presetTitle.textContent = state.mode === "pbr" ? `PBR 材质库 · ${entries.length}` : `Shader 预设 · ${entries.length}`;
  if (state.mode === "pbr") {
    presetRoot.className = "preset-library";
    presetRoot.append(createCategoryTabs(entries));
    for (const category of pbrCategories) {
      const activeCategory = state.tier === "pro" ? state.pbrCategory : "all";
      if (activeCategory !== "all" && activeCategory !== category.id) continue;
      const categoryEntries = entries.filter(([, preset]) => preset.category === category.id);
      if (!categoryEntries.length) continue;
      const group = document.createElement("div");
      group.className = "preset-category";
      group.innerHTML = `<h3>${category.label}</h3>`;
      const balls = document.createElement("div");
      balls.className = "preset-balls";
      for (const [id, preset] of categoryEntries) balls.append(createPresetButton(id, preset));
      group.append(balls);
      presetRoot.append(group);
    }
  } else {
    presetRoot.className = "shader-library";
    presetRoot.append(createCategoryTabs(entries));
    const { list, of } = libraryCategories();
    const activeCategory = state.tier === "pro" ? state.shaderCategory : "all";
    for (const category of list) {
      if (activeCategory !== "all" && activeCategory !== category.id) continue;
      const categoryEntries = entries.filter(([id, preset]) => of(id, preset) === category.id);
      if (!categoryEntries.length) continue;
      const group = document.createElement("div");
      group.className = "shader-category";
      group.innerHTML = `<h3>${category.label}</h3>`;
      const cards = document.createElement("div");
      cards.className = "shader-cards";
      for (const [id, preset] of categoryEntries) cards.append(createPresetButton(id, preset));
      group.append(cards);
      presetRoot.append(group);
    }
    queueThumbnails(entries);
  }
  if (randomButton) randomButton.hidden = state.mode !== "shader";
}

function renderSliders() {
  sliderRoot.innerHTML = "";
  if (parameterTitle) {
    const surface = state.mode === "shader" && shaders[state.shader]?.kind === "surface";
    const material = state.mode === "pbr" ? "PBR 参数" : surface ? "Surface 参数" : "VFX 参数";
    if (state.tier === "lite") parameterTitle.textContent = "调节";
    else parameterTitle.textContent = state.render === "npr" ? `卡通光照 · ${material}` : material;
  }
  const pro = state.tier === "pro";
  for (const group of slidersForMode()) {
    let currentSection = "";
    if (pro && state.render === "npr" && group.id !== "npr") {
      const divider = document.createElement("div");
      divider.className = "slider-divider";
      divider.textContent = "材质";
      sliderRoot.append(divider);
    }
    for (const def of group.items) {
      if (pro && def.section && def.section !== currentSection) {
        currentSection = def.section;
        const heading = document.createElement("div");
        heading.className = "slider-group";
        heading.textContent = currentSection;
        sliderRoot.append(heading);
      }
      const wrap = document.createElement("div");
      wrap.className = "slider";
      wrap.innerHTML = `
        <label>
          <b>${def.label}</b>
          <span data-key="${def.key}">0.00</span>
        </label>
        <input type="range" min="${def.min}" max="${def.max}" step="${def.step}" data-key="${def.key}" />
      `;
      const input = wrap.querySelector("input");
      input.addEventListener("input", () => {
        paintRange(input);
        if (def.npr) {
          npr.setValues({ [def.key]: Number(input.value) });
          applyPhysical(state.params);
                  syncSliders();
          return;
        }
        state.params[def.key] = Number(input.value);
        if (shaderUniforms[def.key]) {
          shaderUniforms[def.key].value = state.params[def.key];
        }
        updateChannelShaders();
        applyPhysical(state.params);
        syncSliders();
      });
      sliderRoot.append(wrap);
    }
  }
}

function renderHints() {
  hintRoot.innerHTML = "";
  const hints = state.mode === "pbr" ? hintPrompts.pbr : hintPrompts.shader;
  for (const text of hints) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = text;
    button.addEventListener("click", () => {
      promptInput.value = text;
      applyPrompt(text);
    });
    hintRoot.append(button);
  }
}

// 输入框里提到效果名（或关键词）：切换效果并触发一次；「关掉效果」关闭。效果词先从句子里去掉，免得被当成材质名
function promptEffect(text) {
  const lower = text.toLowerCase();
  if (/(关|去掉|不要|关闭).{0,3}效果/.test(lower)) return { off: true, rest: lower.replace(/(关|去掉|不要|关闭).{0,3}效果/, "") };
  for (const record of allEffects()) {
    const key = [record.name, ...(record.keys || [])].find((item) => item && lower.includes(item.toLowerCase()));
    if (key) return { record, rest: lower.replace(key.toLowerCase(), "") };
  }
  return null;
}

function applyPrompt(text) {
  const effect = promptEffect(text);
  if (effect) {
    if (effect.off) activateEffect(null);
    else {
      activateEffect(effect.record.id);
      if (effectUses(effect.record, "uClickAge")) pushClick(defaultClickPoint());
    }
    const note = effect.off ? "关闭效果" : `效果：${effect.record.name}`;
    const rest = interpretPrompt(effect.rest, { ...state, nprValues: npr.values });
    if (!rest.ok) {
      logEl.textContent = note;
      return { ok: true, message: note };
    }
    const result = applyPrompt(effect.rest);
    result.message = `${note} · ${result.message}`;
    logEl.textContent = result.message;
    return result;
  }
  const result = interpretPrompt(text, { ...state, nprValues: npr.values });
  logEl.textContent = result.message;
  if (!result.ok) return result;
  const nextPreset = result.preset || result.shader;
  if (nextPreset !== state.preset || result.shader !== state.shader) {
    setPreset(nextPreset, result.params);
  } else {
    applyParams(result.params);
  }
  if (result.environment && result.environment !== state.environment) {
    setEnvironment(result.environment);
  }
  if (result.style && result.style !== state.style) setStyle(result.style);
  if (result.nprPreset && result.nprPreset !== state.nprPreset) setNprPreset(result.nprPreset);
  if (result.nprValues) {
    npr.setValues(result.nprValues);
    applyPhysical(state.params);
    }
  if (result.displayModel && result.displayModel !== state.displayModel) setDisplayModel(result.displayModel);
  if (result.voxel === "off") setVoxel(false);
  else if (result.voxel === "on") setVoxel(true);
  else if (result.voxel) setVoxel(true, voxelPresets[result.voxel]);
  if (result.render && result.render !== state.render) setRender(result.render);
  else syncSliders();
  updateTitle();
  return result;
}

// 随机变体：整体旋转色相 + 换噪声种子 + 轻微扰动尺度/扭曲
function rotateHue(rgb, turn) {
  const color = new THREE.Color().setRGB(...rgb);
  const hsl = {};
  color.getHSL(hsl);
  color.setHSL((hsl.h + turn + 1) % 1, hsl.s, hsl.l);
  return [color.r, color.g, color.b];
}

function randomVariant() {
  const turn = 0.15 + Math.random() * 0.7;
  const params = { ...state.params };
  params.uColorA = rotateHue(params.uColorA, turn);
  params.uColorB = rotateHue(params.uColorB, turn);
  params.uAccent = rotateHue(params.uAccent, turn);
  params.uSeed = Math.floor(Math.random() * 200);
  params.uScale = THREE.MathUtils.clamp(params.uScale * (0.8 + Math.random() * 0.4), 0.4, 5);
  params.uWarp = THREE.MathUtils.clamp(params.uWarp * (0.75 + Math.random() * 0.5), 0, 2.4);
  applyParams(params);
  logEl.textContent = `随机变体：色相旋转 ${Math.round(turn * 360)}°，种子 ${params.uSeed}`;
}

function setTier(tier) {
  state.tier = tier === "pro" ? "pro" : "lite";
  document.body.dataset.tier = state.tier;
  try {
    localStorage.setItem(TIER_KEY, state.tier);
  } catch {
    // 存不了就只在本次生效
  }
  for (const button of tierRoot?.querySelectorAll("[data-tier]") || []) {
    button.classList.toggle("active", button.dataset.tier === state.tier);
  }
  // Lite 没有通道检查，切回最终画面
  if (state.tier === "lite" && state.channel !== "final") setChannel("final");
  renderPresets();
  highlightPreset();
  renderSliders();
  syncSliders();
}

tierRoot?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-tier]");
  if (button) setTier(button.dataset.tier);
});

randomButton?.addEventListener("click", randomVariant);

scopeRoot?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-scope]");
  if (!button) return;
  setScope(button.dataset.scope);
  logEl.textContent = state.scope === "global" ? "NPR 与滤镜作用于整个画面" : "NPR 与滤镜只作用于展示模型";
});

voxelToggle?.addEventListener("change", () => setVoxel(voxelToggle.checked));

// 拖动时每帧最多重算一次体素
let voxelFrame = 0;
voxelSlider?.addEventListener("input", () => {
  if (voxelValue) voxelValue.textContent = voxelSlider.value;
  paintRange(voxelSlider);
  cancelAnimationFrame(voxelFrame);
  voxelFrame = requestAnimationFrame(() => setVoxel(true, Number(voxelSlider.value)));
});

shapeRoot?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-model]");
  if (!button) return;
  setDisplayModel(button.dataset.model);
  logEl.textContent = `展示模型：${modelDef(button.dataset.model).label}`;
});

renderModeRoot?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-render]");
  if (!button) return;
  setRender(button.dataset.render);
  logEl.textContent = state.render === "npr" ? `切到卡通 · ${nprPresets[state.nprPreset].name}` : "切回写实渲染";
});

styleAmountInput?.addEventListener("input", () => {
  const value = Number(styleAmountInput.value);
  stylizer.setAmount(value);
  styleAmountValue.textContent = `${Math.round(value * 100)}%`;
  paintRange(styleAmountInput);
});

form.addEventListener("submit", (event) => {
  event.preventDefault();
  applyPrompt(promptInput.value);
});

function getCanvasSize() {
  const rect = canvas.getBoundingClientRect();
  return {
    width: Math.max(1, Math.round(rect.width || canvas.clientWidth || window.innerWidth)),
    height: Math.max(1, Math.round(rect.height || canvas.clientHeight || window.innerHeight)),
  };
}

function syncViewport(resetOrbit = false) {
  const { width, height } = getCanvasSize();
  const aspect = width / height;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(width, height, false);
  stylizer.setSize(width, height, renderer.getPixelRatio());
  camera.clearViewOffset();
  camera.aspect = aspect;
  camera.fov = aspect < 0.72 ? 46 : 38;
  camera.updateProjectionMatrix();

  const bounds = viewBounds;
  const size = bounds.getSize(new THREE.Vector3());
  const center = bounds.getCenter(new THREE.Vector3());
  // 视口底部有输入框，取景中心往下挪一点，模型显示得靠上
  center.y -= size.y * 0.14;
  const maxSize = Math.max(size.x, size.y, size.z);
  const vFit = maxSize / 2 / Math.tan(THREE.MathUtils.degToRad(camera.fov * 0.5));
  const distance = Math.max(vFit, vFit / Math.max(aspect, 0.35)) * 2.05;

  controls.target.copy(center);
  const direction = resetOrbit
    ? new THREE.Vector3(0.58, 0.32, 1)
    : camera.position.clone().sub(controls.target);
  if (direction.lengthSq() < 1e-4) direction.set(0.58, 0.32, 1);
  camera.position.copy(center).add(direction.setLength(distance));
  controls.minDistance = distance * 0.55;
  controls.maxDistance = distance * 2.8;
  controls.update();
}

let viewportTick = 0;
function requestViewportSync(resetOrbit = false) {
  cancelAnimationFrame(viewportTick);
  viewportTick = requestAnimationFrame(() => syncViewport(resetOrbit));
}

window.addEventListener("resize", () => requestViewportSync(false));
window.visualViewport?.addEventListener("resize", () => requestViewportSync(false));
new ResizeObserver(() => requestViewportSync(false)).observe(canvas);

const clock = new THREE.Clock();

// 每张程序贴图先画到中间缓冲，再做成可平铺写进最终贴图（三向投影重复处不留接缝）
const tiler = createTiler(1024);

function drawChannel(material, target) {
  surfaceMesh.material = material;
  renderer.setRenderTarget(tiler.target);
  renderer.render(surfaceScene, surfaceCamera);
  tiler.resolve(renderer, target);
}

function tick() {
  const elapsed = clock.getElapsedTime();
  shaderUniforms.uTime.value = elapsed;
  materialFxUniforms.uFxTime.value = elapsed;
  materialFxUniforms.uFxFlow.value = elapsed * (state.params.uSpeed ?? 0) * (shaders[state.shader]?.timeScale ?? 1);
  updateEffectInputs(elapsed);
  // 模型不自动旋转，用鼠标拖动视角查看
  updateTriplanar(display);
  controls.update();
  camera.updateMatrixWorld();
  npr.updateKeyLight(keyLight, camera);
  drawChannel(albedoMaterial, albedoTarget);
  drawChannel(ormMaterial, ormTarget);
  drawChannel(normalMaterial, normalTarget);
  drawChannel(emissiveMaterial, emissiveTarget);
  renderer.setRenderTarget(null);
  stylizer.render(elapsed);
  requestAnimationFrame(tick);
}

document.getElementById("mode-tabs")?.addEventListener("click", (event) => {
  const button = event.target.closest(".mode-tab");
  if (!button) return;
  setMode(button.dataset.mode);
});

setTier(state.tier);
renderEnvironments();
renderStyles();
renderChannels();
renderNprPresets();
renderDisplayModels();
initVoxelControls();
initEffects();
initModelImport();
setStyle(defaultStyle);
setNprPreset(defaultNprPreset, false);
setRender("pbr");
setPreset("snow", presets.snow);
setEnvironment(defaultEnvironment);
setDisplayModel(defaultDisplayModel);
syncViewport(true);
tick();

// ---- 外部控制接口：Cindy 插件的 AI 工具经由它操作页面（普通网页里不会被调用） ----

const materialSliderKeys = new Set(sliderDefs.map((def) => def.key));
const colorKeys = ["uColorA", "uColorB", "uAccent"];

function round(value) {
  return Math.round(value * 1000) / 1000;
}

function hexToRgb(hex) {
  const match = /^#?([0-9a-f]{6})$/i.exec(String(hex).trim());
  if (!match) return null;
  const value = parseInt(match[1], 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255].map((channel) => round(channel / 255));
}

function rgbToHex(rgb) {
  return `#${rgb.map((channel) => Math.round(THREE.MathUtils.clamp(channel, 0, 1) * 255).toString(16).padStart(2, "0")).join("")}`;
}

function getState() {
  const params = {};
  for (const group of slidersForMode()) {
    for (const def of group.items) if (!def.npr) params[def.key] = round(state.params[def.key]);
  }
  return {
    title: nameEl.textContent,
    tier: state.tier,
    material: {
      id: state.preset,
      name: state.params.name || presets[state.preset]?.name || "",
      library: state.mode,
      custom: Boolean(presets[state.preset]?.custom),
    },
    render: state.render,
    nprPreset: state.nprPreset,
    nprValues: state.render === "npr" ? Object.fromEntries(nprSliders.map((def) => [def.key, round(npr.values[def.key])])) : undefined,
    style: state.style,
    styleAmount: round(Number(styleAmountInput?.value ?? 1)),
    scope: state.scope,
    environment: state.environment,
    displayModel: state.displayModel,
    model: {
      id: state.displayModel,
      name: modelDef(state.displayModel).label,
      imported: Boolean(displayParts.imported),
      parts: partsState(),
      importedModels: [...importedModels.values()].map((meta) => ({ id: meta.id, name: meta.name })),
    },
    voxel: { on: state.voxelOn, resolution: state.voxelRes },
    effect: effectState(),
    colors: Object.fromEntries(colorKeys.map((key) => [key, rgbToHex(state.params[key])])),
    params,
  };
}

function setStyleAmount(value) {
  const amount = THREE.MathUtils.clamp(Number(value), 0, 1);
  stylizer.setAmount(amount);
  if (styleAmountInput) {
    styleAmountInput.value = String(amount);
    paintRange(styleAmountInput);
  }
  if (styleAmountValue) styleAmountValue.textContent = `${Math.round(amount * 100)}%`;
}

// 按页面上的操作顺序套用：材质 → 渲染模式 → 滤镜 → 环境 / 模型（异步，等加载完） → 体素 → 参数微调
async function setLook(look = {}) {
  const warnings = [];
  const pick = (value, table, label) => {
    if (value === undefined || value === null || value === "") return null;
    if (table[value]) return value;
    warnings.push(`未知的${label}：${value}`);
    return null;
  };
  const preset = pick(look.material, presets, "材质");
  if (preset) setPreset(preset, presets[preset]);
  const nprPreset = pick(look.nprPreset, nprPresets, "NPR 预设");
  if (nprPreset) setNprPreset(nprPreset, false);
  if (look.render) {
    if (look.render === "pbr" || look.render === "npr") setRender(look.render);
    else warnings.push(`未知的渲染模式：${look.render}`);
  } else if (nprPreset && state.render !== "npr") {
    setRender("npr");
  }
  const style = pick(look.style, styles, "滤镜");
  if (style) setStyle(style);
  if (look.styleAmount !== undefined) setStyleAmount(look.styleAmount);
  if (look.scope) {
    if (look.scope === "subject" || look.scope === "global") setScope(look.scope);
    else warnings.push(`未知的作用范围：${look.scope}`);
  }
  const environment = pick(look.environment, environments, "环境");
  if (environment) await setEnvironment(environment);
  // 展示模型：内置 id、导入模型的 id，或导入模型的名字
  if (look.displayModel) {
    const wanted = String(look.displayModel);
    const imported = importedModels.get(wanted) || [...importedModels.values()].find((meta) => meta.name === wanted);
    const model = displayModels[wanted] ? wanted : imported?.id;
    if (model) await setDisplayModel(model);
    else warnings.push(`未知的展示模型：${wanted}`);
  }
  // modelParts：导入模型里套用 ShaderMaker 材质的部件（key 或部件名的数组）
  if (look.modelParts !== undefined) {
    if (!displayParts.imported) warnings.push("当前不是导入的模型，modelParts 不生效");
    else {
      const keys = [];
      for (const item of [].concat(look.modelParts)) {
        const part = displayParts.parts.find((entry) => entry.key === item || entry.label === item);
        if (part) keys.push(part.key);
        else warnings.push(`没有这个部件：${item}`);
      }
      if (keys.length) await setModelParts(keys);
    }
  }
  if (look.voxel !== undefined || look.voxelResolution !== undefined) {
    setVoxel(look.voxel ?? true, look.voxelResolution ?? state.voxelRes);
  }

  let materialChanged = false;
  for (const [key, value] of Object.entries(look.params || {})) {
    const def = sliderDefs.find((item) => item.key === key);
    if (!materialSliderKeys.has(key) || !Number.isFinite(Number(value))) {
      warnings.push(`未知的材质参数：${key}`);
      continue;
    }
    state.params[key] = THREE.MathUtils.clamp(Number(value), def.min, def.max);
    materialChanged = true;
  }
  for (const [key, value] of Object.entries(look.colors || {})) {
    const rgb = colorKeys.includes(key) ? hexToRgb(value) : null;
    if (!rgb) {
      warnings.push(`无效的颜色：${key}=${value}`);
      continue;
    }
    state.params[key] = rgb;
    materialChanged = true;
  }
  if (materialChanged) applyParams(state.params);

  const nprValues = {};
  for (const [key, value] of Object.entries(look.nprValues || {})) {
    const def = nprSliders.find((item) => item.key === key);
    if (!def || !Number.isFinite(Number(value))) {
      warnings.push(`未知的 NPR 参数：${key}`);
      continue;
    }
    nprValues[key] = THREE.MathUtils.clamp(Number(value), def.min, def.max);
  }
  if (Object.keys(nprValues).length) {
    npr.setValues(nprValues);
    applyPhysical(state.params);
  }
  if (look.effect !== undefined) applyEffectLook(look.effect, warnings);
  syncSliders();
  updateTitle();
  logEl.textContent = `AI 调整：${nameEl.textContent}`;
  return { state: getState(), warnings };
}

async function describeLook(text) {
  promptInput.value = text;
  const result = applyPrompt(text);
  // 环境 / 模型是异步加载的，等一下再回报状态
  await new Promise((resolve) => setTimeout(resolve, 50));
  return { ok: result.ok, message: result.message, state: getState() };
}

// 截图：当场渲染一帧再读画布（WebGL 画布不保留绘制缓冲，必须在同一个任务里读）
function snapshot(maxSize = 768) {
  const size = THREE.MathUtils.clamp(Math.round(Number(maxSize) || 768), 256, 1280);
  stylizer.render(clock.getElapsedTime());
  const scale = Math.min(1, size / Math.max(canvas.width, canvas.height));
  const out = document.createElement("canvas");
  out.width = Math.max(1, Math.round(canvas.width * scale));
  out.height = Math.max(1, Math.round(canvas.height * scale));
  out.getContext("2d").drawImage(canvas, 0, 0, out.width, out.height);
  return { dataUrl: out.toDataURL("image/jpeg", 0.85), width: out.width, height: out.height, state: getState() };
}

// ---- 自定义 Shader：AI 直接写 GLSL，编译通过后存进本机浏览器并加入材质库「自定义」分组 ----

const builtinShaderIds = new Set(Object.keys(shaders));
const customRecords = new Map();
// 主视图和任务页可能同时开着：一边改了，通知另一边重新读取
const libraryChannel = new BroadcastChannel("shadermaker-library");

function registerCustomShader(record) {
  shaders[record.id] = buildShader(record);
  presets[record.id] = shaderPreset(record.id, record.name, { ...defaultValues(record.kind), ...record.values, custom: true });
  thumbCache.delete(record.id);
  customRecords.set(record.id, record);
}

function unregisterCustomShader(id) {
  delete shaders[id];
  delete presets[id];
  thumbCache.delete(id);
  customRecords.delete(id);
}

async function reloadCustomShaders() {
  const records = await loadCustomShaders();
  for (const id of [...customRecords.keys()]) if (!records.some((record) => record.id === id)) unregisterCustomShader(id);
  for (const record of records) registerCustomShader(record);
  if (!presets[state.preset]) setPreset("snow", presets.snow);
  else if (customRecords.has(state.preset)) setPreset(state.preset, presets[state.preset]);
  else {
    renderPresets();
    highlightPreset();
  }
}

libraryChannel.addEventListener("message", () => reloadCustomShaders());
reloadCustomShaders();

function customSummary(record) {
  return { id: record.id, name: record.name, kind: record.kind };
}

// 参数 / 颜色的校验和 setLook 一致：未知或无效的进 warnings
function readValues(input, base, warnings) {
  const values = { ...base };
  for (const [key, value] of Object.entries(input.params || {})) {
    const def = sliderDefs.find((item) => item.key === key);
    if (!def || !Number.isFinite(Number(value))) {
      warnings.push(`未知的材质参数：${key}`);
      continue;
    }
    values[key] = THREE.MathUtils.clamp(Number(value), def.min, def.max);
  }
  for (const [key, value] of Object.entries(input.colors || {})) {
    const rgb = colorKeys.includes(key) ? hexToRgb(value) : null;
    if (!rgb) {
      warnings.push(`无效的颜色：${key}=${value}`);
      continue;
    }
    values[key] = rgb;
  }
  return values;
}

async function writeShader(input = {}) {
  const id = String(input.id || "").trim();
  if (!/^[a-zA-Z][a-zA-Z0-9_-]{1,39}$/.test(id)) throw new Error("id 要以英文字母开头，2–40 位字母、数字、_ 或 -");
  if (builtinShaderIds.has(id) || (presets[id] && !presets[id].custom)) throw new Error(`「${id}」是内置材质的 id，请换一个`);
  const code = String(input.code || "");
  if (!code.trim()) throw new Error("code 不能为空");
  if (code.length > 60000) throw new Error("代码太长（上限 60000 字符）");
  const existing = customRecords.get(id);
  const kind = input.kind === "vfx" ? "vfx" : input.kind === "surface" ? "surface" : existing?.kind || "surface";
  const warnings = [];
  const record = {
    id,
    name: String(input.name || existing?.name || id).trim().slice(0, 40),
    kind,
    code,
    timeScale: THREE.MathUtils.clamp(Number(input.timeScale ?? existing?.timeScale ?? 0.3) || 0, 0, 3),
    values: readValues(input, existing?.kind === kind ? existing.values : {}, warnings),
    createdAt: existing?.createdAt || Date.now(),
    updatedAt: Date.now(),
  };
  const errors = checkShader(renderer, buildShader(record), thumbUniforms);
  if (errors.length) return { compiled: false, errors, message: formatErrors(errors, code) };
  await saveCustomShader(record);
  registerCustomShader(record);
  libraryChannel.postMessage({ type: "changed", id });
  if (input.apply !== false) setPreset(id, presets[id]);
  else {
    renderPresets();
    highlightPreset();
  }
  logEl.textContent = `${existing ? "已更新" : "已新增"}自定义 Shader：${record.name}`;
  return { compiled: true, created: !existing, shader: customSummary(record), warnings, state: getState() };
}

function readShader(input = {}) {
  const id = String(input.id || "").trim();
  if (id === "library") return { id, reference: libraryReference() };
  if (!id) {
    return {
      guide: shaderGuide,
      builtin: Object.entries(shaders)
        .filter(([key]) => builtinShaderIds.has(key) && key !== "lookdev")
        .map(([key, def]) => ({ id: key, name: def.name, kind: def.kind || "vfx" })),
      custom: [...customRecords.values()].map(customSummary),
    };
  }
  const shaderId = shaders[id] ? id : presets[id]?.shader;
  const definition = shaders[shaderId];
  if (!definition) throw new Error(`没有这个 Shader：${id}`);
  const presetId = presets[id] ? id : Object.keys(presets).find((key) => presets[key].shader === shaderId);
  const preset = presets[presetId] || {};
  return {
    id: shaderId,
    name: definition.name,
    kind: definition.kind || "vfx",
    custom: Boolean(definition.custom),
    timeScale: definition.timeScale ?? 1,
    // 内置的 Surface Shader 有的没带可平铺库（旧写法），自定义 Shader 一律带
    code: definition.source,
    preset: presetId
      ? {
          id: presetId,
          name: preset.name,
          colors: Object.fromEntries(colorKeys.map((key) => [key, rgbToHex(preset[key] || [0, 0, 0])])),
          params: Object.fromEntries(sliderDefs.filter((def) => preset[def.key] !== undefined).map((def) => [def.key, round(preset[def.key])])),
        }
      : undefined,
  };
}

async function deleteShader(input = {}) {
  const id = String(input.id || "").trim();
  if (!customRecords.has(id)) throw new Error(builtinShaderIds.has(id) ? "内置 Shader 不能删除" : `没有这个自定义 Shader：${id}`);
  const name = customRecords.get(id).name;
  await removeCustomShader(id);
  unregisterCustomShader(id);
  libraryChannel.postMessage({ type: "changed", id });
  if (state.preset === id) setPreset("snow", presets.snow);
  else {
    renderPresets();
    highlightPreset();
  }
  logEl.textContent = `已删除自定义 Shader：${name}`;
  return { deleted: id, custom: [...customRecords.values()].map(customSummary), state: getState() };
}

// ---- 效果：AI 读写 ----

function effectState() {
  const record = activeEffect();
  if (!record) return null;
  return {
    id: record.id,
    name: record.name,
    custom: customEffects.has(record.id),
    params: Object.fromEntries(record.params.map((def) => [def.key, def.type === "color" ? effectParamValue(def.key) : round(effectParamValue(def.key))])),
    clicks: effectInputs.uClickCount.value,
    clickAge: effectInputs.uClickCount.value ? round(effectInputs.uClickAge.value) : null,
  };
}

// set_look 的 effect：传 null / "none" 关闭；对象 { id, params, trigger, freezeAge }
function applyEffectLook(look, warnings) {
  if (look === null || look === "none" || look?.id === null || look?.id === "none") {
    activateEffect(null);
    return;
  }
  const spec = typeof look === "string" ? { id: look } : look;
  if (spec.id && spec.id !== activeEffect()?.id) {
    if (!findEffect(spec.id)) {
      warnings.push(`未知的效果：${spec.id}`);
      return;
    }
    activateEffect(spec.id);
  }
  const record = activeEffect();
  if (!record) {
    warnings.push("当前没有效果，先传 id");
    return;
  }
  for (const [key, value] of Object.entries(spec.params || {})) {
    if (setEffectParam(key, value)) rememberEffectValue(key, value);
    else warnings.push(`效果「${record.name}」没有参数 ${key}`);
  }
  // trigger：true = 画面正中；[x, y, z] = 展示空间里的点（会吸附到最近的表面附近，不做检查）
  if (spec.trigger) {
    const point = Array.isArray(spec.trigger) && spec.trigger.length === 3 ? new THREE.Vector3(...spec.trigger.map(Number)) : defaultClickPoint();
    pushClick(point);
  }
  // freezeAge：把「距上次点击的秒数」停在这个值，方便截某一刻；null 恢复走时
  if (spec.freezeAge !== undefined) {
    if (spec.freezeAge === null) {
      if (input.clicks[0] && input.frozenAge !== null) input.clicks[0].time = clock.getElapsedTime() - input.frozenAge;
      input.frozenAge = null;
    } else {
      if (!input.clicks.length) pushClick(defaultClickPoint());
      input.frozenAge = Math.max(0, Number(spec.freezeAge) || 0);
    }
  }
  renderEffectControls();
}

function effectSummary(record) {
  return { id: record.id, name: record.name, description: record.description, custom: customEffects.has(record.id) };
}

function readEffect(spec = {}) {
  const id = String(spec.id || "").trim();
  if (!id) return { guide: effectGuide, effects: allEffects().map(effectSummary) };
  const record = findEffect(id);
  if (!record) throw new Error(`没有这个效果：${id}`);
  const { keys, createdAt, ...definition } = record;
  return { ...definition, custom: customEffects.has(id) };
}

// 写入：结构校验 → 设为当前效果 → 编译检查（失败就恢复原来的效果并返回带行号的错误）→ 保存
async function writeEffect(spec = {}) {
  if (builtinEffects.has(String(spec.id || "").trim())) throw new Error(`「${spec.id}」是内置范例的 id，换一个（可以 read_effect 读它的代码再改）`);
  const record = normalizeEffect(spec, reservedUniforms);
  const existing = customEffects.get(record.id);
  record.createdAt = existing?.createdAt || Date.now();
  record.updatedAt = Date.now();
  const previous = activeEffect();
  setActiveEffect(record, {});
  const errors = checkEffect(renderer);
  if (errors.length) {
    setActiveEffect(previous, previous ? effectValues.get(previous.id) || {} : {});
    return { compiled: false, errors, message: formatEffectErrors(errors) };
  }
  await saveRecord("effects", record);
  customEffects.set(record.id, record);
  effectValues.delete(record.id);
  effectChannel.postMessage({ type: "changed", id: record.id });
  if (spec.apply === false) activateEffect(previous?.id || null);
  else activateEffect(record.id);
  if (spec.apply !== false && spec.trigger) pushClick(defaultClickPoint());
  logEl.textContent = `${existing ? "已更新" : "已新增"}效果：${record.name}`;
  return { compiled: true, created: !existing, effect: effectSummary(record), state: getState() };
}

async function deleteEffect(spec = {}) {
  const id = String(spec.id || "").trim();
  if (!customEffects.has(id)) throw new Error(builtinEffects.has(id) ? "内置范例不能删除" : `没有这个自定义效果：${id}`);
  const name = customEffects.get(id).name;
  await removeRecord("effects", id);
  customEffects.delete(id);
  effectValues.delete(id);
  effectChannel.postMessage({ type: "changed", id });
  if (state.effect === id) activateEffect(null);
  else renderEffects();
  logEl.textContent = `已删除效果：${name}`;
  return { deleted: id, effects: allEffects().map(effectSummary), state: getState() };
}

export const shaderMaker = {
  getState,
  setLook,
  describeLook,
  snapshot,
  writeShader,
  readShader,
  deleteShader,
  writeEffect,
  readEffect,
  deleteEffect,
  // AI 导入：页面从插件的媒体库地址读模型文件（cindy-plugin/main.js 先用 cindy.fetch 下载进媒体库）
  async importModelFrom({ urls = [], name } = {}) {
    let lastError = "";
    for (const url of urls) {
      const response = await fetch(url).catch((error) => ({ ok: false, statusText: error.message }));
      if (!response.ok) {
        lastError = `${url}：${response.status || ""} ${response.statusText || ""}`;
        continue;
      }
      const result = await importModel(await response.arrayBuffer(), name);
      return { ...result, state: getState() };
    }
    throw new Error(`读不到下载好的模型文件（${lastError}）`);
  },
  async deleteModel({ id } = {}) {
    const result = await deleteModel(String(id || ""));
    return { ...result, state: getState() };
  },
};

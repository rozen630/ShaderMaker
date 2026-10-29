import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RGBELoader } from "three/addons/loaders/RGBELoader.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { vertexShader, shaders, channelShaders } from "./shaders.js";
import { presets, pbrCategories, sliderGroups } from "./presets.js";
import { interpretPrompt, hintPrompts } from "./nl.js";
import { environments, defaultEnvironment } from "./environments.js";
import { createStylizer, styles, defaultStyle, MASK_LAYER } from "./stylize.js";
import { createNpr, nprPresets, nprSliders, defaultNprPreset } from "./npr.js";
import { displayModels, defaultDisplayModel, loadDisplayModel } from "./models.js";

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


const state = {
  mode: "pbr",
  pbrCategory: "all",
  preset: "lookdev",
  shader: "lookdev",
  environment: defaultEnvironment,
  style: defaultStyle,
  render: "pbr",
  scope: "subject",
  displayModel: defaultDisplayModel,
  nprPreset: defaultNprPreset,
  channel: "final",
  params: { ...presets.lookdev },
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
  },
  vertexShader: /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
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
vec3 toLinear(vec3 c) { return pow(c, vec3(2.2)); }
void main() {
  vec2 uv = vUv * uUvRepeat;
  vec3 orm = texture2D(tOrm, uv).rgb;
  vec3 c = texture2D(tAlbedo, uv).rgb;
  if (uChannel == 2) c = toLinear(vec3(orm.r));
  else if (uChannel == 3) c = toLinear(vec3(orm.g));
  else if (uChannel == 4) c = toLinear(vec3(orm.b));
  else if (uChannel == 5) c = toLinear(texture2D(tNormal, uv).rgb);
  else if (uChannel == 6) c = texture2D(tEmissive, uv).rgb;
  gl_FragColor = vec4(c, 1.0);
}
`,
});


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
  return state.render === "npr" ? [nprGroup, ...groups] : groups;
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
  const pending = hdrLoader.loadAsync(url).then((texture) => {
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
  cubeMaterial.normalScale.setScalar(mapped && state.shader !== "lookdev" ? params.uNormal : 0);
  cubeMaterial.map = mapped ? albedoTarget.texture : null;
  cubeMaterial.roughnessMap = mapped ? ormTarget.texture : null;
  cubeMaterial.metalnessMap = mapped ? ormTarget.texture : null;
  cubeMaterial.aoMap = mapped ? ormTarget.texture : null;
  cubeMaterial.normalMap = mapped ? normalTarget.texture : null;
  cubeMaterial.emissiveMap = mapped ? emissiveTarget.texture : null;
  if (mapped) cubeMaterial.color.setRGB(1, 1, 1);
  else cubeMaterial.color.setRGB(...params.uColorB);
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
  // 校色件（内芯色环、灰底盘）是参照物，任何模式下都保持写实
  for (const mesh of displayParts.neutralMeshes) mesh.material = mesh.userData.pbrMaterial;
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

// 展示模型：异步加载（Shader Ball 是 GLB），用 token 丢弃过期结果
let displayToken = 0;

async function setDisplayModel(id) {
  const def = displayModels[id] || displayModels[defaultDisplayModel];
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
  if (displayParts.root) {
    npr.removeOutlines((target) => target.userData.display === true);
    display.remove(displayParts.root);
  }
  displayParts = parts;
  displayDef = def;
  state.displayModel = def.id;
  for (const mesh of [...parts.materialMeshes, ...parts.neutralMeshes]) {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.layers.enable(MASK_LAYER);
    mesh.userData.display = true;
  }
  for (const mesh of parts.materialMeshes) {
    npr.makeOutline(mesh, { source: nprSubjectMaterial, stencil: true }).layers.enable(MASK_LAYER);
  }
  display.rotation.set(0, 0, 0);
  display.add(parts.root);
  // 程序贴图的平铺次数跟着模型走（贴图是共享的，改 repeat 对 PBR / NPR 材质同时生效）
  const repeat = def.uvRepeat || 1;
  for (const target of [albedoTarget, ormTarget, normalTarget, emissiveTarget]) target.texture.repeat.set(repeat, repeat);
  channelMaterial.uniforms.uUvRepeat.value = repeat;
  updateViewBounds();
  refreshRenderState();
  highlightDisplayModel();
  requestViewportSync(false);
  setCompileState(true, "ready");
}

function updateViewBounds() {
  display.rotation.set(0, 0, 0);
  display.updateMatrixWorld(true);
  viewBounds.setFromObject(display);
  // 所有模型共用 Shader Ball 大小的取景框，切换时相机不跳
  viewBounds.union(new THREE.Box3(new THREE.Vector3(-0.8, 0, -0.8), new THREE.Vector3(0.8, 1.5, 0.8)));
  const radius = Math.max(Math.abs(viewBounds.min.x), Math.abs(viewBounds.max.x), Math.abs(viewBounds.min.z), Math.abs(viewBounds.max.z));
  viewBounds.min.set(-radius, 0, -radius);
  viewBounds.max.set(radius, viewBounds.max.y, radius);
}

function highlightDisplayModel() {
  for (const button of shapeRoot?.querySelectorAll("[data-model]") || []) {
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
  if (state.render === "npr") parts.push(`NPR ${nprPresets[state.nprPreset].name}`);
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
    button.textContent = env.name;
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

function createPbrCategoryTabs(entries) {
  const tabs = document.createElement("div");
  tabs.className = "pbr-category-tabs";
  const categories = [{ id: "all", label: "全部" }, ...pbrCategories];
  for (const category of categories) {
    const count =
      category.id === "all"
        ? entries.length
        : entries.filter(([, preset]) => preset.category === category.id).length;
    if (!count) continue;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "category-chip";
    button.classList.toggle("active", state.pbrCategory === category.id);
    button.textContent = `${category.label} ${count}`;
    button.addEventListener("click", () => {
      state.pbrCategory = category.id;
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
    presetRoot.append(createPbrCategoryTabs(entries));
    for (const category of pbrCategories) {
      if (state.pbrCategory !== "all" && state.pbrCategory !== category.id) continue;
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
    const categories = [
      { kind: "surface", label: "Surface · PBR" },
      { kind: "vfx", label: "VFX · 自发光特效" },
    ];
    for (const category of categories) {
      const categoryEntries = entries.filter(
        ([, preset]) => (shaders[preset.shader]?.kind || "vfx") === category.kind
      );
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
    parameterTitle.textContent = state.render === "npr" ? `NPR 光照 · ${material}` : material;
  }
  for (const group of slidersForMode()) {
    let currentSection = "";
    if (state.render === "npr" && group.id !== "npr") {
      const divider = document.createElement("div");
      divider.className = "slider-divider";
      divider.textContent = "材质";
      sliderRoot.append(divider);
    }
    for (const def of group.items) {
      if (def.section && def.section !== currentSection) {
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

function applyPrompt(text) {
  const result = interpretPrompt(text, { ...state, nprValues: npr.values });
  logEl.textContent = result.message;
  if (!result.ok) return;
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
  if (result.render && result.render !== state.render) setRender(result.render);
  else syncSliders();
  updateTitle();
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

randomButton?.addEventListener("click", randomVariant);

scopeRoot?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-scope]");
  if (!button) return;
  setScope(button.dataset.scope);
  logEl.textContent = state.scope === "global" ? "NPR 与滤镜作用于整个画面" : "NPR 与滤镜只作用于展示模型";
});

shapeRoot?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-model]");
  if (!button) return;
  setDisplayModel(button.dataset.model);
  logEl.textContent = `展示模型：${displayModels[button.dataset.model].label}`;
});

renderModeRoot?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-render]");
  if (!button) return;
  setRender(button.dataset.render);
  logEl.textContent = state.render === "npr" ? `切到 NPR · ${nprPresets[state.nprPreset].name}` : "切回 PBR 写实渲染";
});

styleAmountInput?.addEventListener("input", () => {
  const value = Number(styleAmountInput.value);
  stylizer.setAmount(value);
  styleAmountValue.textContent = `${Math.round(value * 100)}%`;
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

function drawChannel(material, target) {
  surfaceMesh.material = material;
  renderer.setRenderTarget(target);
  renderer.render(surfaceScene, surfaceCamera);
}

function tick() {
  const elapsed = clock.getElapsedTime();
  shaderUniforms.uTime.value = elapsed;
  display.rotation.y = elapsed * 0.18;
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

renderEnvironments();
renderStyles();
renderChannels();
renderNprPresets();
renderDisplayModels();
setStyle(defaultStyle);
setNprPreset(defaultNprPreset, false);
setRender("pbr");
setPreset("lookdev", presets.lookdev);
setEnvironment(defaultEnvironment);
setDisplayModel(defaultDisplayModel);
syncViewport(true);
tick();

import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RGBELoader } from "three/addons/loaders/RGBELoader.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import {
  vertexShader,
  shaders,
  presets,
  pbrCategories,
  sliderGroups,
  channelShaders,
} from "./shaders.js";
import { interpretPrompt, hintPrompts } from "./nl.js";
import { environments, defaultEnvironment } from "./environments.js";

const canvas = document.getElementById("stage");
const presetRoot = document.getElementById("presets");
const presetTitle = document.getElementById("preset-title");
const envRoot = document.getElementById("environments");
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
scene.backgroundBlurriness = 0.18;
scene.backgroundIntensity = 0.55;

const camera = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 0.1, 50);
camera.position.set(2.4, 1.85, 4.2);

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.minDistance = 2.4;
controls.maxDistance = 12;
controls.maxPolarAngle = Math.PI * 0.49;
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

const floorMat = new THREE.MeshStandardMaterial({
  color: 0x171b22,
  roughness: 0.78,
  metalness: 0.12,
  envMapIntensity: 0.55,
});
const floor = new THREE.Mesh(new THREE.CircleGeometry(9, 80), floorMat);
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);

const wallMat = new THREE.MeshStandardMaterial({
  color: 0x1c222c,
  roughness: 0.92,
  metalness: 0.04,
  envMapIntensity: 0.2,
  side: THREE.BackSide,
});
const cyclorama = new THREE.Mesh(new THREE.CylinderGeometry(7.2, 7.2, 5.4, 48, 1, true), wallMat);
cyclorama.position.y = 2.5;
scene.add(cyclorama);

const softboxMat = new THREE.MeshStandardMaterial({
  color: 0xf4f1ea,
  emissive: new THREE.Color(0xf4f1ea),
  emissiveIntensity: 1.4,
  roughness: 0.4,
  metalness: 0,
});
const keyCard = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.2), softboxMat);
keyCard.position.set(3.1, 3.4, 1.4);
keyCard.lookAt(0, 1.4, 0);
scene.add(keyCard);

const fillCard = new THREE.Mesh(
  new THREE.PlaneGeometry(1.2, 1.6),
  new THREE.MeshStandardMaterial({
    color: 0xb9d4ff,
    emissive: new THREE.Color(0x7aa7ff),
    emissiveIntensity: 0.9,
    roughness: 0.5,
    metalness: 0,
  })
);
fillCard.position.set(-3.0, 2.2, -0.6);
fillCard.lookAt(0, 1.2, 0);
scene.add(fillCard);

const studioSet = [cyclorama, keyCard, fillCard];

const pedestalMat = new THREE.MeshStandardMaterial({
  color: 0x2a313c,
  roughness: 0.38,
  metalness: 0.62,
  envMapIntensity: 0.9,
});
const plinth = new THREE.Mesh(new THREE.CylinderGeometry(0.78, 0.86, 0.18, 64), pedestalMat);
plinth.position.y = 0.09;
plinth.castShadow = true;
plinth.receiveShadow = true;
scene.add(plinth);

const column = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.5, 0.62, 48), pedestalMat.clone());
column.position.y = 0.49;
column.castShadow = true;
column.receiveShadow = true;
scene.add(column);

const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.56, 0.5, 0.08, 64), pedestalMat.clone());
cap.position.y = 0.84;
cap.castShadow = true;
cap.receiveShadow = true;
scene.add(cap);

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

const surfaceScene = new THREE.Scene();
const surfaceCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const surfaceMesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), albedoMaterial);
surfaceScene.add(surfaceMesh);

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

const cubeGeometry = new THREE.BoxGeometry(0.92, 0.92, 0.92, 1, 1, 1);
cubeGeometry.setAttribute("uv2", cubeGeometry.attributes.uv.clone());
cubeGeometry.computeTangents();

const cubeMaterial = new THREE.MeshPhysicalMaterial({
  map: albedoTarget.texture,
  roughnessMap: ormTarget.texture,
  metalnessMap: ormTarget.texture,
  aoMap: ormTarget.texture,
  aoMapIntensity: 1,
  normalMap: normalTarget.texture,
  normalScale: new THREE.Vector2(0, 0),
  emissiveMap: albedoTarget.texture,
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

const sphereGeometry = new THREE.SphereGeometry(0.56, 64, 48);
sphereGeometry.setAttribute("uv2", sphereGeometry.attributes.uv.clone());
sphereGeometry.computeTangents();

const subject = new THREE.Mesh(cubeGeometry, cubeMaterial);
subject.position.y = 1.44;
subject.castShadow = true;
scene.add(subject);

const state = {
  mode: "pbr",
  pbrCategory: "all",
  preset: "lookdev",
  shader: "lookdev",
  environment: defaultEnvironment,
  params: { ...presets.lookdev },
};

function presetFamily(preset) {
  return preset?.family || "pbr";
}

function presetsForMode(mode = state.mode) {
  return Object.entries(presets).filter(([, preset]) => presetFamily(preset) === mode);
}

function slidersForMode(mode = state.mode) {
  return sliderGroups.filter((group) => group.id === mode);
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

async function setEnvironment(id) {
  const env = environments[id] || environments[defaultEnvironment];
  state.environment = env.id;
  scene.background = new THREE.Color(env.background);
  scene.backgroundBlurriness = env.backgroundBlurriness;
  scene.backgroundIntensity = env.backgroundIntensity;
  renderer.toneMappingExposure = env.exposure;
  floorMat.color.setHex(env.floor);
  wallMat.color.setHex(env.wall);
  pedestalMat.color.setHex(env.metal);
  column.material.color.setHex(env.metal);
  cap.material.color.setHex(env.metal);
  applyLight(keyLight, env.key);
  applyLight(fillLight, env.fill);
  applyLight(rimLight, env.rim);
  hemi.intensity = env.hemi;
  for (const mesh of studioSet) mesh.visible = env.showStudio;
  applyEnvironmentRotation(env.rotation);
  highlightEnvironment();
  try {
    const envMap = await loadEnvironmentMap(env.hdr);
    if (state.environment !== env.id) return;
    scene.environment = envMap;
    scene.background = envMap;
    applyEnvironmentRotation(env.rotation);
    setCompileState(true, "ready");
  } catch (error) {
    console.warn("HDR environment failed", error);
    scene.environment = roomEnv;
    scene.background = new THREE.Color(env.background);
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
  ormMaterial.fragmentShader = lookdevMaps ? channelShaders.orm : channelShaders.ormFlat;
  normalMaterial.fragmentShader =
    lookdevMaps || state.params.uNormal <= 0.001 ? channelShaders.normalFlat : channelShaders.normal;
  ormMaterial.needsUpdate = true;
  normalMaterial.needsUpdate = true;
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
  cubeMaterial.emissiveMap = mapped ? albedoTarget.texture : null;
  if (mapped) cubeMaterial.color.setRGB(1, 1, 1);
  else cubeMaterial.color.setRGB(...params.uColorB);
  cubeMaterial.opacity = 1;
  cubeMaterial.transparent = params.uTransmission > 0.001;
  cubeMaterial.needsUpdate = true;
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
  nameEl.textContent = params.name || shader.name;
  subject.geometry = params.shape === "sphere" ? sphereGeometry : cubeGeometry;
  applyParams({ ...params, shader: shaderId });
  highlightMode();
  renderPresets();
  renderSliders();
  syncSliders();
  renderHints();
  highlightPreset();
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
      input.value = String(state.params[def.key]);
      value.textContent = Number(state.params[def.key]).toFixed(2);
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
    button.className = "chip";
    button.textContent = label;
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
    presetRoot.className = "chips";
    for (const [id, preset] of entries) presetRoot.append(createPresetButton(id, preset));
  }
}

function renderSliders() {
  sliderRoot.innerHTML = "";
  if (parameterTitle) parameterTitle.textContent = state.mode === "pbr" ? "PBR 参数" : "Shader 参数";
  for (const group of slidersForMode()) {
    let currentSection = "";
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
  const result = interpretPrompt(text, state);
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
}

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
  camera.clearViewOffset();
  camera.aspect = aspect;
  camera.fov = aspect < 0.72 ? 46 : 38;
  camera.updateProjectionMatrix();

  const bounds = new THREE.Box3(
    new THREE.Vector3(-0.86, 0, -0.86),
    new THREE.Vector3(0.86, 2.02, 0.86)
  );
  const size = bounds.getSize(new THREE.Vector3());
  const center = bounds.getCenter(new THREE.Vector3());
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
  subject.rotation.y = elapsed * 0.18;
  subject.rotation.x = Math.sin(elapsed * 0.11) * 0.08;
  controls.update();
  drawChannel(albedoMaterial, albedoTarget);
  drawChannel(ormMaterial, ormTarget);
  drawChannel(normalMaterial, normalTarget);
  renderer.setRenderTarget(null);
  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}

document.getElementById("mode-tabs")?.addEventListener("click", (event) => {
  const button = event.target.closest(".mode-tab");
  if (!button) return;
  setMode(button.dataset.mode);
});

renderEnvironments();
setPreset("lookdev", presets.lookdev);
setEnvironment(defaultEnvironment);
syncViewport(true);
tick();

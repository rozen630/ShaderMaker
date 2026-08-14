import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RGBELoader } from "three/addons/loaders/RGBELoader.js";
import { vertexShader, shaders, presets, sliderDefs } from "./shaders.js";
import { interpretPrompt, hintPrompts } from "./nl.js";
import { environments, defaultEnvironment } from "./environments.js";

const canvas = document.getElementById("stage");
const presetRoot = document.getElementById("presets");
const envRoot = document.getElementById("environments");
const sliderRoot = document.getElementById("sliders");
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
scene.fog = new THREE.Fog(0x141820, 10, 24);
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

const hemi = new THREE.HemisphereLight(0xdde7ff, 0x1a1512, 0.45);
scene.add(hemi);

const keyLight = new THREE.DirectionalLight(0xfff3e2, 1.4);
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

const fillLight = new THREE.DirectionalLight(0xa9c8ff, 0.38);
fillLight.position.set(-3.6, 2.0, -1.8);
scene.add(fillLight);

const rimLight = new THREE.PointLight(0x8ee7c5, 5.5, 10, 2);
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
const plinth = new THREE.Mesh(
  new THREE.CylinderGeometry(0.78, 0.86, 0.18, 64),
  pedestalMat
);
plinth.position.y = 0.09;
plinth.castShadow = true;
plinth.receiveShadow = true;
scene.add(plinth);

const column = new THREE.Mesh(
  new THREE.CylinderGeometry(0.42, 0.5, 0.62, 48),
  pedestalMat.clone()
);
column.position.y = 0.49;
column.castShadow = true;
column.receiveShadow = true;
scene.add(column);

const cap = new THREE.Mesh(
  new THREE.CylinderGeometry(0.56, 0.5, 0.08, 64),
  pedestalMat.clone()
);
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
  uSpeed: { value: 0.55 },
  uScale: { value: 2.2 },
  uIntensity: { value: 1.05 },
  uContrast: { value: 1.15 },
  uWarp: { value: 1.15 },
  uGlow: { value: 0.85 },
  uSeed: { value: 11 },
};

const surfaceMaterial = new THREE.ShaderMaterial({
  uniforms: shaderUniforms,
  vertexShader,
  fragmentShader: shaders.lookdev.fragment,
  depthTest: false,
  depthWrite: false,
});

const surfaceScene = new THREE.Scene();
const surfaceCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
surfaceScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), surfaceMaterial));

const surfaceTarget = new THREE.WebGLRenderTarget(1024, 1024, {
  type: THREE.HalfFloatType,
  colorSpace: THREE.SRGBColorSpace,
});
surfaceTarget.texture.generateMipmaps = true;
surfaceTarget.texture.minFilter = THREE.LinearMipmapLinearFilter;
surfaceTarget.texture.magFilter = THREE.LinearFilter;
surfaceTarget.texture.wrapS = THREE.RepeatWrapping;
surfaceTarget.texture.wrapT = THREE.RepeatWrapping;

const cubeMaterial = new THREE.MeshPhysicalMaterial({
  map: surfaceTarget.texture,
  emissiveMap: surfaceTarget.texture,
  emissive: new THREE.Color(0xffffff),
  emissiveIntensity: 0.35,
  metalness: 0.08,
  roughness: 0.42,
  envMapIntensity: 1.05,
  clearcoat: 0.18,
  clearcoatRoughness: 0.35,
});

const cube = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.92, 0.92, 1, 1, 1), cubeMaterial);
cube.position.y = 1.44;
cube.castShadow = true;
scene.add(cube);

const state = {
  shader: "aurora",
  environment: defaultEnvironment,
  params: { ...presets.aurora },
};

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

async function setEnvironment(id) {
  const env = environments[id] || environments[defaultEnvironment];
  state.environment = env.id;
  scene.fog.color.setHex(env.fog);
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
  for (const mesh of studioSet) mesh.visible = env.showStudio;
  highlightEnvironment();
  try {
    const envMap = await loadEnvironmentMap(env.hdr);
    if (state.environment !== env.id) return;
    scene.environment = envMap;
    scene.background = envMap;
  } catch (error) {
    console.warn("HDR environment failed", error);
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
  cubeMaterial.metalness = params.uMetalness;
  cubeMaterial.roughness = params.uRoughness;
  cubeMaterial.envMapIntensity = params.uEnv;
  cubeMaterial.emissiveIntensity = params.uEmissive;
  cubeMaterial.needsUpdate = true;
  syncSliders();
}

function setShader(id, params = presets[id] || state.params) {
  const shader = shaders[id];
  if (!shader) return;
  state.shader = id;
  surfaceMaterial.fragmentShader = shader.fragment;
  surfaceMaterial.needsUpdate = true;
  nameEl.textContent = shader.name;
  applyParams({ ...params, shader: id });
  highlightPreset();
  setCompileState(true, "ready");
}

function highlightPreset() {
  for (const button of presetRoot.querySelectorAll(".chip")) {
    button.classList.toggle("active", button.dataset.id === state.shader);
  }
}

function syncSliders() {
  for (const def of sliderDefs) {
    const input = sliderRoot.querySelector(`input[data-key="${def.key}"]`);
    const value = sliderRoot.querySelector(`span[data-key="${def.key}"]`);
    if (!input || !value) continue;
    input.value = String(state.params[def.key]);
    value.textContent = Number(state.params[def.key]).toFixed(2);
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

function renderPresets() {
  presetRoot.innerHTML = "";
  for (const [id, preset] of Object.entries(presets)) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "chip";
    button.dataset.id = id;
    button.textContent = shaders[preset.shader].name;
    button.addEventListener("click", () => {
      setShader(id, preset);
      logEl.textContent = `已切换到 ${shaders[preset.shader].name}`;
    });
    presetRoot.append(button);
  }
}

function renderSliders() {
  sliderRoot.innerHTML = "";
  for (const def of sliderDefs) {
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
      if (def.key === "uMetalness") cubeMaterial.metalness = state.params.uMetalness;
      if (def.key === "uRoughness") cubeMaterial.roughness = state.params.uRoughness;
      if (def.key === "uEnv") cubeMaterial.envMapIntensity = state.params.uEnv;
      if (def.key === "uEmissive") cubeMaterial.emissiveIntensity = state.params.uEmissive;
      syncSliders();
    });
    sliderRoot.append(wrap);
  }
}

function renderHints() {
  hintRoot.innerHTML = "";
  for (const text of hintPrompts) {
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
  if (result.shader !== state.shader) {
    setShader(result.shader, result.params);
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

  const subject = new THREE.Box3(
    new THREE.Vector3(-0.86, 0, -0.86),
    new THREE.Vector3(0.86, 2.02, 0.86)
  );
  const size = subject.getSize(new THREE.Vector3());
  const center = subject.getCenter(new THREE.Vector3());
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

function tick() {
  const elapsed = clock.getElapsedTime();
  shaderUniforms.uTime.value = elapsed;
  cube.rotation.y = elapsed * 0.18;
  cube.rotation.x = Math.sin(elapsed * 0.11) * 0.08;
  controls.update();
  renderer.setRenderTarget(surfaceTarget);
  renderer.render(surfaceScene, surfaceCamera);
  renderer.setRenderTarget(null);
  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}

renderPresets();
renderEnvironments();
renderSliders();
renderHints();
setShader("lookdev", presets.lookdev);
setEnvironment(defaultEnvironment);
syncViewport(true);
tick();

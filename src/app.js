import * as THREE from "three";
import { vertexShader, shaders, presets, sliderDefs } from "./shaders.js";
import { interpretPrompt, hintPrompts } from "./nl.js";

const canvas = document.getElementById("stage");
const presetRoot = document.getElementById("presets");
const sliderRoot = document.getElementById("sliders");
const hintRoot = document.getElementById("hints");
const form = document.getElementById("prompt-form");
const promptInput = document.getElementById("prompt");
const logEl = document.getElementById("nl-log");
const nameEl = document.getElementById("shader-name");
const stateEl = document.getElementById("compile-state");

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: false,
  powerPreference: "high-performance",
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight, false);
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

const uniforms = {
  uTime: { value: 0 },
  uResolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
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

const material = new THREE.ShaderMaterial({
  uniforms,
  vertexShader,
  fragmentShader: shaders.aurora.fragment,
  depthTest: false,
  depthWrite: false,
});

const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
scene.add(mesh);

const state = {
  shader: "aurora",
  params: { ...presets.aurora },
};

function setCompileState(ok, text) {
  stateEl.textContent = text;
  stateEl.className = ok ? "ok" : "err";
}

function applyParams(params) {
  state.params = { ...params };
  uniforms.uColorA.value.setRGB(...params.uColorA);
  uniforms.uColorB.value.setRGB(...params.uColorB);
  uniforms.uAccent.value.setRGB(...params.uAccent);
  uniforms.uSpeed.value = params.uSpeed;
  uniforms.uScale.value = params.uScale;
  uniforms.uIntensity.value = params.uIntensity;
  uniforms.uContrast.value = params.uContrast;
  uniforms.uWarp.value = params.uWarp;
  uniforms.uGlow.value = params.uGlow;
  uniforms.uSeed.value = params.uSeed;
  syncSliders();
}

function setShader(id, params = presets[id] || state.params) {
  const shader = shaders[id];
  if (!shader) return;
  state.shader = id;
  material.fragmentShader = shader.fragment;
  material.needsUpdate = true;
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
      uniforms[def.key].value = state.params[def.key];
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
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  applyPrompt(promptInput.value);
});

window.addEventListener("resize", () => {
  const width = window.innerWidth;
  const height = window.innerHeight;
  renderer.setSize(width, height, false);
  uniforms.uResolution.value.set(
    width * renderer.getPixelRatio(),
    height * renderer.getPixelRatio()
  );
});

const clock = new THREE.Clock();

function tick() {
  uniforms.uTime.value = clock.getElapsedTime();
  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}

renderPresets();
renderSliders();
renderHints();
setShader("aurora", presets.aurora);
uniforms.uResolution.value.set(
  window.innerWidth * renderer.getPixelRatio(),
  window.innerHeight * renderer.getPixelRatio()
);
tick();

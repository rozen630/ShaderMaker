// 可编程效果（基础能力）：用数据 + GLSL 片段描述一个效果，套在当前展示模型上，不写死任何具体功能。
// 一个效果由四种可选的部分组成，都能读同一组「输入」（时间、点击、指针、模型尺寸）和效果自己声明的参数：
// - overlay：在模型表面逐像素执行（展示空间位置 / 法线），改底色、加自发光——扩散换色、扫描线、溶解遮罩……
// - deform：在模型顶点上执行，返回新位置——涟漪、膨胀、波浪；法线、描边、阴影、滤镜自动跟上；
// - instances：在模型表面散布一批实例（预制几何），每个实例的位置 / 旋转 / 大小 / 颜色在顶点着色器里算——鳞片、羽毛、草、尖刺；
// - common：上面几部分共用的辅助函数。
// 参数（params）会自动生成面板滑条 / 取色器，也能用 set_look 调。效果代码按标记注入到所有相关材质里
// （主体 PBR / 卡通、描边外壳、阴影、滤镜的遮罩和法线深度、通道查看），改了效果就让这些材质重新编译。
import * as THREE from "three";
import { MeshSurfaceSampler } from "three/addons/math/MeshSurfaceSampler.js";

export const MAX_INSTANCES = 60000;
export const MAX_PARAMS = 16;

// ---- 输入：每帧由 app.js 更新 ----

export const effectInputs = {
  uTime: { value: 0 },
  uClickPos: { value: new THREE.Vector3() },
  uClickAge: { value: 1e4 },
  uClickCount: { value: 0 },
  uPrevClickPos: { value: new THREE.Vector3() },
  uPrevClickAge: { value: 1e4 },
  uPointerPos: { value: new THREE.Vector3() },
  uPointerOn: { value: 0 },
  uModelCenter: { value: new THREE.Vector3(0, 0.75, 0) },
  uModelSize: { value: 1.5 },
};

const INPUT_DECL = /* glsl */ `
uniform float uTime;
uniform vec3 uClickPos;
uniform float uClickAge;
uniform float uClickCount;
uniform vec3 uPrevClickPos;
uniform float uPrevClickAge;
uniform vec3 uPointerPos;
uniform float uPointerOn;
uniform vec3 uModelCenter;
uniform float uModelSize;
`;

const HELPERS = /* glsl */ `
float effectHash(float x) { return fract(sin(x * 127.1) * 43758.5453); }
float effectHash(vec2 x) { return fract(sin(dot(x, vec2(127.1, 311.7))) * 43758.5453); }
float effectHash(vec3 x) { return fract(sin(dot(x, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
// 绕任意轴旋转（axis 需归一化）
vec3 rotateAxis(vec3 v, vec3 axis, float angle) {
  return v * cos(angle) + cross(axis, v) * sin(angle) + axis * dot(axis, v) * (1.0 - cos(angle));
}
// 表面局部坐标系：列 0 = 侧向，列 1 = 沿 flow 投影到切平面的方向，列 2 = 法线
mat3 surfaceFrame(vec3 normal, vec3 flow) {
  vec3 n = normalize(normal);
  vec3 f = flow - n * dot(flow, n);
  if (dot(f, f) < 1e-6) f = abs(n.y) < 0.9 ? cross(n, vec3(0.0, 1.0, 0.0)) : cross(n, vec3(1.0, 0.0, 0.0));
  vec3 along = normalize(f);
  return mat3(normalize(cross(along, n)), along, n);
}
`;

// 给 AI 看的写法说明（read_effect 不传 id 时返回）
export const effectGuide = `ShaderMaker 效果写法（GLSL ES 3.0 / WebGL2）。效果套在当前展示模型上，所有坐标都在「展示空间」：模型高约 1.5、底部在 y = 0，单位和 uModelSize 一致。

一个效果 = 参数 + 下面任选几个部分（都可省略）：
1. common：辅助函数，下面几部分都能调用。
2. overlay（表面，逐像素）：
   vec3 overlay(vec3 pos, vec3 normal, vec3 color)  // 返回新的底色（线性 0–1），pos / normal 是展示空间
   vec3 overlayEmissive(vec3 pos, vec3 normal)      // 可选，返回加到表面上的自发光
3. deform（主体顶点）：
   vec3 deform(vec3 pos, vec3 normal)               // 返回新位置；法线按形变自动重算，描边 / 阴影 / 滤镜自动跟上
   展示模型做过均匀细分（边长约 0.02），小于这个尺度的起伏做不出来。
4. instances（实例）：在模型表面按面积散布 count 个实例，每个画一份 geometry：
   vec3 instanceVertex(vec3 p, inout vec3 n, inout vec3 color)  // p / n：几何的局部坐标 / 法线；返回展示空间位置，n 改成展示空间法线，color 设颜色
   vec3 instanceFragment(vec3 color, vec3 local)                 // 可选，逐像素改颜色（local 是插值后的局部坐标 p）
   每个实例可读：iRoot（表面上的点）、iNormal（表面法线）、iUv（表面 UV）、iRand（vec4，四个 0–1 随机数）。
   几何约定：根部在原点，+Z 朝外（离开表面），+Y 是长度方向，+X 是侧向。可用 surfaceFrame(iNormal, flow) 得到 mat3(侧向, 沿 flow, 法线)，
   位置 = iRoot + frame * (p * 大小)，n = normalize(frame * n)。大小为 0 的实例不可见。
   geometry.type：blade（羽片 width / length / cup / bend）、quad（width / height）、box（width / depth / height）、cone（radius / height / segments）、
   sphere（radius / segments）、custom（positions: [x,y,z,…]，indices 可选，最多 30000 个顶点）。
   material：metalness、roughness、specular、clearcoat、iridescence、emissive（颜色 × 强度发光）、envMap（环境反射强度）、doubleSided。
   斜着看的薄片镜面反射一强就整片发白，彩色鳞片建议 specular 0.3 左右、metalness ≤ 0.2。

输入 uniform（全部 float / vec3）：
- uTime：秒。
- uClickPos / uClickAge / uClickCount：最近一次点击模型的位置、距今秒数（没点过为 10000）、累计次数。用户点模型或调用 set_look effect.trigger 时更新。
- uPrevClickPos / uPrevClickAge：上一次点击（做「每次点击交替换色」用）。
- uPointerPos / uPointerOn：鼠标指着的表面点，uPointerOn = 1 表示正指着模型。
- uModelCenter / uModelSize：模型包围盒中心和对角线长度。
自定义参数：params 里每项 { key: "uXxx", label, min, max, default }（float），或 { key, label, type: "color", default: "#rrggbb" }（vec3；#rrggbb 按 sRGB 填，着色器里拿到的是线性值），代码里直接当 uniform 用；lite: true 的在 Lite 面板显示。key 以 u + 大写字母开头。
辅助函数：effectHash(float / vec2 / vec3) → 0–1；rotateAxis(v, axis, angle)；surfaceFrame(normal, flow) → mat3。

规则：不要声明 uniform / attribute / varying / precision；循环要有常量上限；函数名不要和上面重复。
想看完整例子：read_effect 传 scaleBloom（实例 + 表面换色）、ripple（形变 + 自发光）、hoverHalo（指针）。`;

// ---- 当前效果 ----

let active = null;
let paramUniforms = {};
let version = 0;
const listeners = new Set();
// 需要随效果重新编译的材质：kind = subject（主体）、vertex（只有顶点外推的覆盖材质）、instance（实例自己的材质）
const registry = new Map();

export function effectVersion() {
  return version;
}

export function activeEffect() {
  return active;
}

export function registerEffectMaterial(material, kind) {
  if (!registry.has(material)) material.addEventListener("dispose", () => registry.delete(material));
  registry.set(material, kind);
}

export function onEffectChange(listener) {
  listeners.add(listener);
}

// #rrggbb 按 sRGB（和取色器、网页颜色一致），着色器里拿到的是线性值
function colorUniform(hex) {
  const value = /^#?([0-9a-f]{6})$/i.exec(String(hex || "").trim());
  return new THREE.Color(1, 1, 1).setHex(value ? parseInt(value[1], 16) : 0xffffff);
}

// 切换当前效果（null = 关闭）；values：参数的当前值（不传用默认值）
export function setActiveEffect(record, values = {}) {
  active = record;
  paramUniforms = {};
  for (const def of record?.params || []) {
    const value = values[def.key] ?? def.default;
    paramUniforms[def.key] = { value: def.type === "color" ? colorUniform(value) : Number(value) };
  }
  version += 1;
  for (const material of registry.keys()) material.needsUpdate = true;
  for (const listener of listeners) listener(record);
}

export function effectParamValue(key) {
  const uniform = paramUniforms[key];
  if (!uniform) return undefined;
  return uniform.value.isColor ? `#${uniform.value.getHexString()}` : uniform.value;
}

export function setEffectParam(key, value) {
  const def = active?.params?.find((item) => item.key === key);
  if (!def || !paramUniforms[key]) return false;
  if (def.type === "color") paramUniforms[key].value.copy(colorUniform(value));
  else paramUniforms[key].value = THREE.MathUtils.clamp(Number(value), def.min, def.max);
  return true;
}

// ---- GLSL 组装 ----

const marker = (section) => `// @effect-code:${section}`;

function paramDecl() {
  return (active?.params || []).map((def) => `uniform ${def.type === "color" ? "vec3" : "float"} ${def.key};`).join("\n");
}

function has(code, name) {
  return new RegExp(`\\b${name}\\s*\\(`).test(code || "");
}

// 输入、参数、辅助函数、common：所有注入点共用，用宏防止同一个着色器里重复声明
function sharedHead() {
  return `
#ifndef EFFECT_SHARED
#define EFFECT_SHARED
${INPUT_DECL}
${paramDecl()}
${HELPERS}
${marker("common")}
${active?.common || ""}
#endif
`;
}

function deformHead() {
  const code = active?.deform || "";
  return has(code, "deform") ? `#define EFFECT_DEFORM\n${marker("deform")}\n${code}\n` : "";
}

function overlayHead() {
  const code = active?.overlay || "";
  let out = `${marker("overlay")}\n${code}\n`;
  if (has(code, "overlay")) out = `#define EFFECT_OVERLAY\n${out}`;
  if (has(code, "overlayEmissive")) out = `#define EFFECT_EMISSIVE\n${out}`;
  return out;
}

const deformBody = /* glsl */ `
#ifdef EFFECT_DEFORM
#ifndef USE_INSTANCING
if (dot(outlineNormal, outlineNormal) > 0.5) {
  mat4 effectModel = uTriDisplayInverse * modelMatrix;
  vec3 effectPos = (effectModel * vec4(transformed, 1.0)).xyz;
  vec3 effectN = normalize(mat3(effectModel) * outlineNormal);
  transformed += inverse(mat3(effectModel)) * (deform(effectPos, effectN) - effectPos);
}
#endif
#endif
`;

// 主体：按形变重算法线（在切平面上取两个邻点，形变后叉乘）
const deformNormal = /* glsl */ `
#include <beginnormal_vertex>
#ifdef EFFECT_DEFORM
#ifndef USE_INSTANCING
if (dot(outlineNormal, outlineNormal) > 0.5) {
  mat4 effectModel = uTriDisplayInverse * modelMatrix;
  vec3 effectPos = (effectModel * vec4(position, 1.0)).xyz;
  vec3 effectN = normalize(mat3(effectModel) * objectNormal);
  vec3 effectT = normalize(abs(effectN.y) < 0.9 ? cross(effectN, vec3(0.0, 1.0, 0.0)) : cross(effectN, vec3(1.0, 0.0, 0.0)));
  vec3 effectB = cross(effectN, effectT);
  float effectStep = uModelSize * 0.002;
  vec3 effectP0 = deform(effectPos, effectN);
  vec3 effectP1 = deform(effectPos + effectT * effectStep, effectN);
  vec3 effectP2 = deform(effectPos + effectB * effectStep, effectN);
  vec3 effectNew = cross(effectP1 - effectP0, effectP2 - effectP0);
  if (dot(effectNew, effectNew) > 1e-12) {
    effectNew = normalize(effectNew);
    if (dot(effectNew, effectN) < 0.0) effectNew = -effectNew;
    objectNormal = normalize(transpose(mat3(effectModel)) * effectNew);
  }
}
#endif
#endif
`;

const overlayBody = /* glsl */ `
#ifdef EFFECT_OVERLAY
{
  vec3 effectPos = vTriInstanced > 0.5 ? vFxVoxelCenter : vTriPos;
  diffuseColor.rgb = overlay(effectPos, normalize(vTriNormal), diffuseColor.rgb);
}
#endif
`;

const emissiveBody = /* glsl */ `
#ifdef EFFECT_EMISSIVE
{
  vec3 effectPos = vTriInstanced > 0.5 ? vFxVoxelCenter : vTriPos;
  totalEmissiveRadiance += overlayEmissive(effectPos, normalize(vTriNormal));
}
#endif
`;

function applyUniforms(shader) {
  Object.assign(shader.uniforms, effectInputs, paramUniforms);
}

// materialFx.js 在它的着色器里留了标记，这里把当前效果填进去。subject：主体材质（还有片元部分和法线重算）
export function injectEffect(shader, { subject = false } = {}) {
  applyUniforms(shader);
  shader.vertexShader = shader.vertexShader
    .replace("// @effect-vertex-head", sharedHead() + deformHead())
    .replace("// @effect-deform", deformBody);
  if (subject) {
    shader.vertexShader = shader.vertexShader.replace("#include <beginnormal_vertex>", deformNormal);
    shader.fragmentShader = shader.fragmentShader
      .replace("// @effect-fragment-head", sharedHead() + overlayHead())
      .replace("// @effect-overlay", overlayBody)
      .replace("// @effect-emissive", emissiveBody);
  }
}

// ---- 实例 ----

const instanceHead = () => {
  const code = active?.instances?.vertex || "";
  const fragment = active?.instances?.fragment || "";
  return `
#ifndef EFFECT_INSTANCE
#define EFFECT_INSTANCE
attribute vec3 iRoot;
attribute vec3 iNormal;
attribute vec2 iUv;
attribute vec4 iRand;
attribute float iMarker;
varying vec3 vEffectColor;
varying vec3 vEffectLocal;
${has(code, "instanceVertex") ? `#define EFFECT_INSTANCES\n${marker("instances.vertex")}\n${code}` : ""}
${has(fragment, "instanceFragment") ? "#define EFFECT_INSTANCE_FRAGMENT" : ""}
#endif
`;
};

// 只有实例几何带 iMarker = 1；同一个覆盖材质画别的物体时读到 0，不受影响
const instancePositionBody = /* glsl */ `
#ifdef EFFECT_INSTANCES
if (iMarker > 0.5) {
  vec3 effectNormal = normal;
  vec3 effectColor = vec3(1.0);
  transformed = instanceVertex(position, effectNormal, effectColor);
}
#endif
`;

// 实例自己的材质：位置、法线、颜色
function patchInstanceShader(shader) {
  applyUniforms(shader);
  shader.vertexShader = shader.vertexShader
    .replace("void main() {", `${sharedHead()}${instanceHead()}\nvoid main() {`)
    .replace(
      "#include <beginnormal_vertex>",
      `#include <beginnormal_vertex>
#ifdef EFFECT_INSTANCES
{
  vec3 effectColor = vec3(1.0);
  instanceVertex(position, objectNormal, effectColor);
  objectNormal = normalize(objectNormal);
}
#endif`
    )
    .replace(
      "#include <begin_vertex>",
      `vec3 transformed = vec3(position);
vEffectLocal = position;
vEffectColor = vec3(1.0);
#ifdef EFFECT_INSTANCES
{
  vec3 effectNormal = normal;
  transformed = instanceVertex(position, effectNormal, vEffectColor);
}
#endif`
    );
  const fragment = active?.instances?.fragment || "";
  shader.fragmentShader = shader.fragmentShader
    .replace(
      "void main() {",
      `${sharedHead()}
varying vec3 vEffectColor;
varying vec3 vEffectLocal;
uniform float uInstanceEmissive;
${has(fragment, "instanceFragment") ? `#define EFFECT_INSTANCE_FRAGMENT\n${marker("instances.fragment")}\n${fragment}` : ""}
void main() {`
    )
    .replace(
      "#include <color_fragment>",
      `#include <color_fragment>
diffuseColor.rgb = vEffectColor;
#ifdef EFFECT_INSTANCE_FRAGMENT
diffuseColor.rgb = instanceFragment(diffuseColor.rgb, vEffectLocal);
#endif`
    )
    .replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * uInstanceEmissive;");
}

// 滤镜遮罩 / 法线深度这类覆盖材质：也按实例变换画实例（只改位置）
export function applyInstanceVertex(material) {
  const previous = material.onBeforeCompile;
  const previousKey = material.customProgramCacheKey;
  material.onBeforeCompile = (shader, renderer) => {
    shader.vertexShader = shader.vertexShader.replace("#include <begin_vertex>", `#include <begin_vertex>\n${instancePositionBody}`);
    previous.call(material, shader, renderer);
    applyUniforms(shader);
    shader.vertexShader = shader.vertexShader.replace("void main() {", `${sharedHead()}${instanceHead()}\nvoid main() {`);
  };
  material.customProgramCacheKey = () => `${previousKey.call(material)}-inst-${version}`;
  registerEffectMaterial(material, "vertex");
  material.needsUpdate = true;
}

function applyInstanceMaterial(material, emissive) {
  const previous = material.onBeforeCompile;
  const previousKey = material.customProgramCacheKey;
  material.onBeforeCompile = (shader, renderer) => {
    previous.call(material, shader, renderer);
    shader.uniforms.uInstanceEmissive = emissive;
    patchInstanceShader(shader);
  };
  material.customProgramCacheKey = () => `${previousKey ? previousKey.call(material) : ""}-instmat-${version}`;
  registerEffectMaterial(material, "instance");
  material.needsUpdate = true;
}

// 几何：根部在原点，+Z 朝外，+Y 长度方向
const GEOMETRY_TYPES = ["blade", "quad", "box", "cone", "sphere", "custom"];

function bladeGeometry({ width = 0.6, length = 1, cup = 0.035, bend = 0.05 } = {}) {
  const rows = 9;
  const cols = 5;
  const positions = [];
  const indices = [];
  for (let j = 0; j < rows; j += 1) {
    const y = j / (rows - 1);
    const half = (width / 2) * Math.pow(Math.sin(Math.PI * Math.min(y * 1.08, 1)), 0.75) * (1.15 - 0.45 * y) + 0.012;
    for (let i = 0; i < cols; i += 1) {
      const u = (i / (cols - 1)) * 2 - 1;
      positions.push(u * half, y * length, cup * (1 - Math.abs(u)) * Math.sin(Math.PI * y) - 0.02 * u * u + bend * y * y);
    }
  }
  for (let j = 0; j < rows - 1; j += 1) {
    for (let i = 0; i < cols - 1; i += 1) {
      const a = j * cols + i;
      indices.push(a, a + 1, a + cols, a + 1, a + cols + 1, a + cols);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  return geometry;
}

export function buildInstanceGeometry(spec = {}) {
  const n = (value, fallback, min, max) => THREE.MathUtils.clamp(Number(value ?? fallback) || fallback, min, max);
  let geometry;
  switch (spec.type) {
    case "quad":
      geometry = new THREE.PlaneGeometry(n(spec.width, 1, 0.001, 100), n(spec.height, 1, 0.001, 100));
      geometry.translate(0, n(spec.height, 1, 0.001, 100) / 2, 0);
      break;
    case "box": {
      const height = n(spec.height, 1, 0.001, 100);
      geometry = new THREE.BoxGeometry(n(spec.width, 1, 0.001, 100), n(spec.depth, 1, 0.001, 100), height);
      geometry.translate(0, 0, height / 2);
      break;
    }
    case "cone": {
      const height = n(spec.height, 1, 0.001, 100);
      geometry = new THREE.ConeGeometry(n(spec.radius, 0.2, 0.001, 100), height, Math.round(n(spec.segments, 8, 3, 32)));
      geometry.rotateX(Math.PI / 2);
      geometry.translate(0, 0, height / 2);
      break;
    }
    case "sphere": {
      const radius = n(spec.radius, 0.5, 0.001, 100);
      const segments = Math.round(n(spec.segments, 10, 3, 32));
      geometry = new THREE.SphereGeometry(radius, segments, Math.max(2, Math.round(segments * 0.75)));
      geometry.translate(0, 0, radius);
      break;
    }
    case "custom": {
      const positions = (spec.positions || []).map(Number);
      if (!positions.length || positions.length % 3 || positions.length > 90000 || positions.some((value) => !Number.isFinite(value))) {
        throw new Error("custom 几何的 positions 要是 3 的倍数个有限数字，最多 30000 个顶点");
      }
      geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
      if (spec.indices?.length) {
        const count = positions.length / 3;
        const indices = spec.indices.map(Number);
        if (indices.length % 3 || indices.some((value) => !Number.isInteger(value) || value < 0 || value >= count)) {
          throw new Error("custom 几何的 indices 要是 3 的倍数个顶点下标");
        }
        geometry.setIndex(indices);
      }
      break;
    }
    default:
      geometry = bladeGeometry(spec);
  }
  if (!geometry.index) geometry = geometry.toNonIndexed();
  geometry.deleteAttribute("uv");
  geometry.computeVertexNormals();
  return geometry;
}

// 实例层：一个 InstancedBufferGeometry + 写实 / 卡通两份材质 + 阴影深度材质
export function createInstanceLayer(npr) {
  const roots = new Float32Array(MAX_INSTANCES * 3);
  const normals = new Float32Array(MAX_INSTANCES * 3);
  const uvs = new Float32Array(MAX_INSTANCES * 2);
  const rands = new Float32Array(MAX_INSTANCES * 4);
  const markers = new Float32Array(MAX_INSTANCES).fill(1);
  const attributes = {
    iRoot: new THREE.InstancedBufferAttribute(roots, 3),
    iNormal: new THREE.InstancedBufferAttribute(normals, 3),
    iUv: new THREE.InstancedBufferAttribute(uvs, 2),
    iRand: new THREE.InstancedBufferAttribute(rands, 4),
    iMarker: new THREE.InstancedBufferAttribute(markers, 1),
  };
  let geometry = new THREE.InstancedBufferGeometry();
  const emissive = { value: 0 };

  const pbrMaterial = new THREE.MeshPhysicalMaterial({ color: 0xffffff });
  applyInstanceMaterial(pbrMaterial, emissive);
  const nprMaterial = npr.makeMaterial({ color: 0xffffff });
  applyInstanceMaterial(nprMaterial, emissive);
  const depthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  applyInstanceVertex(depthMaterial);

  const mesh = new THREE.Mesh(geometry, pbrMaterial);
  mesh.customDepthMaterial = depthMaterial;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  // 位置全在着色器里算，包围盒对不上，不做视锥剔除
  mesh.frustumCulled = false;
  mesh.visible = false;

  let sampled = 0;
  let sources = null;
  let hidden = false;
  let seed = 1;

  function random() {
    // mulberry32：同一个 seed 散布结果一样
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  // 在模型表面按面积散布 MAX_INSTANCES 个点（展示空间），打乱顺序，取前 count 个也是均匀的
  function scatter(meshes = sources?.meshes, relativeTo = sources?.relativeTo, scatterSeed = 1) {
    if (!meshes?.length) return;
    sources = { meshes, relativeTo };
    seed = Math.round(scatterSeed * 7919) || 1;
    relativeTo.updateMatrixWorld(true);
    const inverse = new THREE.Matrix4().copy(relativeTo.matrixWorld).invert();
    const entries = meshes.map((source) => {
      const sampler = new MeshSurfaceSampler(new THREE.Mesh(source.userData.voxelGeometry || source.geometry)).setRandomGenerator(random).build();
      const area = sampler.distribution ? sampler.distribution[sampler.distribution.length - 1] : 1;
      const matrix = new THREE.Matrix4().multiplyMatrices(inverse, source.matrixWorld);
      return { sampler, area, matrix, normalMatrix: new THREE.Matrix3().getNormalMatrix(matrix) };
    });
    const total = entries.reduce((sum, entry) => sum + entry.area, 0) || 1;
    const order = new Uint32Array(MAX_INSTANCES);
    for (let i = 0; i < MAX_INSTANCES; i += 1) order[i] = i;
    for (let i = MAX_INSTANCES - 1; i > 0; i -= 1) {
      const j = Math.floor(random() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    const position = new THREE.Vector3();
    const normal = new THREE.Vector3();
    const color = new THREE.Color();
    const uv = new THREE.Vector2();
    let index = 0;
    entries.forEach((entry, k) => {
      const count = k === entries.length - 1 ? MAX_INSTANCES - index : Math.round((entry.area / total) * MAX_INSTANCES);
      for (let i = 0; i < count && index < MAX_INSTANCES; i += 1, index += 1) {
        entry.sampler.sample(position, normal, color, uv);
        position.applyMatrix4(entry.matrix);
        normal.applyMatrix3(entry.normalMatrix).normalize();
        const slot = order[index];
        roots.set([position.x, position.y, position.z], slot * 3);
        normals.set([normal.x, normal.y, normal.z], slot * 3);
        uvs.set([uv.x, uv.y], slot * 2);
        rands.set([random(), random(), random(), random()], slot * 4);
      }
    });
    sampled = index;
    for (const attribute of Object.values(attributes)) attribute.needsUpdate = true;
    sync();
  }

  function sync() {
    const spec = active?.instances;
    mesh.visible = Boolean(spec?.vertex) && !hidden;
    geometry.instanceCount = spec ? Math.min(sampled, Math.round(THREE.MathUtils.clamp(Number(spec.count) || 0, 0, MAX_INSTANCES))) : 0;
  }

  // 当前效果变了：换几何、材质参数，必要时按新 seed 重新散布
  function applyEffect(record) {
    const spec = record?.instances;
    if (spec) {
      const shape = buildInstanceGeometry(spec.geometry);
      const next = new THREE.InstancedBufferGeometry();
      next.index = shape.index;
      next.setAttribute("position", shape.attributes.position);
      next.setAttribute("normal", shape.attributes.normal);
      for (const [name, attribute] of Object.entries(attributes)) next.setAttribute(name, attribute);
      geometry.dispose();
      geometry = next;
      mesh.geometry = geometry;
      const m = spec.material || {};
      const value = (key, fallback, min, max) => THREE.MathUtils.clamp(Number(m[key] ?? fallback), min, max);
      for (const material of [pbrMaterial, nprMaterial]) material.side = m.doubleSided === false ? THREE.FrontSide : THREE.DoubleSide;
      depthMaterial.side = pbrMaterial.side;
      Object.assign(pbrMaterial, {
        metalness: value("metalness", 0.1, 0, 1),
        roughness: value("roughness", 0.45, 0, 1),
        specularIntensity: value("specular", 0.35, 0, 1),
        clearcoat: value("clearcoat", 0.2, 0, 1),
        iridescence: value("iridescence", 0, 0, 1),
        envMapIntensity: value("envMap", 0.8, 0, 3),
      });
      emissive.value = value("emissive", 0, 0, 10);
      npr.applyPhysical(
        nprMaterial,
        {
          uRoughness: pbrMaterial.roughness,
          uMetalness: pbrMaterial.metalness,
          uClearcoat: pbrMaterial.clearcoat,
          uClearcoatRoughness: 0.3,
          uSheen: 0,
          uSheenColor: [1, 1, 1],
          uTransmission: 0,
          uAttenuationColor: [1, 1, 1],
          uIridescence: 0,
          uDispersion: 0,
        },
        { rimScale: 0 }
      );
      const nextSeed = Number(spec.seed ?? 1);
      if (sources && nextSeed !== mesh.userData.seed) {
        mesh.userData.seed = nextSeed;
        scatter(sources.meshes, sources.relativeTo, nextSeed);
      }
    }
    sync();
  }

  onEffectChange(applyEffect);

  return {
    mesh,
    get geometry() {
      return geometry;
    },
    scatter: (meshes, relativeTo) => scatter(meshes, relativeTo, Number(active?.instances?.seed ?? 1)),
    setHidden(value) {
      hidden = Boolean(value);
      sync();
    },
    setRender(nprOn) {
      mesh.material = nprOn ? nprMaterial : pbrMaterial;
    },
    materials: { pbrMaterial, nprMaterial, depthMaterial },
  };
}

// ---- 校验 ----

const KEY_PATTERN = /^u[A-Z][A-Za-z0-9]{0,30}$/;
const RESERVED = new Set(Object.keys(effectInputs));

// 结构校验（GLSL 由编译检查负责）；返回规范化后的记录，出错抛异常
export function normalizeEffect(input, reserved = new Set()) {
  const id = String(input.id || "").trim();
  if (!/^[a-zA-Z][a-zA-Z0-9_-]{1,39}$/.test(id)) throw new Error("id 要以英文字母开头，2–40 位字母、数字、_ 或 -");
  const params = [];
  for (const raw of input.params || []) {
    const key = String(raw.key || "");
    if (!KEY_PATTERN.test(key)) throw new Error(`参数 key「${key}」要以 u + 大写字母开头，只含字母数字`);
    if (RESERVED.has(key) || reserved.has(key)) throw new Error(`参数 key「${key}」和内置 uniform 重名，换一个`);
    if (params.some((item) => item.key === key)) throw new Error(`参数 key「${key}」重复`);
    const label = String(raw.label || key).slice(0, 16);
    if (raw.type === "color") {
      params.push({ key, label, type: "color", default: /^#?[0-9a-f]{6}$/i.test(String(raw.default)) ? `#${String(raw.default).replace("#", "")}` : "#ffffff", lite: Boolean(raw.lite) });
    } else {
      const min = Number(raw.min ?? 0);
      const max = Number(raw.max ?? 1);
      if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) throw new Error(`参数「${key}」的 min / max 不对`);
      const fallback = Number(raw.default ?? min);
      params.push({ key, label, min, max, default: THREE.MathUtils.clamp(Number.isFinite(fallback) ? fallback : min, min, max), lite: Boolean(raw.lite) });
    }
  }
  if (params.length > MAX_PARAMS) throw new Error(`参数最多 ${MAX_PARAMS} 个`);
  const text = (value, limit = 40000) => {
    const code = String(value || "");
    if (code.length > limit) throw new Error(`代码太长（每段上限 ${limit} 字符）`);
    return code;
  };
  let instances = null;
  if (input.instances) {
    const spec = input.instances;
    const type = spec.geometry?.type || "blade";
    if (!GEOMETRY_TYPES.includes(type)) throw new Error(`geometry.type 只能是 ${GEOMETRY_TYPES.join(" / ")}`);
    buildInstanceGeometry({ ...spec.geometry, type });
    instances = {
      count: THREE.MathUtils.clamp(Math.round(Number(spec.count ?? 10000)) || 0, 0, MAX_INSTANCES),
      seed: Number(spec.seed ?? 1) || 1,
      geometry: { ...spec.geometry, type },
      material: { ...(spec.material || {}) },
      vertex: text(spec.vertex),
      fragment: text(spec.fragment),
    };
    if (!has(instances.vertex, "instanceVertex")) throw new Error("instances.vertex 里要定义 vec3 instanceVertex(vec3 p, inout vec3 n, inout vec3 color)");
  }
  const record = {
    id,
    name: String(input.name || id).trim().slice(0, 40),
    description: String(input.description || "").slice(0, 400),
    params,
    common: text(input.common),
    overlay: text(input.overlay),
    deform: text(input.deform),
    instances,
  };
  if (record.overlay && !has(record.overlay, "overlay") && !has(record.overlay, "overlayEmissive")) {
    throw new Error("overlay 里要定义 overlay(...) 或 overlayEmissive(...)");
  }
  if (record.deform && !has(record.deform, "deform")) throw new Error("deform 里要定义 vec3 deform(vec3 pos, vec3 normal)");
  return record;
}

// 用的输入：面板据此提示「点击模型触发」等
export function effectUses(record, name) {
  const code = [record?.common, record?.overlay, record?.deform, record?.instances?.vertex, record?.instances?.fragment].join("\n");
  return new RegExp(`\\b${name}\\b`).test(code);
}

// 编译检查：把注册过的材质逐个在测试几何上画一次，收集错误，行号换算成效果代码里的行号
function parseErrors(log, source) {
  const lines = source.split("\n");
  const markers = [];
  lines.forEach((line, index) => {
    const match = line.trim().match(/^\/\/ @effect-code:(.+)$/);
    if (match) markers.push({ at: index + 1, section: match[1] });
  });
  const out = [];
  for (const raw of log.split("\n")) {
    const match = raw.match(/^ERROR:\s*\d+:(\d+):\s*(.*)$/);
    if (!match) continue;
    const at = Number(match[1]);
    const owner = markers.filter((item) => item.at < at).pop();
    out.push({
      section: owner ? owner.section : null,
      line: owner ? at - owner.at : null,
      message: match[2].trim(),
      code: (lines[at - 1] || "").trim(),
    });
  }
  if (!out.length && log.trim()) out.push({ section: null, line: null, message: log.trim().slice(0, 400), code: "" });
  return out;
}

function testGeometries() {
  const subject = new THREE.PlaneGeometry(0.2, 0.2, 2, 2);
  subject.setAttribute("outlineNormal", subject.attributes.normal.clone());
  subject.computeTangents();
  const blade = bladeGeometry();
  blade.computeVertexNormals();
  const instanced = new THREE.InstancedBufferGeometry();
  instanced.index = blade.index;
  instanced.setAttribute("position", blade.attributes.position);
  instanced.setAttribute("normal", blade.attributes.normal);
  instanced.setAttribute("iRoot", new THREE.InstancedBufferAttribute(new Float32Array(3), 3));
  instanced.setAttribute("iNormal", new THREE.InstancedBufferAttribute(new Float32Array([0, 0, 1]), 3));
  instanced.setAttribute("iUv", new THREE.InstancedBufferAttribute(new Float32Array(2), 2));
  instanced.setAttribute("iRand", new THREE.InstancedBufferAttribute(new Float32Array(4), 4));
  instanced.setAttribute("iMarker", new THREE.InstancedBufferAttribute(new Float32Array([1]), 1));
  instanced.instanceCount = 1;
  return { subject, instanced };
}

export function checkEffect(renderer) {
  const { subject, instanced } = testGeometries();
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 1, 0.01, 10);
  camera.position.set(0, 0, 1);
  const target = new THREE.WebGLRenderTarget(4, 4);
  const previousTarget = renderer.getRenderTarget();
  const previousHandler = renderer.debug.onShaderError;
  const errors = [];
  renderer.debug.onShaderError = (gl, program, glVertexShader, glFragmentShader) => {
    for (const shader of [glVertexShader, glFragmentShader]) {
      const log = gl.getShaderInfoLog(shader) || "";
      if (log.trim()) errors.push(...parseErrors(log, gl.getShaderSource(shader) || ""));
    }
    if (!errors.length) errors.push({ section: null, line: null, message: (gl.getProgramInfoLog(program) || "链接失败").slice(0, 400), code: "" });
  };
  try {
    for (const [material, kind] of registry) {
      if (errors.length) break;
      const geometries = kind === "instance" ? [instanced] : kind === "vertex" ? [subject, instanced] : [subject];
      for (const geometry of geometries) {
        const mesh = new THREE.Mesh(geometry, material);
        mesh.frustumCulled = false;
        scene.add(mesh);
        renderer.setRenderTarget(target);
        renderer.render(scene, camera);
        scene.remove(mesh);
        if (errors.length) break;
      }
    }
  } finally {
    renderer.debug.onShaderError = previousHandler;
    renderer.setRenderTarget(previousTarget);
    target.dispose();
    subject.dispose();
  }
  // 同一个错误会在多份材质里重复出现
  const seen = new Set();
  return errors.filter((error) => {
    const key = `${error.section}:${error.line}:${error.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 8);
}

export function formatEffectErrors(errors) {
  return errors
    .map((error) => {
      const where = error.section ? `${error.section} 第 ${error.line} 行` : "外框代码（检查函数名、签名和返回值）";
      return `${where}：${error.message}${error.code ? `\n    ${error.code}` : ""}`;
    })
    .join("\n");
}

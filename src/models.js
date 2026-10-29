// 展示模型：MaterialX Shader Ball（默认）、球、圆角方块。
// 统一产出 { root, materialMeshes, neutralMeshes }：materialMeshes 挂当前材质，
// neutralMeshes 是校色参照（内芯色环 + 灰底盘），任何模式下都保持写实，不参与风格化。
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";
import { computeOutlineNormals } from "./npr.js";

// height：归一化后的模型高度；uvRepeat：程序贴图平铺次数（默认 1）
export const displayModels = {
  shaderBall: {
    id: "shaderBall",
    label: "Shader Ball",
    url: "./assets/models/materialx-shaderball.glb",
    height: 1.5,
    uvRepeat: 2,
    keys: ["shader ball", "shaderball", "材质球展台", "标准材质球"],
  },
  sphere: { id: "sphere", label: "球", keys: ["球体", "圆球", "sphere"] },
  cube: { id: "cube", label: "方块", keys: ["立方体", "方块", "cube"] },
};

export const defaultDisplayModel = "shaderBall";

// 校色件：内芯开口处一圈 12 格色环（中性灰阶 + 色相），其余为中性灰；底盘为浅灰。
// 坐标都在 GLB 原始空间里量出来：内芯中心、开口方向（外壳开口半角约 29°）
const calibrationMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.55, metalness: 0 });
calibrationMaterial.onBeforeCompile = (shader) => {
  shader.vertexShader = shader.vertexShader
    .replace("void main() {", "varying vec3 vCalibPos;\nvoid main() {\n  vCalibPos = position;");
  shader.fragmentShader = shader.fragmentShader
    .replace(
      "void main() {",
      /* glsl */ `
varying vec3 vCalibPos;
vec3 calibrationColor(vec3 p) {
  if (p.y < 0.3) return vec3(0.42);
  const vec3 center = vec3(-0.049, 1.18, 0.066);
  vec3 axis = normalize(vec3(0.0393, 0.7402, 0.6713));
  vec3 dir = normalize(p - center);
  float theta = degrees(acos(clamp(dot(dir, axis), -1.0, 1.0)));
  if (theta < 15.0 || theta > 25.5) return vec3(0.18);
  vec3 u = normalize(cross(axis, vec3(0.0, 0.0, 1.0)));
  vec3 v = cross(axis, u);
  float phi = atan(dot(dir, v), dot(dir, u)) / 6.2831853 + 0.5;
  float cell = phi * 12.0;
  // 格子之间留一道深色缝
  if (fract(cell) < 0.04 || theta < 15.6 || theta > 24.9) return vec3(0.03);
  vec3 swatches[12] = vec3[12](
    vec3(0.95), vec3(0.78), vec3(0.48), vec3(0.2),
    vec3(0.78, 0.2, 0.2), vec3(0.92, 0.52, 0.16), vec3(0.93, 0.82, 0.22), vec3(0.32, 0.64, 0.3),
    vec3(0.2, 0.64, 0.72), vec3(0.22, 0.34, 0.72), vec3(0.46, 0.3, 0.66), vec3(0.78, 0.32, 0.62)
  );
  return pow(swatches[int(min(floor(cell), 11.0))], vec3(2.2));
}
void main() {`
    )
    .replace("vec4 diffuseColor = vec4( diffuse, opacity );", "vec4 diffuseColor = vec4( calibrationColor(vCalibPos), opacity );");
};
calibrationMaterial.customProgramCacheKey = () => "shadermaker-calibration-1";

// 与上面 GLSL 的 calibrationColor 同一套规则，供体素化时逐块取色（返回线性色）
const CALIBRATION_CENTER = new THREE.Vector3(-0.049, 1.18, 0.066);
const CALIBRATION_AXIS = new THREE.Vector3(0.0393, 0.7402, 0.6713).normalize();
const CALIBRATION_U = new THREE.Vector3().crossVectors(CALIBRATION_AXIS, new THREE.Vector3(0, 0, 1)).normalize();
const CALIBRATION_V = new THREE.Vector3().crossVectors(CALIBRATION_AXIS, CALIBRATION_U);
const CALIBRATION_SWATCHES = [
  [0.95, 0.95, 0.95], [0.78, 0.78, 0.78], [0.48, 0.48, 0.48], [0.2, 0.2, 0.2],
  [0.78, 0.2, 0.2], [0.92, 0.52, 0.16], [0.93, 0.82, 0.22], [0.32, 0.64, 0.3],
  [0.2, 0.64, 0.72], [0.22, 0.34, 0.72], [0.46, 0.3, 0.66], [0.78, 0.32, 0.62],
];

export function calibrationColor(local) {
  if (local.y < 0.3) return new THREE.Color(0.42, 0.42, 0.42);
  const dir = local.clone().sub(CALIBRATION_CENTER).normalize();
  const theta = THREE.MathUtils.radToDeg(Math.acos(THREE.MathUtils.clamp(dir.dot(CALIBRATION_AXIS), -1, 1)));
  if (theta < 15 || theta > 25.5) return new THREE.Color(0.18, 0.18, 0.18);
  const phi = Math.atan2(dir.dot(CALIBRATION_V), dir.dot(CALIBRATION_U)) / (Math.PI * 2) + 0.5;
  const [r, g, b] = CALIBRATION_SWATCHES[Math.min(Math.floor(phi * 12), 11)];
  return new THREE.Color(r ** 2.2, g ** 2.2, b ** 2.2);
}

function primitiveGeometry(id) {
  let geometry = id === "cube" ? new RoundedBoxGeometry(0.9, 0.9, 0.9, 6, 0.09) : new THREE.SphereGeometry(0.62, 96, 64);
  // RoundedBoxGeometry 没有索引，computeTangents 需要先合并顶点
  if (!geometry.index) geometry = mergeVertices(geometry);
  geometry.computeTangents();
  computeOutlineNormals(geometry);
  return geometry;
}

function buildPrimitive(def) {
  const geometry = primitiveGeometry(def.id);
  geometry.computeBoundingBox();
  const mesh = new THREE.Mesh(geometry);
  // 和 Shader Ball（高 1.5）同一个视觉中心，切换模型时画面大小一致
  mesh.position.y = 0.75;
  const root = new THREE.Group();
  root.add(mesh);
  return { root, materialMeshes: [mesh], neutralMeshes: [] };
}

// 缩放到目标高度、XZ 居中、底部在 y = 0
function normalize(object, height) {
  const box = new THREE.Box3().setFromObject(object);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  object.position.set(-center.x, -box.min.y, -center.z);
  const root = new THREE.Group();
  root.add(object);
  root.scale.setScalar(height / Math.max(size.y, 1e-4));
  return root;
}

async function buildShaderBall(def) {
  const gltf = await new GLTFLoader().loadAsync(def.url);
  const materialMeshes = [];
  const neutralMeshes = [];
  gltf.scene.traverse((child) => {
    if (!child.isMesh) return;
    if (child.name.startsWith("Calibration")) {
      child.userData.pbrMaterial = calibrationMaterial;
      neutralMeshes.push(child);
      return;
    }
    // 原始 GLB 没有切线，算一份给法线贴图用
    if (!child.geometry.attributes.tangent) child.geometry.computeTangents();
    computeOutlineNormals(child.geometry);
    materialMeshes.push(child);
  });
  return { root: normalize(gltf.scene, def.height), materialMeshes, neutralMeshes };
}

const cache = new Map();

export function loadDisplayModel(def) {
  if (!cache.has(def.id)) cache.set(def.id, def.url ? buildShaderBall(def) : Promise.resolve(buildPrimitive(def)));
  return cache.get(def.id);
}

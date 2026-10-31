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

// 均匀细分（每个三角形按边中点切成 4 个）：给积雪置换用的「曲面细分」。
// 共享边用同一个中点，置换后不会出现 T 形接缝的裂缝（three.js 自带的 TessellateModifier 只切最长边，会留裂缝）。
function subdivide(geometry) {
  const index = geometry.index.array;
  const names = Object.keys(geometry.attributes).filter((name) => name !== "tangent" && name !== "outlineNormal");
  const source = names.map((name) => geometry.attributes[name]);
  const values = source.map((attribute) => Array.from(attribute.array));
  let count = geometry.attributes.position.count;
  const midpoints = new Map();
  const midpoint = (a, b) => {
    const key = a < b ? a * 4194304 + b : b * 4194304 + a;
    let m = midpoints.get(key);
    if (m === undefined) {
      m = count++;
      source.forEach((attribute, k) => {
        const size = attribute.itemSize;
        for (let c = 0; c < size; c += 1) values[k].push((values[k][a * size + c] + values[k][b * size + c]) * 0.5);
      });
      midpoints.set(key, m);
    }
    return m;
  };
  const next = [];
  for (let t = 0; t < index.length; t += 3) {
    const [a, b, c] = [index[t], index[t + 1], index[t + 2]];
    const ab = midpoint(a, b);
    const bc = midpoint(b, c);
    const ca = midpoint(c, a);
    next.push(a, ab, ca, ab, b, bc, ca, bc, c, ab, bc, ca);
  }
  const result = new THREE.BufferGeometry();
  names.forEach((name, k) => result.setAttribute(name, new THREE.Float32BufferAttribute(values[k], source[k].itemSize)));
  result.setIndex(next);
  // 中点法线是两端平均，重新归一化
  const normal = result.attributes.normal;
  const v = new THREE.Vector3();
  for (let i = 0; i < normal.count; i += 1) {
    v.fromBufferAttribute(normal, i).normalize();
    normal.setXYZ(i, v.x, v.y, v.z);
  }
  return result;
}

// 细分到边长（取第 90 百分位，大块平面也算进去）不超过 targetEdge（模型自身坐标），三角形数不超过 maxTriangles（默认约 40 万）。
// 只看平均边长的话，导入模型细节处的大量小三角会把平均拉低，大块车身面板就几乎不细分
function densify(geometry, targetEdge, maxTriangles = 400000) {
  if (!geometry.index) geometry = mergeVertices(geometry);
  const position = geometry.attributes.position;
  const index = geometry.index.array;
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const lengths = [];
  const samples = Math.min(index.length / 3, 4000);
  const step = Math.max(1, Math.floor(index.length / 3 / samples));
  for (let t = 0; t < index.length; t += 3 * step) {
    lengths.push(a.fromBufferAttribute(position, index[t]).distanceTo(b.fromBufferAttribute(position, index[t + 1])));
  }
  lengths.sort((x, y) => x - y);
  const typical = lengths[Math.floor(lengths.length * 0.9)] || 0;
  let levels = Math.max(0, Math.ceil(Math.log2(typical / targetEdge)));
  while (levels > 0 && (index.length / 3) * 4 ** levels > maxTriangles) levels -= 1;
  for (let i = 0; i < levels; i += 1) geometry = subdivide(geometry);
  return geometry;
}

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
  const voxelGeometry = geometry;
  geometry = densify(geometry, 0.012);
  geometry.computeTangents();
  computeOutlineNormals(geometry);
  return { geometry, voxelGeometry };
}

function buildPrimitive(def) {
  const { geometry, voxelGeometry } = primitiveGeometry(def.id);
  geometry.computeBoundingBox();
  const mesh = new THREE.Mesh(geometry);
  // 体素化用细分前的网格，采样快很多，结果一样
  mesh.userData.voxelGeometry = voxelGeometry;
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

// 插件包里的模型做过顶点量化（cindy-plugin/modelPack.mjs）：属性转回浮点，量化用的节点缩放 / 平移烘回网格，
// 之后的细分、体素化、描边法线都和原始模型一样处理。网页版加载的是原始模型，什么都不做。
function dequantize(mesh) {
  const geometry = mesh.geometry;
  let quantized = false;
  for (const [name, attribute] of Object.entries(geometry.attributes)) {
    if (!attribute.isInterleavedBufferAttribute && attribute.array instanceof Float32Array) continue;
    quantized = true;
    const size = attribute.itemSize;
    const array = new Float32Array(attribute.count * size);
    const read = [attribute.getX, attribute.getY, attribute.getZ, attribute.getW];
    for (let i = 0; i < attribute.count; i += 1) {
      for (let k = 0; k < size; k += 1) array[i * size + k] = read[k].call(attribute, i);
    }
    geometry.setAttribute(name, new THREE.BufferAttribute(array, size));
  }
  if (!quantized) return;
  mesh.updateMatrix();
  geometry.applyMatrix4(mesh.matrix);
  geometry.normalizeNormals();
  mesh.position.set(0, 0, 0);
  mesh.quaternion.identity();
  mesh.scale.set(1, 1, 1);
}

async function buildShaderBall(def) {
  const gltf = await new GLTFLoader().loadAsync(def.url);
  const materialMeshes = [];
  const neutralMeshes = [];
  gltf.scene.traverse((child) => {
    if (!child.isMesh) return;
    dequantize(child);
    if (child.name.startsWith("Calibration")) {
      child.userData.pbrMaterial = calibrationMaterial;
      neutralMeshes.push(child);
      return;
    }
    // 细分给积雪置换用（GLB 自身坐标高约 2）；体素化仍用原网格
    child.userData.voxelGeometry = child.geometry;
    child.geometry = densify(child.geometry, 0.016);
    // 原始 GLB 没有切线，算一份给法线贴图用
    child.geometry.computeTangents();
    computeOutlineNormals(child.geometry);
    materialMeshes.push(child);
  });
  return { root: normalize(gltf.scene, def.height), materialMeshes, neutralMeshes };
}

// ---- 导入的模型（GLB / 自包含的 glTF） ----
// 每种原材质算一个「部件」：勾选的部件换成 ShaderMaker 的材质（做细分、参与效果、体素按贴图取色），
// 其余保留原材质。默认勾面积最大的部件（车就是车身）。

// 需要解码器的扩展：插件页面不允许 wasm / 远程脚本，先说明怎么转换
const UNSUPPORTED_EXTENSIONS = {
  KHR_draco_mesh_compression: "Draco 网格压缩",
  EXT_meshopt_compression: "meshopt 压缩",
  KHR_texture_basisu: "KTX2 / Basis 贴图",
};
// 导入模型归一化后最长边的长度（Shader Ball 高 1.5、宽约 1.3）
const IMPORT_SIZE = 1.9;
// 换成 ShaderMaker 材质的部件细分后的三角形总数上限
const IMPORT_TRIANGLE_BUDGET = 1500000;

function gltfJson(data) {
  const bytes = new Uint8Array(data);
  const magic = String.fromCharCode(...bytes.subarray(0, 4));
  if (magic === "glTF") {
    const view = new DataView(data);
    const length = view.getUint32(12, true);
    return JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + length)));
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new Error("不是 GLB / glTF 文件");
  }
}

function checkImport(data) {
  const json = gltfJson(data);
  const used = [...new Set([...(json.extensionsRequired || []), ...(json.extensionsUsed || [])])];
  const blocked = used.filter((name) => UNSUPPORTED_EXTENSIONS[name]).map((name) => UNSUPPORTED_EXTENSIONS[name]);
  if (blocked.length) {
    throw new Error(`模型用了${blocked.join("、")}，需要先解压：npx @gltf-transform/cli copy 输入.glb 输出.glb（去掉压缩）后再导入`);
  }
  const external = [...(json.buffers || []), ...(json.images || [])].find((item) => item.uri && !item.uri.startsWith("data:"));
  if (external) throw new Error(`这个 glTF 引用了外部文件（${external.uri}），请导出成单个 .glb 再导入`);
}

// 多材质网格按材质拆成多个网格，之后一个网格只对应一个部件
function splitByMaterial(mesh) {
  if (!Array.isArray(mesh.material)) return [mesh];
  const geometry = mesh.geometry.index ? mesh.geometry : mergeVertices(mesh.geometry);
  const index = geometry.index.array;
  const groups = geometry.groups.length ? geometry.groups : [{ start: 0, count: index.length, materialIndex: 0 }];
  return groups.map((group) => {
    const part = new THREE.BufferGeometry();
    for (const [name, attribute] of Object.entries(geometry.attributes)) part.setAttribute(name, attribute);
    part.setIndex(Array.from(index.subarray(group.start, group.start + group.count)));
    const child = new THREE.Mesh(part, mesh.material[group.materialIndex] || mesh.material[0]);
    child.name = `${mesh.name}#${group.materialIndex}`;
    mesh.parent.add(child);
    child.position.copy(mesh.position);
    child.quaternion.copy(mesh.quaternion);
    child.scale.copy(mesh.scale);
    return child;
  });
}

// 缩放到最长边 = size、XZ 居中、底部在 y = 0
function normalizeFit(object, size) {
  const box = new THREE.Box3().setFromObject(object);
  const extent = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  object.position.set(-center.x, -box.min.y, -center.z);
  const root = new THREE.Group();
  root.add(object);
  root.scale.setScalar(size / Math.max(extent.x, extent.y, extent.z, 1e-4));
  root.updateMatrixWorld(true);
  return root;
}

function meshArea(mesh) {
  const position = mesh.geometry.attributes.position;
  const index = mesh.geometry.index;
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const count = index ? index.count : position.count;
  let area = 0;
  for (let i = 0; i < count; i += 3) {
    a.fromBufferAttribute(position, index ? index.getX(i) : i).applyMatrix4(mesh.matrixWorld);
    b.fromBufferAttribute(position, index ? index.getX(i + 1) : i + 1).applyMatrix4(mesh.matrixWorld);
    c.fromBufferAttribute(position, index ? index.getX(i + 2) : i + 2).applyMatrix4(mesh.matrixWorld);
    area += b.sub(a).cross(c.sub(a)).length() * 0.5;
  }
  return area;
}

async function buildImported(def) {
  const data = await def.load();
  checkImport(data);
  const gltf = await new GLTFLoader().parseAsync(data, "");
  const scene = gltf.scene;
  scene.updateMatrixWorld(true);
  const found = [];
  scene.traverse((child) => {
    if (child.isMesh) found.push(child);
  });
  if (!found.length) throw new Error("模型里没有网格");
  const meshes = [];
  for (const mesh of found) {
    const pieces = splitByMaterial(mesh);
    if (pieces[0] !== mesh) mesh.removeFromParent();
    meshes.push(...pieces);
  }
  // 几何可能被多个网格共用：先各自复制一份，后面的处理会改动几何
  const seen = new Set();
  for (const mesh of meshes) {
    if (seen.has(mesh.geometry)) mesh.geometry = mesh.geometry.clone();
    seen.add(mesh.geometry);
    dequantize(mesh);
    if (!mesh.geometry.index) mesh.geometry = mergeVertices(mesh.geometry);
    if (!mesh.geometry.attributes.normal) mesh.geometry.computeVertexNormals();
    mesh.userData.originalGeometry = mesh.geometry;
    mesh.userData.originalMaterial = mesh.material;
    mesh.userData.pbrMaterial = mesh.material;
    mesh.userData.voxelColor = mesh.material.color ? mesh.material.color.clone() : new THREE.Color(0.5, 0.5, 0.5);
  }
  const root = normalizeFit(scene, IMPORT_SIZE);
  // 部件：按原材质分组，记面积（展示空间）
  const parts = [];
  const byMaterial = new Map();
  let totalArea = 0;
  for (const mesh of meshes) {
    let part = byMaterial.get(mesh.material);
    if (!part) {
      part = { key: `p${parts.length}`, label: mesh.material.name || `部件 ${parts.length + 1}`, meshes: [], area: 0, enabled: false };
      byMaterial.set(mesh.material, part);
      parts.push(part);
    }
    mesh.userData.area = meshArea(mesh);
    part.area += mesh.userData.area;
    part.meshes.push(mesh);
    totalArea += mesh.userData.area;
  }
  const model = { root, imported: true, parts, totalArea, materialMeshes: [], neutralMeshes: [] };
  const largest = parts.reduce((best, part) => (part.area > best.area ? part : best), parts[0]);
  assignParts(model, def.parts?.length ? def.parts : [largest.key]);
  return model;
}

// 换成 ShaderMaker 材质的网格：细分（边长约 0.02 个展示单位，按面积分配三角形预算）、切线、描边法线
function prepareMaterialGeometry(mesh, model) {
  const scale = new THREE.Vector3().setFromMatrixScale(mesh.matrixWorld);
  const localEdge = 0.02 / Math.max(scale.x, scale.y, scale.z, 1e-6);
  const budget = Math.max(mesh.geometry.index.count / 3, (IMPORT_TRIANGLE_BUDGET * mesh.userData.area) / Math.max(model.totalArea, 1e-9));
  const geometry = densify(mesh.userData.originalGeometry, localEdge, Math.min(budget, 400000));
  if (geometry.attributes.uv && geometry.attributes.normal) {
    try {
      geometry.computeTangents();
    } catch {
      // 退化三角形算不出切线：法线贴图走三向投影，不影响
    }
  }
  computeOutlineNormals(geometry);
  computeEdgeLengths(geometry, Math.max(scale.x, scale.y, scale.z));
  mesh.userData.denseGeometry = geometry;
}

// 每个顶点最长的相邻边（展示空间单位），存成 fxEdge：三角形太大的地方，积雪 / 置换的顶点外推自动减弱，
// 否则比三角形还细的起伏会把大三角形顶成尖刺（materialFx.js）。内置模型细分足够细，不需要
function computeEdgeLengths(geometry, scale) {
  const position = geometry.attributes.position;
  const index = geometry.index.array;
  const edges = new Float32Array(position.count);
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  for (let t = 0; t < index.length; t += 3) {
    for (let k = 0; k < 3; k += 1) {
      const i = index[t + k];
      const j = index[t + ((k + 1) % 3)];
      const length = a.fromBufferAttribute(position, i).distanceTo(b.fromBufferAttribute(position, j)) * scale;
      if (length > edges[i]) edges[i] = length;
      if (length > edges[j]) edges[j] = length;
    }
  }
  // 同一位置的顶点（UV 接缝处的重复顶点）取同一个值，否则减弱程度不同会裂开
  const keyOf = (i) => `${Math.round(position.getX(i) * 1e4)},${Math.round(position.getY(i) * 1e4)},${Math.round(position.getZ(i) * 1e4)}`;
  const shared = new Map();
  for (let i = 0; i < position.count; i += 1) shared.set(keyOf(i), Math.max(shared.get(keyOf(i)) || 0, edges[i]));
  for (let i = 0; i < position.count; i += 1) edges[i] = shared.get(keyOf(i));
  geometry.setAttribute("fxEdge", new THREE.BufferAttribute(edges, 1));
}

// enabled：换成 ShaderMaker 材质的部件 key
export function assignParts(model, enabled) {
  const valid = enabled.filter((key) => model.parts.some((part) => part.key === key));
  const keys = valid.length ? valid : [model.parts[0].key];
  model.materialMeshes = [];
  model.neutralMeshes = [];
  for (const part of model.parts) {
    part.enabled = keys.includes(part.key);
    for (const mesh of part.meshes) {
      if (part.enabled) {
        if (!mesh.userData.denseGeometry) prepareMaterialGeometry(mesh, model);
        mesh.geometry = mesh.userData.denseGeometry;
        mesh.userData.voxelGeometry = mesh.userData.originalGeometry;
        model.materialMeshes.push(mesh);
      } else {
        mesh.geometry = mesh.userData.originalGeometry;
        mesh.material = mesh.userData.originalMaterial;
        model.neutralMeshes.push(mesh);
      }
    }
  }
  return model;
}

// 从外面看得到多少：每个部件涂一种编号色，从 14 个方向各渲染一张小图，数各部件占的像素。
// 车内饰面积大但被车身挡住，按这个挑「默认套用材质的部件」才会挑到车身。结果写进 part.exposure（0–1）
export function measureExposure(model, renderer) {
  const scene = new THREE.Scene();
  const parent = model.root.parent;
  scene.add(model.root);
  const saved = new Map();
  model.parts.forEach((part, index) => {
    const material = new THREE.MeshBasicMaterial({ color: new THREE.Color().setHex(index + 1, THREE.LinearSRGBColorSpace), side: THREE.DoubleSide });
    for (const mesh of part.meshes) {
      saved.set(mesh, mesh.material);
      mesh.material = material;
    }
  });
  const box = new THREE.Box3().setFromObject(model.root);
  const sphere = box.getBoundingSphere(new THREE.Sphere());
  const camera = new THREE.OrthographicCamera(-sphere.radius, sphere.radius, sphere.radius, -sphere.radius, 0.01, sphere.radius * 4);
  const size = 128;
  const target = new THREE.WebGLRenderTarget(size, size);
  const pixels = new Uint8Array(size * size * 4);
  const counts = new Array(model.parts.length).fill(0);
  const previousTarget = renderer.getRenderTarget();
  const previousColor = renderer.getClearColor(new THREE.Color());
  const previousAlpha = renderer.getClearAlpha();
  const previousTone = renderer.toneMapping;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.setClearColor(0x000000, 1);
  const directions = [];
  for (const x of [-1, 0, 1]) for (const y of [-1, 0, 1]) for (const z of [-1, 0, 1]) {
    if ((x || y || z) && Math.abs(x) + Math.abs(y) + Math.abs(z) !== 2) directions.push(new THREE.Vector3(x, y, z).normalize());
  }
  try {
    for (const direction of directions) {
      camera.position.copy(sphere.center).addScaledVector(direction, sphere.radius * 2);
      camera.lookAt(sphere.center);
      renderer.setRenderTarget(target);
      renderer.clear();
      renderer.render(scene, camera);
      renderer.readRenderTargetPixels(target, 0, 0, size, size, pixels);
      for (let i = 0; i < pixels.length; i += 4) {
        const id = (pixels[i] << 16) | (pixels[i + 1] << 8) | pixels[i + 2];
        if (id > 0 && id <= counts.length) counts[id - 1] += 1;
      }
    }
  } finally {
    renderer.setRenderTarget(previousTarget);
    renderer.setClearColor(previousColor, previousAlpha);
    renderer.toneMapping = previousTone;
    target.dispose();
    for (const [mesh, material] of saved) mesh.material = material;
    scene.remove(model.root);
    if (parent) parent.add(model.root);
  }
  const total = counts.reduce((sum, value) => sum + value, 0) || 1;
  model.parts.forEach((part, index) => (part.exposure = counts[index] / total));
  return model.parts.reduce((best, part) => (part.exposure > best.exposure ? part : best), model.parts[0]);
}

const cache = new Map();

export function loadDisplayModel(def) {
  if (!cache.has(def.id)) {
    const build = def.load ? buildImported(def) : def.url ? buildShaderBall(def) : Promise.resolve(buildPrimitive(def));
    // 失败的不缓存，下次重新加载
    build.catch(() => cache.delete(def.id));
    cache.set(def.id, build);
  }
  return cache.get(def.id);
}

export function forgetDisplayModel(id) {
  cache.delete(id);
}

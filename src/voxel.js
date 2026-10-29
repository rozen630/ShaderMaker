// 体素化（Teardown 式）：把展示模型转成表面体素，用 InstancedMesh 渲染。
// 每个体素记住它在原模型上的 UV，材质贴图按这个 UV 取一次色，所以整块只有一个颜色，
// 动画 Shader 照样会动；PBR / NPR 材质通过 applyVoxelSupport 复用，不另写一套材质。
import * as THREE from "three";

// 精细度 = 模型高度方向上的体素数；滑条范围与自然语言里「粗 / 中 / 细」对应的值
export const voxelResolution = { min: 12, max: 96, step: 2, default: 48 };
export const voxelPresets = { coarse: 28, medium: 48, fine: 72 };

const UV_MACROS = ["MAP_UV", "ROUGHNESSMAP_UV", "METALNESSMAP_UV", "AOMAP_UV", "EMISSIVEMAP_UV", "NORMALMAP_UV"];

const voxelVertexHead = /* glsl */ `
varying vec2 vVoxelFace;
#ifdef USE_INSTANCING
attribute vec2 voxelUv;
${UV_MACROS.map((name) => `#ifdef ${name}\n#undef ${name}\n#define ${name} voxelUv\n#endif`).join("\n")}
#endif
`;

const voxelFragmentHead = /* glsl */ `
varying vec2 vVoxelFace;
// 体素面边缘轻微压暗，让一块块的轮廓读得出来
float voxelEdge(vec2 face) {
  vec2 d = min(face, 1.0 - face);
  return mix(0.88, 1.0, smoothstep(0.0, 0.1, min(d.x, d.y)));
}
`;

// 给已有材质加体素支持：实例化时所有贴图改用每个体素的 voxelUv；普通网格不受影响
export function applyVoxelSupport(material) {
  const previous = material.onBeforeCompile;
  const previousKey = material.customProgramCacheKey;
  material.onBeforeCompile = (shader, renderer) => {
    previous.call(material, shader, renderer);
    shader.vertexShader = voxelVertexHead + shader.vertexShader.replace(
      "#include <uv_vertex>",
      "#include <uv_vertex>\n  vVoxelFace = vec2(0.5);\n#ifdef USE_INSTANCING\n  vVoxelFace = uv;\n#endif"
    );
    shader.fragmentShader = voxelFragmentHead + shader.fragmentShader.replace(
      "#include <color_fragment>",
      "#include <color_fragment>\n  diffuseColor.rgb *= voxelEdge(vVoxelFace);"
    );
  };
  material.customProgramCacheKey = () => `${previousKey.call(material)}-voxel-1`;
  material.needsUpdate = true;
}

// 体素 AO：按 26 邻域里被占用的格数压暗，角落和缝隙更暗（近似 Teardown 的块状遮蔽）
function neighborAo(occupied, key, dims) {
  const x = key % dims.x;
  const y = Math.floor(key / dims.x) % dims.y;
  const z = Math.floor(key / (dims.x * dims.y));
  let count = 0;
  for (let dz = -1; dz <= 1; dz += 1) {
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        if (!dx && !dy && !dz) continue;
        const nx = x + dx;
        const ny = y + dy;
        const nz = z + dz;
        if (nx < 0 || ny < 0 || nz < 0 || nx >= dims.x || ny >= dims.y || nz >= dims.z) continue;
        if (occupied.has(nx + ny * dims.x + nz * dims.x * dims.y)) count += 1;
      }
    }
  }
  // 平面上约 8 个邻居基本不压暗，内角 / 缝隙（12+）才明显变暗
  return THREE.MathUtils.clamp(1.26 - count * 0.036, 0.55, 1);
}

const tmpA = new THREE.Vector3();
const tmpB = new THREE.Vector3();
const tmpC = new THREE.Vector3();
const point = new THREE.Vector3();

// meshes: [{ mesh, kind: "material" | "neutral" }]；relativeTo: 体素所在的父节点（display 组）
// 返回 { size, material: [...], neutral: [...] }，每项 { position, uv, local, ao }
export function voxelize(meshes, relativeTo, resolution) {
  relativeTo.updateMatrixWorld(true);
  const inverse = new THREE.Matrix4().copy(relativeTo.matrixWorld).invert();
  const bounds = new THREE.Box3();
  const entries = meshes.map(({ mesh, kind }) => {
    const matrix = new THREE.Matrix4().multiplyMatrices(inverse, mesh.matrixWorld);
    mesh.geometry.computeBoundingBox();
    bounds.union(mesh.geometry.boundingBox.clone().applyMatrix4(matrix));
    return { mesh, kind, matrix };
  });
  const size = (bounds.max.y - bounds.min.y) / resolution;
  const origin = bounds.min.clone().subScalar(size * 0.5);
  const dims = {
    x: Math.ceil((bounds.max.x - origin.x) / size) + 2,
    y: Math.ceil((bounds.max.y - origin.y) / size) + 2,
    z: Math.ceil((bounds.max.z - origin.z) / size) + 2,
  };
  // key -> 离体素中心最近的采样（UV 取最近的，避免跨 UV 接缝时取平均）
  const cells = new Map();

  for (const { mesh, kind, matrix } of entries) {
    const geometry = mesh.geometry;
    const position = geometry.attributes.position;
    const uv = geometry.attributes.uv;
    const index = geometry.index;
    const triangleCount = index ? index.count / 3 : position.count / 3;
    const corner = (t, k) => (index ? index.getX(t * 3 + k) : t * 3 + k);
    for (let t = 0; t < triangleCount; t += 1) {
      const ia = corner(t, 0);
      const ib = corner(t, 1);
      const ic = corner(t, 2);
      tmpA.fromBufferAttribute(position, ia).applyMatrix4(matrix);
      tmpB.fromBufferAttribute(position, ib).applyMatrix4(matrix);
      tmpC.fromBufferAttribute(position, ic).applyMatrix4(matrix);
      const area = point.subVectors(tmpB, tmpA).cross(tmpC.clone().sub(tmpA)).length() * 0.5;
      // 采样密度：每个体素面积上约 4 个点，保证不漏格
      const steps = Math.max(1, Math.ceil(Math.sqrt((area / (size * size)) * 4)));
      for (let i = 0; i <= steps; i += 1) {
        for (let j = 0; j <= steps - i; j += 1) {
          const b = i / steps;
          const c = j / steps;
          const a = 1 - b - c;
          point.set(0, 0, 0).addScaledVector(tmpA, a).addScaledVector(tmpB, b).addScaledVector(tmpC, c);
          const gx = Math.floor((point.x - origin.x) / size);
          const gy = Math.floor((point.y - origin.y) / size);
          const gz = Math.floor((point.z - origin.z) / size);
          const key = gx + gy * dims.x + gz * dims.x * dims.y;
          const cx = origin.x + (gx + 0.5) * size;
          const cy = origin.y + (gy + 0.5) * size;
          const cz = origin.z + (gz + 0.5) * size;
          const distance = (point.x - cx) ** 2 + (point.y - cy) ** 2 + (point.z - cz) ** 2;
          const cell = cells.get(key);
          if (cell && cell.distance <= distance) continue;
          const u = uv ? uv.getX(ia) * a + uv.getX(ib) * b + uv.getX(ic) * c : 0.5;
          const v = uv ? uv.getY(ia) * a + uv.getY(ib) * b + uv.getY(ic) * c : 0.5;
          // local：网格自身空间的位置，校色件按它算色环颜色
          const local = new THREE.Vector3()
            .fromBufferAttribute(position, ia)
            .multiplyScalar(a)
            .addScaledVector(new THREE.Vector3().fromBufferAttribute(position, ib), b)
            .addScaledVector(new THREE.Vector3().fromBufferAttribute(position, ic), c);
          cells.set(key, { kind, distance, position: new THREE.Vector3(cx, cy, cz), uv: [u, v], local });
        }
      }
    }
  }

  const result = { size, material: [], neutral: [] };
  for (const [key, cell] of cells) {
    const voxel = { position: cell.position, uv: cell.uv, local: cell.local, ao: neighborAo(cells, key, dims) };
    result[cell.kind].push(voxel);
  }
  return result;
}

// 逐块亮度抖动：同一材质的体素颜色有细微差别，更像一块块拼出来的
function jitter(position) {
  const n = Math.sin(position.x * 127.1 + position.y * 311.7 + position.z * 74.7) * 43758.5453;
  return 0.96 + (n - Math.floor(n)) * 0.08;
}

// colorOf(voxel) 不传时只写 AO（材质体素颜色来自贴图）；传了就写完整颜色（校色件）
export function buildVoxelMesh(voxels, size, material, colorOf = null) {
  const geometry = new THREE.BoxGeometry(size, size, size);
  const uvs = new Float32Array(voxels.length * 2);
  voxels.forEach((voxel, i) => uvs.set(voxel.uv, i * 2));
  geometry.setAttribute("voxelUv", new THREE.InstancedBufferAttribute(uvs, 2));
  const mesh = new THREE.InstancedMesh(geometry, material, voxels.length);
  const matrix = new THREE.Matrix4();
  const color = new THREE.Color();
  voxels.forEach((voxel, i) => {
    matrix.makeTranslation(voxel.position.x, voxel.position.y, voxel.position.z);
    mesh.setMatrixAt(i, matrix);
    const shade = voxel.ao * jitter(voxel.position);
    if (colorOf) color.copy(colorOf(voxel)).multiplyScalar(shade);
    else color.setScalar(shade);
    mesh.setColorAt(i, color);
  });
  mesh.instanceMatrix.needsUpdate = true;
  mesh.instanceColor.needsUpdate = true;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

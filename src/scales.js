// 鳞片绽放：点击模型，一圈鳞片从点击处向外传播——经过时长出、翘起、扭转，之后平伏缩回，露出换好颜色的表面。
// 浏览器里没有 Compute Shader / DrawMeshInstancedIndirect，对应做法是：
// 1. 散布：在展示模型表面按面积随机取点（MeshSurfaceSampler），记下位置和法线，存成实例属性；
// 2. 绘制：一片预制的鳞片网格用实例化一次画完（InstancedBufferGeometry），每片的旋转 / 缩放 / 扭转全在顶点着色器里算：
//    局部坐标由法线和「流向」（展示空间 Z 轴，或背离点击点）决定，再按到点击点的距离和波前半径算出翘起角、扭转角和大小；
// 3. 表面变色：主体材质按像素到点击点的距离换色（materialFx.js 读这里的 waveUniforms）。
// 滤镜的遮罩 / 法线深度和阴影也要按同样的变换画鳞片（applyScaleVertex）。
import * as THREE from "three";
import { MeshSurfaceSampler } from "three/addons/math/MeshSurfaceSampler.js";

export const MAX_SCALES = 40000;

export const scaleDefaults = {
  density: 20000,
  size: 0.12,
  speed: 0.55,
  lift: 0.75,
  twist: 0.6,
  curl: 0.35,
  flow: "z",
  colorFrom: [0.1, 0.85, 0.8],
  colorTo: [0.85, 0.12, 0.85],
};

export const scaleUniforms = {
  uScaleOn: { value: 0 },
  uScaleCenter: { value: new THREE.Vector3() },
  uScaleRadius: { value: -10 },
  uScaleBand: { value: 0.16 },
  uScaleSize: { value: scaleDefaults.size },
  uScaleLift: { value: scaleDefaults.lift },
  uScaleTwist: { value: scaleDefaults.twist },
  uScaleCurl: { value: scaleDefaults.curl },
  uScaleFlow: { value: new THREE.Vector3(0, 0, 1) },
  uScaleRadial: { value: 0 },
  uScaleFrom: { value: new THREE.Color(...scaleDefaults.colorFrom) },
  uScaleTo: { value: new THREE.Color(...scaleDefaults.colorTo) },
};

// 表面变色（materialFx.js）：波前后面换成 uWaveColor；uWaveBase 是上一次换好的颜色（第一次为 0，保留材质原色）
export const waveUniforms = {
  uWaveOn: { value: 0 },
  uWaveCenter: scaleUniforms.uScaleCenter,
  uWaveRadius: { value: -10 },
  uWaveSoft: { value: 0.03 },
  uWaveColor: { value: new THREE.Color() },
  uWaveBase: { value: new THREE.Color() },
  uWaveBaseMix: { value: 0 },
};

const vertexHead = /* glsl */ `
uniform float uScaleOn;
uniform vec3 uScaleCenter;
uniform float uScaleRadius;
uniform float uScaleBand;
uniform float uScaleSize;
uniform float uScaleLift;
uniform float uScaleTwist;
uniform float uScaleCurl;
uniform vec3 uScaleFlow;
uniform float uScaleRadial;
uniform vec3 uScaleFrom;
uniform vec3 uScaleTo;
attribute vec3 aScaleRoot;
attribute vec3 aScaleNormal;
attribute vec4 aScaleRand;
varying vec3 vScaleColor;

vec3 scaleRotate(vec3 v, vec3 axis, float angle) {
  return v * cos(angle) + cross(axis, v) * sin(angle) + axis * dot(axis, v) * (1.0 - cos(angle));
}

// 鳞片局部坐标：x 横向、y 沿长度（根部在 0）、z 离开表面。返回变换后的位置，nOut 是变换后的法线
vec3 scaleApply(vec3 p, vec3 nl, out vec3 nOut) {
  vec3 n = normalize(aScaleNormal);
  float r4 = fract(aScaleRand.x * 13.7 + aScaleRand.z * 7.31);
  // 流向：展示空间 Z 轴，或背离点击点；投影到切平面，再加一点随机偏角
  vec3 flow = mix(uScaleFlow, aScaleRoot - uScaleCenter, uScaleRadial);
  flow -= n * dot(flow, n);
  if (dot(flow, flow) < 1e-6) flow = abs(n.y) < 0.9 ? cross(n, vec3(0.0, 1.0, 0.0)) : cross(n, vec3(1.0, 0.0, 0.0));
  vec3 along = scaleRotate(normalize(flow), n, (aScaleRand.x - 0.5) * 1.1);
  vec3 across = normalize(cross(n, along));

  // t：相对波前的位置（以波带宽为单位），> 0 表示波前已经过去
  float d = distance(aScaleRoot, uScaleCenter) + (aScaleRand.y - 0.5) * uScaleBand * 0.8;
  float t = (uScaleRadius - d) / max(uScaleBand, 1e-3);
  float grow = smoothstep(-1.2, 0.0, t) * (1.0 - smoothstep(0.6, 2.6, t));
  float size = uScaleSize * (0.55 + 0.9 * aScaleRand.z) * grow * uScaleOn;
  float wave = exp(-t * t * 0.9);
  float lift = uScaleLift * wave * (0.55 + 0.7 * r4);
  float twist = uScaleTwist * ((r4 - 0.5) * 2.0 + t * 0.3) * wave;
  p.z += uScaleCurl * p.y * p.y * wave;

  // 绕横轴翘起，再绕自身长度方向扭转
  vec3 dir = scaleRotate(along, across, -lift);
  vec3 up = scaleRotate(n, across, -lift);
  vec3 side = scaleRotate(across, dir, twist);
  up = scaleRotate(up, dir, twist);
  nOut = normalize(side * nl.x + dir * nl.y + up * nl.z);

  // 颜色：根部从起始色变成目标色，波前附近的鳞片尖保留起始色（参考图里紫根青尖）
  vec3 root = mix(uScaleFrom, uScaleTo, smoothstep(-0.8, 0.2, t));
  float tip = smoothstep(0.3, 1.0, p.y) * (1.0 - smoothstep(0.3, 1.8, t));
  // 根部压暗：鳞片之间的缝隙更深，层次读得出来
  vScaleColor = mix(root, uScaleFrom, tip) * mix(0.3, 1.0, smoothstep(0.0, 0.55, p.y));
  return aScaleRoot + n * 0.003 + (side * p.x + dir * p.y + up * p.z) * size;
}
`;

// 只有鳞片实例带 aScaleRand（w = 1）；同一个覆盖材质画别的物体时读到 0，不受影响
const vertexBody = /* glsl */ `
if (aScaleRand.w > 0.5) {
  vec3 scaleNormalOut;
  transformed = scaleApply(position, normal, scaleNormalOut);
}
`;

function injectHead(shader) {
  Object.assign(shader.uniforms, scaleUniforms);
  shader.vertexShader = shader.vertexShader.replace("void main() {", `${vertexHead}\nvoid main() {`);
}

// 滤镜遮罩 / 法线深度、阴影深度这类覆盖材质：只改位置
export function applyScaleVertex(material) {
  const previous = material.onBeforeCompile;
  const previousKey = material.customProgramCacheKey;
  material.onBeforeCompile = (shader, renderer) => {
    shader.vertexShader = shader.vertexShader.replace("#include <begin_vertex>", `#include <begin_vertex>\n${vertexBody}`);
    previous.call(material, shader, renderer);
    injectHead(shader);
  };
  material.customProgramCacheKey = () => `${previousKey.call(material)}-scalev-1`;
  material.needsUpdate = true;
}

// 鳞片自己的材质（写实 / 卡通各一份）：位置、法线和颜色都来自 scaleApply
function applyScaleMaterial(material) {
  const previous = material.onBeforeCompile;
  const previousKey = material.customProgramCacheKey;
  material.onBeforeCompile = (shader, renderer) => {
    previous.call(material, shader, renderer);
    injectHead(shader);
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <beginnormal_vertex>",
        "#include <beginnormal_vertex>\n{\n  vec3 scaleNormalOut;\n  scaleApply(position, objectNormal, scaleNormalOut);\n  objectNormal = scaleNormalOut;\n}"
      )
      .replace("#include <begin_vertex>", "vec3 scaleNormalTmp;\nvec3 transformed = scaleApply(position, normal, scaleNormalTmp);");
    shader.fragmentShader = shader.fragmentShader
      .replace("void main() {", "varying vec3 vScaleColor;\nvoid main() {")
      .replace("#include <color_fragment>", "#include <color_fragment>\ndiffuseColor.rgb = vScaleColor;");
  };
  material.customProgramCacheKey = () => `${previousKey ? previousKey.call(material) : ""}-scale-1`;
  material.needsUpdate = true;
}

// 预制鳞片：细长的羽片，中间有脊、两侧微微下卷，根部窄、中段宽、尖端收拢
function bladeGeometry() {
  const rows = 9;
  const cols = 5;
  const positions = [];
  const indices = [];
  for (let j = 0; j < rows; j += 1) {
    const y = j / (rows - 1);
    const width = 0.3 * Math.pow(Math.sin(Math.PI * Math.min(y * 1.08, 1)), 0.75) * (1.15 - 0.45 * y) + 0.012;
    for (let i = 0; i < cols; i += 1) {
      const u = i / (cols - 1) * 2 - 1;
      positions.push(u * width, y, 0.035 * (1 - Math.abs(u)) * Math.sin(Math.PI * y) - 0.02 * u * u + 0.05 * y * y);
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
  geometry.computeVertexNormals();
  return geometry;
}

// npr：npr.js 的实例，用来做卡通版鳞片材质
export function createScales(npr) {
  const blade = bladeGeometry();
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.index = blade.index;
  geometry.setAttribute("position", blade.attributes.position);
  geometry.setAttribute("normal", blade.attributes.normal);
  const roots = new Float32Array(MAX_SCALES * 3);
  const normals = new Float32Array(MAX_SCALES * 3);
  const rands = new Float32Array(MAX_SCALES * 4);
  geometry.setAttribute("aScaleRoot", new THREE.InstancedBufferAttribute(roots, 3));
  geometry.setAttribute("aScaleNormal", new THREE.InstancedBufferAttribute(normals, 3));
  geometry.setAttribute("aScaleRand", new THREE.InstancedBufferAttribute(rands, 4));
  geometry.instanceCount = 0;

  const pbrMaterial = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    // 鳞片大多是斜着看到的，镜面反射一强就整片发白；压低镜面，颜色才饱和
    metalness: 0.1,
    roughness: 0.42,
    specularIntensity: 0.35,
    clearcoat: 0.2,
    clearcoatRoughness: 0.3,
    iridescence: 0.1,
    iridescenceIOR: 1.4,
    envMapIntensity: 0.8,
    side: THREE.DoubleSide,
  });
  applyScaleMaterial(pbrMaterial);
  const nprMaterial = npr.makeMaterial({ color: 0xffffff, side: THREE.DoubleSide });
  applyScaleMaterial(nprMaterial);
  npr.applyPhysical(nprMaterial, {
    uRoughness: 0.42,
    uMetalness: 0.1,
    uClearcoat: 0.2,
    uClearcoatRoughness: 0.2,
    uSheen: 0,
    uSheenColor: [1, 1, 1],
    uTransmission: 0,
    uAttenuationColor: [1, 1, 1],
    uIridescence: 0,
    uDispersion: 0,
  }, { rimScale: 0 });
  const depthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, side: THREE.DoubleSide });
  applyScaleVertex(depthMaterial);

  const mesh = new THREE.Mesh(geometry, pbrMaterial);
  mesh.customDepthMaterial = depthMaterial;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  // 位置全在着色器里算，包围盒对不上，不做视锥剔除
  mesh.frustumCulled = false;
  mesh.visible = false;

  const options = { ...scaleDefaults, colorFrom: [...scaleDefaults.colorFrom], colorTo: [...scaleDefaults.colorTo] };
  let enabled = false;
  let sampled = 0;
  let farthest = 2;
  let wave = null;
  let waves = 0;
  let hidden = false;

  // 在展示模型表面散布 MAX_SCALES 个点（按面积），坐标是 relativeTo（展示组）的局部空间
  function scatter(meshes, relativeTo) {
    relativeTo.updateMatrixWorld(true);
    const inverse = new THREE.Matrix4().copy(relativeTo.matrixWorld).invert();
    const entries = meshes.map((source) => {
      const sampleMesh = new THREE.Mesh(source.userData.voxelGeometry || source.geometry);
      const sampler = new MeshSurfaceSampler(sampleMesh).build();
      const area = sampler.distribution ? sampler.distribution[sampler.distribution.length - 1] : 1;
      const matrix = new THREE.Matrix4().multiplyMatrices(inverse, source.matrixWorld);
      return { sampler, area, matrix, normalMatrix: new THREE.Matrix3().getNormalMatrix(matrix) };
    });
    const total = entries.reduce((sum, entry) => sum + entry.area, 0) || 1;
    const position = new THREE.Vector3();
    const normal = new THREE.Vector3();
    let index = 0;
    // 打乱顺序：instanceCount 截取前 N 个时也是均匀分布
    const order = new Uint32Array(MAX_SCALES);
    for (let i = 0; i < MAX_SCALES; i += 1) order[i] = i;
    for (let i = MAX_SCALES - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    entries.forEach((entry, k) => {
      const count = k === entries.length - 1 ? MAX_SCALES - index : Math.round((entry.area / total) * MAX_SCALES);
      for (let i = 0; i < count && index < MAX_SCALES; i += 1, index += 1) {
        entry.sampler.sample(position, normal);
        position.applyMatrix4(entry.matrix);
        normal.applyMatrix3(entry.normalMatrix).normalize();
        const slot = order[index];
        roots.set([position.x, position.y, position.z], slot * 3);
        normals.set([normal.x, normal.y, normal.z], slot * 3);
        rands.set([Math.random(), Math.random(), Math.random(), 1], slot * 4);
      }
    });
    sampled = index;
    geometry.attributes.aScaleRoot.needsUpdate = true;
    geometry.attributes.aScaleNormal.needsUpdate = true;
    geometry.attributes.aScaleRand.needsUpdate = true;
    // 波要走到最远的鳞片才算结束
    const box = new THREE.Box3();
    for (let i = 0; i < sampled; i += 1) box.expandByPoint(position.fromArray(roots, i * 3));
    farthest = box.getSize(position).length() + 0.2;
    syncCount();
  }

  function syncCount() {
    geometry.instanceCount = Math.min(sampled, Math.round(options.density));
  }

  function syncUniforms() {
    scaleUniforms.uScaleSize.value = options.size;
    scaleUniforms.uScaleLift.value = options.lift;
    scaleUniforms.uScaleTwist.value = options.twist;
    scaleUniforms.uScaleCurl.value = options.curl;
    scaleUniforms.uScaleRadial.value = options.flow === "radial" ? 1 : 0;
    scaleUniforms.uScaleBand.value = 0.16;
  }

  function syncVisibility() {
    mesh.visible = enabled && !hidden;
    scaleUniforms.uScaleOn.value = enabled ? 1 : 0;
    waveUniforms.uWaveOn.value = enabled && wave ? 1 : 0;
  }

  // 波的方向交替：第 1、3… 次从起始色变到目标色，第 2、4… 次变回来
  function colorsFor(index) {
    return index % 2 === 0 ? [options.colorFrom, options.colorTo] : [options.colorTo, options.colorFrom];
  }

  function play(center, now) {
    const [from, to] = colorsFor(waves);
    scaleUniforms.uScaleFrom.value.setRGB(...from);
    scaleUniforms.uScaleTo.value.setRGB(...to);
    waveUniforms.uWaveColor.value.setRGB(...to);
    // 第一次保留材质原色；之后从上一次换好的颜色开始
    waveUniforms.uWaveBase.value.setRGB(...from);
    waveUniforms.uWaveBaseMix.value = waves > 0 ? 1 : 0;
    scaleUniforms.uScaleCenter.value.copy(center);
    wave = { start: now, frozen: null };
    waves += 1;
    syncVisibility();
  }

  // 每帧：推进波前
  function update(now) {
    if (!wave) {
      scaleUniforms.uScaleRadius.value = -10;
      return;
    }
    const band = scaleUniforms.uScaleBand.value;
    const end = farthest + band * 3;
    const radius = wave.frozen !== null ? wave.frozen * end : Math.min((now - wave.start) * options.speed, end);
    scaleUniforms.uScaleRadius.value = radius;
    // 车身在波前稍后一点换色，接缝藏在鳞片下面
    waveUniforms.uWaveRadius.value = radius - band * 0.4;
  }

  return {
    mesh,
    options,
    get enabled() {
      return enabled;
    },
    get playing() {
      return Boolean(wave);
    },
    // 当前波的进度 0–1（没有波时为 null）
    progress(now) {
      if (!wave) return null;
      const end = farthest + scaleUniforms.uScaleBand.value * 3;
      return wave.frozen !== null ? wave.frozen : Math.min(((now - wave.start) * options.speed) / end, 1);
    },
    scatter,
    update,
    play,
    // 把当前波停在某个进度（0–1），方便截图看某一刻；传 null 恢复播放
    freeze(fraction, now) {
      if (!wave) return;
      if (fraction === null) {
        const end = farthest + scaleUniforms.uScaleBand.value * 3;
        wave.start = now - ((wave.frozen ?? 0) * end) / options.speed;
        wave.frozen = null;
      } else wave.frozen = THREE.MathUtils.clamp(fraction, 0, 1);
    },
    setEnabled(on) {
      enabled = Boolean(on);
      if (!enabled) {
        wave = null;
        waves = 0;
      }
      syncVisibility();
    },
    // 体素化 / 通道查看时不画鳞片
    setHidden(value) {
      hidden = Boolean(value);
      syncVisibility();
    },
    setRender(nprOn) {
      mesh.material = nprOn ? nprMaterial : pbrMaterial;
    },
    setOptions(next) {
      Object.assign(options, next);
      syncCount();
      syncUniforms();
    },
  };
}

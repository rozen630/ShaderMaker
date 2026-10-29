// NPR 渲染模式：与 PBR 共用同一份材质数据（底色 / ORM / 法线 / 自发光），只换光照模型。
// 实现：给 MeshToonMaterial 打补丁，灯光（含阴影）只累计「受光量」，最后统一分阶、上阴影色、
// 加硬高光 / 边缘光 / 分阶金属反射；描边用沿顶点方向外扩的背面外壳。
import * as THREE from "three";

export const nprPresets = {
  cel: {
    id: "cel",
    name: "赛璐璐",
    keys: ["赛璐璐", "卡通", "cel", "toon", "三渲二", "npr"],
    steps: 1,
    threshold: 0.3,
    softness: 0.01,
    shadowLevel: 0.5,
    shadowHue: 0.45,
    specSize: 0.8,
    specStrength: 1,
    rim: 0,
    rimWidth: 0.3,
    outline: 0.018,
    outlineTint: 0,
  },
  anime: {
    id: "anime",
    name: "二次元",
    keys: ["二次元", "动漫", "日系", "anime"],
    steps: 1,
    threshold: 0.26,
    softness: 0.05,
    shadowLevel: 0.64,
    shadowHue: 0.8,
    specSize: 1,
    specStrength: 0.85,
    rim: 0.55,
    rimWidth: 0.26,
    outline: 0.011,
    outlineTint: 0.8,
  },
  painterly: {
    id: "painterly",
    name: "厚涂",
    keys: ["厚涂", "painterly", "stylized"],
    steps: 3,
    threshold: 0.16,
    softness: 0.14,
    shadowLevel: 0.42,
    shadowHue: -0.45,
    specSize: 1.3,
    specStrength: 0.6,
    rim: 0.25,
    rimWidth: 0.4,
    outline: 0,
    outlineTint: 0.5,
  },
};

export const defaultNprPreset = "anime";

export const nprSliders = [
  { section: "明暗", key: "steps", label: "色阶", min: 1, max: 4, step: 1 },
  { key: "threshold", label: "明暗交界", min: 0, max: 0.9, step: 0.01 },
  { key: "softness", label: "交界软硬", min: 0, max: 0.3, step: 0.005 },
  { key: "shadowLevel", label: "阴影亮度", min: 0, max: 1, step: 0.01 },
  { key: "shadowHue", label: "阴影冷暖", min: -1, max: 1, step: 0.01 },
  { section: "高光与轮廓", key: "specSize", label: "高光大小", min: 0.2, max: 2.5, step: 0.01 },
  { key: "specStrength", label: "高光强度", min: 0, max: 2, step: 0.01 },
  { key: "rim", label: "边缘光", min: 0, max: 1.5, step: 0.01 },
  { key: "rimWidth", label: "边缘光宽度", min: 0.05, max: 0.8, step: 0.01 },
  { key: "outline", label: "描边粗细", min: 0, max: 0.04, step: 0.001 },
  { key: "outlineTint", label: "描边染色", min: 0, max: 1, step: 0.01 },
];

const parsFragment = /* glsl */ `
varying vec3 vViewPosition;

uniform float uSteps;
uniform float uThreshold;
uniform float uSoftness;
uniform vec3 uShadowTint;
uniform float uLightRef;
uniform vec3 uKeyDirView;
uniform float uOtherLightWeight;
uniform float uInverseTone;
uniform float uToneExposure;
uniform float uSpecSize;
uniform float uSpecStrength;
uniform float uRimWidth;
uniform float uNprRoughness;
uniform float uNprMetal;
uniform float uNprCoat;
uniform float uNprRim;
uniform vec3 uNprRimColor;
uniform float uNprIrid;
uniform float uUseOrm;
uniform sampler2D tOrm;

float nprRough = 1.0;
float nprMetal = 0.0;
float nprLight = 0.0;
float nprSpec = 0.0;
float nprCoat = 0.0;
vec3 nprLightColor = vec3(0.0);

// 「仅模型」模式下画面整体仍走 ACES：先输出 ACES 的反函数，经过色调映射后正好还原设计好的平涂色
vec3 nprInverseACES(vec3 y) {
  const mat3 ACESInputMat = mat3(
    vec3(0.59719, 0.07600, 0.02840),
    vec3(0.35458, 0.90834, 0.13383),
    vec3(0.04823, 0.01566, 0.83777)
  );
  const mat3 ACESOutputMat = mat3(
    vec3(1.60475, -0.10208, -0.00327),
    vec3(-0.53108, 1.10813, -0.07276),
    vec3(-0.07367, -0.00605, 1.07602)
  );
  vec3 w = clamp(inverse(ACESOutputMat) * clamp(y, 0.0, 1.0), 0.0, 0.99);
  vec3 a = 1.0 - 0.983729 * w;
  vec3 b = 0.0245786 - 0.4329510 * w;
  vec3 c = -(0.000090537 + 0.238081 * w);
  vec3 v = (-b + sqrt(max(b * b - 4.0 * a * c, 0.0))) / (2.0 * a);
  return max(inverse(ACESInputMat) * v, 0.0) * 0.6 / max(uToneExposure, 1e-3);
}

struct ToonMaterial {
  vec3 diffuseColor;
};

// 第一条明暗交界在 uThreshold，之后每 1/uSteps 一阶
float nprBands(float lit) {
  float x = clamp(lit, 0.0, 1.0) * uSteps + 0.5 - uThreshold * uSteps;
  float q = floor(x) + smoothstep(0.5 - uSoftness, 0.5 + uSoftness, fract(x));
  return clamp(q / uSteps, 0.0, 1.0);
}

void RE_Direct_Toon(const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in ToonMaterial material, inout ReflectedLight reflectedLight) {
  // directLight.color 已乘过阴影，所以阴影里 strength 自然为 0
  float strength = dot(directLight.color, vec3(0.299, 0.587, 0.114)) / max(uLightRef, 1e-3);
  // 明暗由主光决定：按方向认出主光，补光 / 点光只给少量权重，不去改场景灯光本身
  float isKey = step(0.9995, dot(directLight.direction, uKeyDirView));
  strength *= mix(uOtherLightWeight, 1.0, isKey);
  float ndl = dot(geometryNormal, directLight.direction);
  nprLight += max(ndl, 0.0) * strength;
  nprLightColor += directLight.color * max(ndl, 0.0);
  vec3 h = normalize(directLight.direction + geometryViewDir);
  float nh = max(dot(geometryNormal, h), 0.0);
  float edge = 1.0 - mix(0.006, 0.11, nprRough) * uSpecSize;
  float soft = uSoftness * 0.25 + 0.002;
  nprSpec += smoothstep(edge - soft, edge + soft, nh) * strength * step(0.0, ndl);
  nprCoat += smoothstep(0.988, 0.992, nh) * strength * step(0.0, ndl);
}

void RE_IndirectDiffuse_Toon(const in vec3 irradiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in ToonMaterial material, inout ReflectedLight reflectedLight) {}

#define RE_Direct RE_Direct_Toon
#define RE_IndirectDiffuse RE_IndirectDiffuse_Toon
`;

const ormFragment = /* glsl */ `
#include <emissivemap_fragment>
nprRough = uNprRoughness;
nprMetal = uNprMetal;
#ifdef USE_MAP
  if (uUseOrm > 0.5) {
    vec3 nprOrm = texture2D(tOrm, vMapUv).rgb;
    nprRough *= nprOrm.g;
    nprMetal *= nprOrm.b;
  }
#endif
`;

const composeFragment = /* glsl */ `
vec3 nprBase = diffuseColor.rgb;
float nprBand = nprBands(nprLight);
vec3 nprShade = mix(nprBase * uShadowTint, nprBase, nprBand);
#ifdef USE_AOMAP
  float nprAo = (texture2D(aoMap, vAoMapUv).r - 1.0) * aoMapIntensity + 1.0;
  nprShade *= mix(1.0, nprAo, 0.7);
#endif
// 金属：按世界空间反射方向分天空 / 地平线 / 地面三段，代替 HDR 反射
vec3 nprReflect = inverseTransformDirection(reflect(-geometryViewDir, geometryNormal), viewMatrix);
float nprSoft = uSoftness + 0.01;
float nprSky = smoothstep(0.12 - nprSoft, 0.12 + nprSoft, nprReflect.y);
float nprGround = smoothstep(-0.22 + nprSoft, -0.22 - nprSoft, nprReflect.y);
float nprTone = mix(mix(0.3, 1.15, nprSky), 0.62, nprGround);
vec3 nprMetalShade = nprBase * nprTone * mix(0.55, 1.0, nprBand);
nprShade = mix(nprShade, nprMetalShade, nprMetal);
vec3 nprTint = nprLightColor / max(max(nprLightColor.r, max(nprLightColor.g, nprLightColor.b)), 1e-3);
float nprSpecAmount = pow(1.0 - nprRough, 1.5) * uSpecStrength * min(nprSpec, 1.0);
nprShade += mix(vec3(1.0), nprBase, nprMetal) * nprTint * nprSpecAmount;
nprShade += vec3(min(nprCoat, 1.0) * uNprCoat);
float nprFresnel = 1.0 - max(dot(geometryNormal, geometryViewDir), 0.0);
float nprRimMask = smoothstep(1.0 - uRimWidth, 1.0 - uRimWidth + 0.04 + uSoftness, nprFresnel);
vec3 nprRainbow = 0.5 + 0.5 * cos(6.2831 * (nprFresnel * 1.4 + vec3(0.0, 0.33, 0.67)));
vec3 nprRimColor = mix(uNprRimColor, nprRainbow, uNprIrid);
nprShade += nprRimColor * nprRimMask * uNprRim * (0.35 + 0.65 * nprBand);
vec3 outgoingLight = nprShade + totalEmissiveRadiance;
if (uInverseTone > 0.5) outgoingLight = nprInverseACES(outgoingLight);
`;

// 描边外扩方向：同一位置的顶点共用平均法线，硬边 / 拆 UV 处不会裂开，凹面也不会错位
export function computeOutlineNormals(geometry) {
  const position = geometry.attributes.position;
  const normal = geometry.attributes.normal;
  const sums = new Map();
  const keyOf = (i) =>
    `${Math.round(position.getX(i) * 1e4)},${Math.round(position.getY(i) * 1e4)},${Math.round(position.getZ(i) * 1e4)}`;
  const n = new THREE.Vector3();
  for (let i = 0; i < position.count; i += 1) {
    const key = keyOf(i);
    const sum = sums.get(key) || new THREE.Vector3();
    sum.add(n.fromBufferAttribute(normal, i));
    sums.set(key, sum);
  }
  const out = new Float32Array(position.count * 3);
  for (let i = 0; i < position.count; i += 1) {
    const sum = sums.get(keyOf(i));
    n.copy(sum).normalize();
    out.set([n.x, n.y, n.z], i * 3);
  }
  geometry.setAttribute("outlineNormal", new THREE.BufferAttribute(out, 3));
}

function lumaOf(color) {
  return color.r * 0.299 + color.g * 0.587 + color.b * 0.114;
}

export function createNpr() {
  const globals = {
    uSteps: { value: 1 },
    uThreshold: { value: 0.3 },
    uSoftness: { value: 0.02 },
    uShadowTint: { value: new THREE.Color(0.5, 0.5, 0.6) },
    uLightRef: { value: 0.5 },
    uKeyDirView: { value: new THREE.Vector3(0, 1, 0) },
    uOtherLightWeight: { value: 0.25 },
    uInverseTone: { value: 0 },
    uToneExposure: { value: 1 },
    uSpecSize: { value: 1 },
    uSpecStrength: { value: 1 },
    uRimWidth: { value: 0.3 },
  };
  const outlineWidth = { value: 0.015 };
  const values = { ...nprPresets[defaultNprPreset] };
  const outlines = [];
  let outlinesOn = false;

  function makeMaterial(options = {}) {
    const local = {
      uNprRoughness: { value: 1 },
      uNprMetal: { value: 0 },
      uNprCoat: { value: 0 },
      uNprRim: { value: 0 },
      uNprRimColor: { value: new THREE.Color(1, 1, 1) },
      uNprIrid: { value: 0 },
      uUseOrm: { value: 0 },
      tOrm: { value: null },
    };
    const material = new THREE.MeshToonMaterial(options);
    material.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, globals, local);
      shader.fragmentShader = shader.fragmentShader
        .replace("#include <lights_toon_pars_fragment>", parsFragment)
        .replace("#include <emissivemap_fragment>", ormFragment)
        .replace(
          "vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + totalEmissiveRadiance;",
          composeFragment
        );
    };
    material.customProgramCacheKey = () => "shadermaker-npr-1";
    material.userData.npr = local;
    return material;
  }

  // 外扩方向用 outlineNormal（同位置顶点的平均法线），任意形状都不会裂开或错位
  // stencil：主体写模板 1，外壳只画在模板外，半透明主体（玻璃）也不会透出背面外壳
  // source：外壳对应的 NPR 材质（主体平时挂的是 PBR 材质，所以要显式传）
  function makeOutline(target, { source = target.material, stencil = false, color = 0x000000 } = {}) {
    const material = new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.BackSide, toneMapped: false });
    if (stencil) {
      source.stencilWrite = true;
      source.stencilRef = 1;
      source.stencilZPass = THREE.ReplaceStencilOp;
      material.stencilWrite = true;
      material.stencilRef = 1;
      material.stencilFunc = THREE.NotEqualStencilFunc;
      material.transparent = true;
    }
    material.onBeforeCompile = (shader) => {
      shader.uniforms.uOutline = outlineWidth;
      shader.vertexShader = shader.vertexShader
        .replace("void main() {", "uniform float uOutline;\nattribute vec3 outlineNormal;\nvoid main() {")
        // 除以模型缩放，让描边在世界空间里粗细一致（Shader Ball 被缩小了好几倍）
        .replace(
          "#include <begin_vertex>",
          "vec3 transformed = position + outlineNormal * (uOutline / max(length(modelMatrix[0].xyz), 1e-4));"
        );
    };
    material.customProgramCacheKey = () => "shadermaker-outline-2";
    if (!target.geometry.attributes.outlineNormal) computeOutlineNormals(target.geometry);
    const hull = new THREE.Mesh(target.geometry, material);
    hull.userData.source = source;
    hull.visible = false;
    hull.renderOrder = stencil ? 1 : 0;
    hull.userData.baseColor = new THREE.Color(color);
    target.add(hull);
    outlines.push({ target, hull });
    return hull;
  }

  function removeOutlines(predicate) {
    for (let i = outlines.length - 1; i >= 0; i -= 1) {
      const { target, hull } = outlines[i];
      if (!predicate(target)) continue;
      hull.parent?.remove(hull);
      hull.material.dispose();
      outlines.splice(i, 1);
    }
  }

  function syncOutlineColors() {
    for (const { hull } of outlines) {
      hull.material.color.copy(hull.userData.baseColor).multiplyScalar(0.3 * values.outlineTint);
    }
  }

  function setValues(next) {
    Object.assign(values, next);
    globals.uSteps.value = values.steps;
    globals.uThreshold.value = values.threshold;
    globals.uSoftness.value = values.softness;
    globals.uSpecSize.value = values.specSize;
    globals.uSpecStrength.value = values.specStrength;
    globals.uRimWidth.value = values.rimWidth;
    outlineWidth.value = values.outline;
    setOutlinesVisible(outlinesOn);
    const neutral = new THREE.Color(1, 1, 1);
    const side = values.shadowHue >= 0 ? new THREE.Color(0.55, 0.62, 1) : new THREE.Color(1, 0.64, 0.5);
    const tint = neutral.lerp(side, Math.abs(values.shadowHue));
    tint.multiplyScalar(values.shadowLevel / Math.max(lumaOf(tint), 1e-3));
    globals.uShadowTint.value.copy(tint);
    syncOutlineColors();
  }

  // PBR → NPR 转换规则：金属→分阶反射，粗糙度→高光大小/强度，清漆→硬白点，
  // Sheen / 透射→边缘光，虹彩 / 色散→彩虹边缘光，透射→半透明
  function applyPhysical(material, params, { useOrm = false, ormTexture = null, outlineColor = null, rimScale = 1 } = {}) {
    const local = material.userData.npr;
    local.uNprRoughness.value = params.uRoughness;
    local.uNprMetal.value = params.uMetalness;
    local.uNprCoat.value = params.uClearcoat * (1 - params.uClearcoatRoughness) * 0.9;
    local.uNprRim.value = (values.rim + params.uSheen * 0.6 + params.uTransmission * 1.1) * rimScale;
    const rimColor = local.uNprRimColor.value.setRGB(1, 1, 1);
    if (params.uSheen > 0.05) rimColor.lerp(new THREE.Color().setRGB(...params.uSheenColor), Math.min(params.uSheen, 1));
    if (params.uTransmission > 0.05) rimColor.lerp(new THREE.Color().setRGB(...params.uAttenuationColor), 0.4);
    local.uNprIrid.value = Math.min(1, params.uIridescence + params.uDispersion * 0.8);
    local.uUseOrm.value = useOrm ? 1 : 0;
    local.tOrm.value = ormTexture;
    material.transparent = params.uTransmission > 0.05;
    material.opacity = 1 - params.uTransmission * 0.72;
    material.depthWrite = !material.transparent;
    if (outlineColor) {
      for (const { hull } of outlines) {
        if (hull.userData.source === material) hull.userData.baseColor.copy(outlineColor);
      }
      syncOutlineColors();
    }
  }

  function setLightReference(light) {
    globals.uLightRef.value = Math.max(lumaOf(light.color) * light.intensity, 0.05);
  }

  // 每帧调用：主光在观察空间的方向（与 three 传给 directLight.direction 的算法一致）
  const lightPos = new THREE.Vector3();
  const targetPos = new THREE.Vector3();
  function updateKeyLight(light, camera) {
    lightPos.setFromMatrixPosition(light.matrixWorld);
    targetPos.setFromMatrixPosition(light.target.matrixWorld);
    globals.uKeyDirView.value.copy(lightPos.sub(targetPos)).transformDirection(camera.matrixWorldInverse);
  }

  function setInverseTone(enabled, exposure) {
    globals.uInverseTone.value = enabled ? 1 : 0;
    globals.uToneExposure.value = exposure;
  }

  // visible：布尔，或 (target) => 布尔，用来区分主体和展台的描边
  function setOutlinesVisible(visible) {
    outlinesOn = visible;
    for (const { target, hull } of outlines) {
      const on = typeof visible === "function" ? visible(target) : visible;
      hull.geometry = target.geometry;
      hull.visible = on && values.outline > 0.0005;
    }
  }

  setValues(values);

  return {
    values,
    makeMaterial,
    makeOutline,
    removeOutlines,
    setValues,
    applyPhysical,
    setLightReference,
    updateKeyLight,
    setInverseTone,
    setOutlinesVisible,
  };
}

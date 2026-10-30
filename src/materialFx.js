// 材质附加效果（写实 PBR 与卡通 NPR 主体材质都打，依赖 triplanar.js 提供的展示空间位置 / 法线）：
// - 次表面散射（uSss）：近似光线透进材质再散出来——背光处透亮、边缘发光（公式同 three.js 官方 SSS 示例）。
//   加在自发光上而不是漫反射上，这样透射（transmission）高的冰 / 宝石也不会把它混掉。只算光照，不需要细分。
// - 积雪（uSnow）：朝上的面盖雪，按展示空间法线 + 噪声决定雪线，雪里带闪烁的冰晶；任何材质都能叠。
//   展示模型做过细分（models.js 的 densify），雪按 uSnowDepth 真的把顶点往外推，光照跟着雪堆起伏。
// - 置换（uDisplace）：Surface Shader 的高度存在 ORM 贴图的 alpha，顶点着色器按三向投影读出来真的把表面推出去
//   （砖缝凹进去、石头鼓起来）；同样沿平均法线推，接缝不裂。
// - 冰下碎冰（uIceLayers）：视差层——在表面下几个深度各画一层缓慢漂移的碎冰板，转动视角能看出纵深。
// 卡通（toon）版：光照部分改成分阶——次表面散射变成背光处一条透亮的色带，雪的粗糙 / 金属写进 NPR 的高光参数。
// 体素：每块按块中心和它所在表面的法线算一次——置换把方块沿表面朝向整列拉长（按体素尺寸取整，保持方块感），
//   积雪的块整块变白，雪厚的地方往上多长几格；冰下碎冰按块取色。
// 顶点外推的部分（fxVertex）还要打在描边外壳、阴影、滤镜的遮罩 / 法线深度上（applyFxVertex），形状才一致。
import * as THREE from "three";
import { triplanarUniforms } from "./triplanar.js";

export const materialFxUniforms = {
  uSss: { value: 0 },
  uSssColor: { value: new THREE.Color(1, 1, 1) },
  uSnow: { value: 0 },
  uSnowDepth: { value: 0.05 },
  uDisplace: { value: 0 },
  tDisplace: { value: null },
  // 体素边长（体素网格自身坐标），体素化时更新
  uVoxelSize: { value: 0.03 },
  uSnowColor: { value: new THREE.Color(0.95, 0.97, 1.0) },
  uIceLayers: { value: 0 },
  uIceDeepColor: { value: new THREE.Color(0.02, 0.12, 0.2) },
  uIcePlateColor: { value: new THREE.Color(0.55, 0.8, 0.92) },
  // uFxTime：真实时间（冰晶闪烁）；uFxFlow：跟着速度滑条走的时间（冰下漂移）
  uFxTime: { value: 0 },
  uFxFlow: { value: 0 },
};

// 顶点 / 片元共用
const common = /* glsl */ `
uniform float uSnow;

float fxHash(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

float fxNoise(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(fxHash(i), fxHash(i + vec3(1, 0, 0)), f.x), mix(fxHash(i + vec3(0, 1, 0)), fxHash(i + vec3(1, 1, 0)), f.x), f.y),
    mix(mix(fxHash(i + vec3(0, 0, 1)), fxHash(i + vec3(1, 0, 1)), f.x), mix(fxHash(i + vec3(0, 1, 1)), fxHash(i + vec3(1, 1, 1)), f.x), f.y),
    f.z
  );
}

// 积雪遮罩：朝上（展示空间 +Y）的面积雪，雪线用噪声打散
float snowMaskAt(vec3 p, vec3 n) {
  if (uSnow <= 0.001) return 0.0;
  float nz = fxNoise(p * 7.0) * 0.6 + fxNoise(p * 23.0) * 0.4;
  float line = 1.0 - uSnow * 1.6;
  return smoothstep(line, line + 0.18, n.y + (nz - 0.5) * 0.45);
}

// 雪的厚度起伏（0–1）：大团 + 小颗粒
float snowHeight(vec3 p, float mask) {
  return mask * (0.55 + 0.35 * fxNoise(p * 9.0) + 0.1 * fxNoise(p * 31.0));
}
`;

// 顶点部分：主体材质、描边外壳、阴影深度、滤镜遮罩共用，保证推出去的形状处处一致
const vertexDecl = /* glsl */ `
uniform float uSnowDepth;
uniform float uDisplace;
uniform float uTriScale;
uniform float uVoxelSize;
uniform sampler2D tDisplace;
attribute vec3 outlineNormal;
varying float vFxVoxelSnow;
varying vec3 vFxVoxelCenter;
varying vec3 vFxVoxelEye;
#ifdef USE_INSTANCING
attribute vec3 voxelNormal;
#ifndef FX_HAS_VOXEL_UV
attribute vec2 voxelUv;
#endif
#endif
${common}
`;

// 接在 begin_vertex 之后（已有 transformed）。
// 普通网格：沿 outlineNormal（同一位置顶点的平均法线）外推，UV 接缝处的重复顶点推得一样远，不会裂开。
// 体素：只有带 voxelNormal 的材质体素才动（校色件体素没有这个属性，读到 0）。
const vertexBody = /* glsl */ `
vFxVoxelSnow = 0.0;
vFxVoxelCenter = vec3(0.0);
vFxVoxelEye = vec3(0.0, 0.0, -1.0);
{
  mat4 fxModel = uTriDisplayInverse * modelMatrix;
  float fxScale = length(fxModel[0].xyz);
#ifndef USE_INSTANCING
  if ((uDisplace > 0.0 || (uSnow > 0.001 && uSnowDepth > 0.0)) && dot(outlineNormal, outlineNormal) > 0.5) {
    vec3 fxPos = (fxModel * vec4(position, 1.0)).xyz;
    vec3 fxN = normalize(mat3(fxModel) * outlineNormal);
    float fxPush = snowHeight(fxPos, snowMaskAt(fxPos, fxN)) * uSnowDepth;
    if (uDisplace > 0.0) {
      // 和片元的 triSample 一样的三向投影，权重用平均法线，保证同一位置的顶点读到同一个高度
      vec3 w = pow(abs(fxN), vec3(4.0));
      w /= w.x + w.y + w.z;
      vec3 tp = fxPos * uTriScale;
      float h = texture2D(tDisplace, tp.zy).a * w.x + texture2D(tDisplace, tp.xz).a * w.y + texture2D(tDisplace, tp.xy).a * w.z;
      fxPush += (h - 0.5) * 2.0 * uDisplace;
    }
    transformed += normalize(outlineNormal) * fxPush / fxScale;
  }
#else
  if (dot(voxelNormal, voxelNormal) > 0.5) {
    vec4 fxWorldCenter = modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
    vec3 fxCenter = (uTriDisplayInverse * fxWorldCenter).xyz;
    vec3 fxN = normalize(mat3(fxModel) * voxelNormal);
    float fxCell = max(uVoxelSize * fxScale, 1e-4);
    float fxSnowBlock = step(0.5, snowMaskAt(fxCenter, fxN));
    vFxVoxelSnow = fxSnowBlock;
    vFxVoxelCenter = fxCenter;
    vFxVoxelEye = mat3(uTriDisplayInverse) * (fxWorldCenter.xyz - cameraPosition);
    // 置换：沿表面朝向最接近的坐标轴把方块拉长整数格（只往外长，凹的部分保持原位，壳不会破洞）
    vec3 fxA = abs(voxelNormal);
    vec3 fxAxis = fxA.x > fxA.y && fxA.x > fxA.z ? vec3(sign(voxelNormal.x), 0.0, 0.0)
      : fxA.y > fxA.z ? vec3(0.0, sign(voxelNormal.y), 0.0) : vec3(0.0, 0.0, sign(voxelNormal.z));
    float fxSteps = 0.0;
    if (uDisplace > 0.0) {
      float h = texture2D(tDisplace, voxelUv).a * 2.0 - 1.0;
      fxSteps = floor(max(h, 0.0) * 2.0 * uDisplace / fxCell + 0.5);
    }
    // 积雪：朝上的块按雪厚往上多长几格；侧面只变白不长，否则会竖起一条条白柱
    float fxSnowSteps = floor(snowHeight(fxCenter, fxSnowBlock) * uSnowDepth / fxCell + 0.5) * step(0.6, fxN.y);
    if (dot(position, fxAxis) > 0.0) transformed += fxAxis * fxSteps * uVoxelSize;
    if (position.y > 0.0) transformed.y += fxSnowSteps * uVoxelSize;
#ifdef FX_VOXEL_FACE
    // 拉长后的面按格子重新分块，描边压暗仍然一格一格
    vec3 fxFace = transformed / uVoxelSize + 0.5;
    vec3 fxFaceN = abs(normal);
    vVoxelFace = fxFaceN.x > 0.5 ? fxFace.zy : fxFaceN.y > 0.5 ? fxFace.xz : fxFace.xy;
#endif
  }
#endif
}
`;

const vertexDisplace = `#include <begin_vertex>\n${vertexBody}`;

// 给不是主体材质的材质（描边外壳、阴影深度、滤镜遮罩、法线深度、通道查看）也打上同样的外推；
// declareTri：着色器里还没有 uTriDisplayInverse 时由这里声明
export function applyFxVertex(material, { declareTri = true } = {}) {
  const previous = material.onBeforeCompile;
  const previousKey = material.customProgramCacheKey;
  material.onBeforeCompile = (shader, renderer) => {
    Object.assign(shader.uniforms, materialFxUniforms, triplanarUniforms);
    // 先挂在 begin_vertex 后面，之后的补丁替换 begin_vertex 时会保留这段
    shader.vertexShader = shader.vertexShader.replace("#include <begin_vertex>", vertexDisplace);
    previous.call(material, shader, renderer);
    shader.vertexShader = shader.vertexShader.replace(
      "void main() {",
      `${declareTri ? "uniform mat4 uTriDisplayInverse;\n" : ""}${vertexDecl}\nvoid main() {`
    );
  };
  material.customProgramCacheKey = () => `${previousKey.call(material)}-fxv-1`;
  material.needsUpdate = true;
}

const fragmentHead = /* glsl */ `
uniform float uSss;
uniform vec3 uSssColor;
uniform vec3 uSnowColor;
uniform float uIceLayers;
uniform vec3 uIceDeepColor;
uniform vec3 uIcePlateColor;
uniform float uFxTime;
uniform float uFxFlow;
varying float vFxVoxelSnow;
varying vec3 vFxVoxelCenter;
varying vec3 vFxVoxelEye;
${common}

// 体素整块一个结果（顶点里按块中心算好），普通网格逐像素
float snowMask() {
  if (vTriInstanced > 0.5) return vFxVoxelSnow;
  return snowMaskAt(vTriPos, normalize(vTriNormal));
}

// 3D Voronoi：x = 到最近点，y = 第二近 - 最近（到格子边缘），z = 格子 id
vec3 fxCells(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  float d1 = 8.0;
  float d2 = 8.0;
  float id = 0.0;
  for (int z = -1; z <= 1; z++)
  for (int y = -1; y <= 1; y++)
  for (int x = -1; x <= 1; x++) {
    vec3 g = vec3(float(x), float(y), float(z));
    vec3 o = vec3(fxHash(i + g), fxHash(i + g + 31.7), fxHash(i + g + 71.3));
    float d = length(g + o - f);
    if (d < d1) { d2 = d1; d1 = d; id = fxHash(i + g + 13.1); }
    else if (d < d2) { d2 = d; }
  }
  return vec3(d1, d2 - d1, id);
}

// 冰下碎冰：沿视线往里走几层，每层是一片缓慢漂移的碎冰板（白色压力脊边缘 + 气泡），越深越暗越蓝
// base / eyeDir：起点和视线（体素用块中心，整块一个颜色）；facing：视线和表面的夹角，越斜层越拉开
vec3 iceLayers(vec3 base, vec3 eyeDir, float facing) {
  vec3 eye = normalize(eyeDir);
  vec3 col = uIceDeepColor;
  for (int k = 0; k < 3; k++) {
    float depth = (float(k) + 1.0) * 0.07;
    vec3 p = base + eye * depth / facing;
    p += vec3(uFxFlow * 0.02, 0.0, uFxFlow * 0.013) * (1.0 + float(k) * 0.4);
    vec3 c = fxCells(p * (5.0 + float(k) * 1.5) + float(k) * 7.3);
    // 约一半格子是浮冰板，其余是黑水
    float plate = step(0.45, c.z);
    float ridge = 1.0 - smoothstep(0.02, 0.09, c.y);
    float body = smoothstep(0.0, 0.25, c.y) * (0.55 + 0.45 * fxNoise(p * 30.0));
    float fade = 1.0 - float(k) * 0.3;
    vec3 layer = mix(uIceDeepColor, uIcePlateColor, plate * body * 0.75 + ridge * plate);
    float bubbles = step(0.93, fxNoise(p * 90.0)) * plate;
    layer += vec3(0.9) * bubbles * 0.4;
    col = mix(col, layer, fade * (plate * 0.85 + ridge * 0.4));
  }
  return col;
}
`;

const afterMap = /* glsl */ `
#include <map_fragment>
if (uIceLayers > 0.001) {
  // 贴图里亮的部分（裂缝、霜、气泡）留在表面，暗的部分透出冰下的层
  float surfaceMask = smoothstep(0.3, 0.75, dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114)));
  bool iceVoxel = vTriInstanced > 0.5;
  vec3 iceBase = iceVoxel ? vFxVoxelCenter : vTriPos;
  vec3 iceEye = iceVoxel ? vFxVoxelEye : vTriEye;
  float iceFacing = iceVoxel ? 0.7 : max(dot(-normalize(vTriEye), normalize(vTriNormal)), 0.25);
  vec3 below = iceLayers(iceBase, iceEye, iceFacing);
  diffuseColor.rgb = mix(mix(diffuseColor.rgb, below, uIceLayers), diffuseColor.rgb, surfaceMask);
}
float fxSnow = snowMask();
vec3 fxSnowGrain = vTriInstanced > 0.5 ? vFxVoxelCenter : vTriPos;
diffuseColor.rgb = mix(diffuseColor.rgb, uSnowColor * (0.9 + 0.1 * fxNoise(fxSnowGrain * 40.0)), fxSnow);
`;

const afterRoughness = /* glsl */ `
#include <roughnessmap_fragment>
roughnessFactor = mix(roughnessFactor, 0.72, fxSnow);
`;

const afterMetalness = /* glsl */ `
#include <metalnessmap_fragment>
metalnessFactor = mix(metalnessFactor, 0.0, fxSnow);
`;

// 雪面：先盖住底下材质的法线细节，再按雪的厚度起伏做凹凸（和顶点外推同一个高度场）
const afterNormal = /* glsl */ `
#include <normal_fragment_maps>
normal = normalize(mix(normal, nonPerturbedNormal, fxSnow * 0.85));
// 体素是平的方块，不做雪面凹凸
if (fxSnow > 0.001 && vTriInstanced < 0.5) {
  float h = snowHeight(vTriPos, fxSnow) * 0.05;
  vec3 dpx = dFdx(-vViewPosition);
  vec3 dpy = dFdy(-vViewPosition);
  vec3 r1 = cross(dpy, normal);
  vec3 r2 = cross(normal, dpx);
  float det = dot(dpx, r1);
  vec3 grad = sign(det) * (dFdx(h) * r1 + dFdy(h) * r2);
  normal = normalize(abs(det) * normal - grad * 1.5);
}
`;

const afterLights = /* glsl */ `
#include <lights_fragment_end>
{
  // 雪下的材质不再自发光；雪里的冰晶随时间闪烁
  totalEmissiveRadiance *= 1.0 - fxSnow;
  vec3 glintCell = floor(vTriPos * 260.0);
  float glint = step(0.985, fxHash(glintCell)) * pow(0.5 + 0.5 * sin(uFxTime * 2.5 + fxHash(glintCell + 7.0) * 40.0), 12.0);
  totalEmissiveRadiance += vec3(1.0) * glint * fxSnow * 1.5;

  if (uSss > 0.001) {
    vec3 sssLight = vec3(0.0);
    vec3 sssN = normal;
    vec3 sssV = geometryViewDir;
#if NUM_DIR_LIGHTS > 0
    for (int i = 0; i < NUM_DIR_LIGHTS; i++) {
      vec3 sssL = directionalLights[i].direction;
      float back = pow(clamp(dot(sssV, -normalize(sssL + sssN * 0.4)), 0.0, 1.0), 3.0);
      float wrap = clamp((dot(sssN, sssL) + 0.6) / 1.6, 0.0, 1.0);
      sssLight += directionalLights[i].color * (back * 1.6 + wrap * 0.25);
    }
#endif
#if NUM_POINT_LIGHTS > 0
    for (int i = 0; i < NUM_POINT_LIGHTS; i++) {
      vec3 sssL = normalize(pointLights[i].position + vViewPosition);
      float back = pow(clamp(dot(sssV, -normalize(sssL + sssN * 0.4)), 0.0, 1.0), 3.0);
      sssLight += pointLights[i].color * back * 0.6;
    }
#endif
    // 环境光：整体柔和散射 + 边缘透亮
    float rim = pow(1.0 - clamp(dot(sssN, sssV), 0.0, 1.0), 2.0);
    sssLight += iblIrradiance * RECIPROCAL_PI * (0.35 + rim * 1.2);
    totalEmissiveRadiance += uSss * uSssColor * diffuseColor.rgb * sssLight * (1.0 - fxSnow * 0.5);
  }
}
`;

// 卡通：雪的粗糙 / 金属写进 NPR 的高光参数（npr.js 的 ormFragment 挂在 emissivemap_fragment 位置）
const afterEmissiveToon = /* glsl */ `
#include <emissivemap_fragment>
nprRough = mix(nprRough, 0.72, fxSnow);
nprMetal = mix(nprMetal, 0.0, fxSnow);
`;

// 卡通：自发光 / 冰晶同写实；次表面散射分阶——背光处一条透亮色带 + 边缘一圈，再整体轻微提亮暗部
const afterLightsToon = /* glsl */ `
#include <lights_fragment_end>
{
  totalEmissiveRadiance *= 1.0 - fxSnow;
  vec3 glintCell = floor(vTriPos * 260.0);
  float glint = step(0.985, fxHash(glintCell)) * pow(0.5 + 0.5 * sin(uFxTime * 2.5 + fxHash(glintCell + 7.0) * 40.0), 12.0);
  totalEmissiveRadiance += vec3(1.0) * glint * fxSnow * 1.5;

  if (uSss > 0.001) {
    vec3 sssN = normal;
    vec3 sssV = geometryViewDir;
    vec3 sssL = uKeyDirView;
    float back = pow(clamp(dot(sssV, -normalize(sssL + sssN * 0.4)), 0.0, 1.0), 3.0);
    float soft = uSoftness + 0.02;
    float backBand = smoothstep(0.3 - soft, 0.3 + soft, back);
    float rim = 1.0 - clamp(dot(sssN, sssV), 0.0, 1.0);
    float rimBand = smoothstep(0.62 - soft, 0.62 + soft, rim);
    vec3 sssGlow = uSssColor * diffuseColor.rgb * (backBand * 0.8 + rimBand * 0.45 + 0.12);
    totalEmissiveRadiance += uSss * sssGlow * (1.0 - fxSnow * 0.5);
  }
}
`;

// toon：材质是 npr.js 的卡通材质（MeshToonMaterial），光照部分换成分阶版本
export function applyMaterialFx(material, { toon = false } = {}) {
  const previous = material.onBeforeCompile;
  const previousKey = material.customProgramCacheKey;
  material.onBeforeCompile = (shader, renderer) => {
    Object.assign(shader.uniforms, materialFxUniforms);
    // 先挂占位，再交给后面的补丁（triplanar 会把这些 include 展开成三向投影采样）
    shader.vertexShader = shader.vertexShader.replace("#include <begin_vertex>", vertexDisplace);
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <map_fragment>", afterMap)
      .replace("#include <roughnessmap_fragment>", afterRoughness)
      .replace("#include <metalnessmap_fragment>", afterMetalness)
      .replace("#include <emissivemap_fragment>", toon ? afterEmissiveToon : "#include <emissivemap_fragment>")
      .replace("#include <normal_fragment_maps>", afterNormal)
      .replace("#include <lights_fragment_end>", toon ? afterLightsToon : afterLights);
    previous.call(material, shader, renderer);
    // 放在 main 前面（triplanar 的 uniform / varying 声明之后）
    shader.vertexShader = shader.vertexShader.replace("void main() {", `${vertexDecl}\nvoid main() {`);
    shader.fragmentShader = shader.fragmentShader.replace("void main() {", `${fragmentHead}\nvoid main() {`);
  };
  material.customProgramCacheKey = () => `${previousKey.call(material)}-fx-4${toon ? "-toon" : ""}`;
  material.needsUpdate = true;
}

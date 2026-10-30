// 材质附加效果（只打在 PBR 主体材质上，依赖 triplanar.js 提供的展示空间位置 / 法线）：
// - 次表面散射（uSss）：近似光线透进材质再散出来——背光处透亮、边缘发光（公式同 three.js 官方 SSS 示例）。
//   加在自发光上而不是漫反射上，这样透射（transmission）高的冰 / 宝石也不会把它混掉。只算光照，不需要细分。
// - 积雪（uSnow）：朝上的面盖雪，按展示空间法线 + 噪声决定雪线，雪里带闪烁的冰晶；任何材质都能叠。
//   展示模型做过细分（models.js 的 densify），雪按 uSnowDepth 真的把顶点往外推，光照跟着雪堆起伏。
// - 置换（uDisplace）：Surface Shader 的高度存在 ORM 贴图的 alpha，顶点着色器按三向投影读出来真的把表面推出去
//   （砖缝凹进去、石头鼓起来）；同样沿平均法线推，接缝不裂。
// - 冰下碎冰（uIceLayers）：视差层——在表面下几个深度各画一层缓慢漂移的碎冰板，转动视角能看出纵深。
import * as THREE from "three";

export const materialFxUniforms = {
  uSss: { value: 0 },
  uSssColor: { value: new THREE.Color(1, 1, 1) },
  uSnow: { value: 0 },
  uSnowDepth: { value: 0.05 },
  uDisplace: { value: 0 },
  tDisplace: { value: null },
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

const vertexHead = /* glsl */ `
uniform float uSnowDepth;
uniform float uDisplace;
uniform float uTriScale;
uniform sampler2D tDisplace;
attribute vec3 outlineNormal;
${common}
`;

// 沿 outlineNormal（同一位置顶点的平均法线）外推，UV 接缝处的重复顶点推得一样远，不会裂开
const vertexDisplace = /* glsl */ `
#include <begin_vertex>
#ifndef USE_INSTANCING
if ((uDisplace > 0.0 || (uSnow > 0.001 && uSnowDepth > 0.0)) && dot(outlineNormal, outlineNormal) > 0.5) {
  mat4 fxModel = uTriDisplayInverse * modelMatrix;
  vec3 fxPos = (fxModel * vec4(position, 1.0)).xyz;
  vec3 fxN = normalize(mat3(fxModel) * outlineNormal);
  float fxScale = length(fxModel[0].xyz);
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
#endif
`;

const fragmentHead = /* glsl */ `
uniform float uSss;
uniform vec3 uSssColor;
uniform vec3 uSnowColor;
uniform float uIceLayers;
uniform vec3 uIceDeepColor;
uniform vec3 uIcePlateColor;
uniform float uFxTime;
uniform float uFxFlow;
${common}

float snowMask() {
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
vec3 iceLayers(vec3 surface) {
  vec3 eye = normalize(vTriEye);
  vec3 n = normalize(vTriNormal);
  float facing = max(dot(-eye, n), 0.25);
  vec3 col = uIceDeepColor;
  for (int k = 0; k < 3; k++) {
    float depth = (float(k) + 1.0) * 0.07;
    vec3 p = vTriPos + eye * depth / facing;
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
if (uIceLayers > 0.001 && vTriInstanced < 0.5) {
  // 贴图里亮的部分（裂缝、霜、气泡）留在表面，暗的部分透出冰下的层
  float surfaceMask = smoothstep(0.3, 0.75, dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114)));
  vec3 below = iceLayers(diffuseColor.rgb);
  diffuseColor.rgb = mix(mix(diffuseColor.rgb, below, uIceLayers), diffuseColor.rgb, surfaceMask);
}
float fxSnow = snowMask();
diffuseColor.rgb = mix(diffuseColor.rgb, uSnowColor * (0.9 + 0.1 * fxNoise(vTriPos * 40.0)), fxSnow);
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
if (fxSnow > 0.001) {
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

export function applyMaterialFx(material) {
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
      .replace("#include <normal_fragment_maps>", afterNormal)
      .replace("#include <lights_fragment_end>", afterLights);
    previous.call(material, shader, renderer);
    // 放在 main 前面（triplanar 的 uniform / varying 声明之后）
    shader.vertexShader = shader.vertexShader.replace("void main() {", `${vertexHead}\nvoid main() {`);
    shader.fragmentShader = shader.fragmentShader.replace("void main() {", `${fragmentHead}\nvoid main() {`);
  };
  material.customProgramCacheKey = () => `${previousKey.call(material)}-fx-3`;
  material.needsUpdate = true;
}

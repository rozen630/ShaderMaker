// 三向投影（triplanar）：程序贴图不再按模型 UV 贴，改成在展示空间里从 X / Y / Z 三个方向投影再按法线混合，
// 所以 UV 岛之间、球体接缝处都不会有裂缝。配合 makeTileable 把贴图边缘做成可平铺，投影重复处也没有接缝。
// 体素（实例化网格）每块只取一个点的颜色，继续走 voxelUv，不受影响。
import * as THREE from "three";

// 展示空间：display 组的局部坐标（模型自转时贴图跟着转，不会在表面滑动）
export const triplanarUniforms = {
  uTriDisplayInverse: { value: new THREE.Matrix4() },
  uTriDisplayNormal: { value: new THREE.Matrix3() },
  // 每单位长度平铺多少次（展示模型高约 1.5）
  uTriScale: { value: 0.7 },
};

export function updateTriplanar(display) {
  display.updateMatrixWorld();
  triplanarUniforms.uTriDisplayInverse.value.copy(display.matrixWorld).invert();
  triplanarUniforms.uTriDisplayNormal.value.getNormalMatrix(display.matrixWorld);
}

const vertexHead = /* glsl */ `
uniform mat4 uTriDisplayInverse;
varying vec3 vTriPos;
varying vec3 vTriNormal;
varying float vTriInstanced;
varying vec3 vTriEye;
`;

// USE_INSTANCING 只在顶点着色器里有定义，所以用 vTriInstanced 把「这是体素」告诉片元着色器；
// 体素的位置要乘上实例矩阵，积雪等按位置算的效果才对
const vertexBody = /* glsl */ `
  {
    mat4 triModel = uTriDisplayInverse * modelMatrix;
    vec4 triLocal = vec4(position, 1.0);
    vTriInstanced = 0.0;
#ifdef USE_INSTANCING
    triLocal = instanceMatrix * triLocal;
    vTriInstanced = 1.0;
#endif
    vTriPos = (triModel * triLocal).xyz;
    vTriNormal = mat3(triModel) * normal;
    // 展示空间里从相机指向这个点的方向（冰下视差层用）
    vTriEye = mat3(uTriDisplayInverse) * ((modelMatrix * triLocal).xyz - cameraPosition);
  }
`;

// 普通网格用三向投影；体素（vTriInstanced = 1）每块只取一个颜色，继续按 voxelUv 取样
export const triplanarFragmentHead = /* glsl */ `
uniform float uTriScale;
uniform mat3 uTriDisplayNormal;
varying vec3 vTriPos;
varying vec3 vTriNormal;
varying float vTriInstanced;
varying vec3 vTriEye;

vec3 triWeights() {
  vec3 w = pow(abs(normalize(vTriNormal)), vec3(4.0));
  return w / (w.x + w.y + w.z);
}

vec4 triSample(sampler2D tex, vec2 uv) {
  if (vTriInstanced > 0.5) return texture2D(tex, uv);
  vec3 p = vTriPos * uTriScale;
  vec3 w = triWeights();
  return texture2D(tex, p.zy) * w.x + texture2D(tex, p.xz) * w.y + texture2D(tex, p.xy) * w.z;
}

// 法线贴图三向混合（whiteout blend），结果转回视图空间
vec3 triNormal(sampler2D tex, vec2 scale) {
  vec3 n = normalize(vTriNormal);
  vec3 p = vTriPos * uTriScale;
  vec3 w = triWeights();
  vec3 s = sign(n);
  vec3 tx = texture2D(tex, p.zy).xyz * 2.0 - 1.0;
  vec3 ty = texture2D(tex, p.xz).xyz * 2.0 - 1.0;
  vec3 tz = texture2D(tex, p.xy).xyz * 2.0 - 1.0;
  tx.xy *= scale * vec2(s.x, 1.0);
  ty.xy *= scale * vec2(s.y, 1.0);
  tz.xy *= scale * vec2(-s.z, 1.0);
  tx = vec3(tx.xy + n.zy, abs(tx.z) * n.x);
  ty = vec3(ty.xy + n.xz, abs(ty.z) * n.y);
  tz = vec3(tz.xy + n.xy, abs(tz.z) * n.z);
  vec3 blended = normalize(tx.zyx * w.x + ty.xzy * w.y + tz.xyz * w.z);
  return normalize(mat3(viewMatrix) * (uTriDisplayNormal * blended));
}
`;

const SAMPLED_CHUNKS = [
  "map_fragment",
  "roughnessmap_fragment",
  "metalnessmap_fragment",
  "aomap_fragment",
  "emissivemap_fragment",
  "normal_fragment_maps",
];
const SAMPLED_TEXTURES = /texture2D\(\s*(map|roughnessMap|metalnessMap|aoMap|emissiveMap|tOrm)\s*,\s*(v\w+Uv)\s*\)/g;

// 给已有材质（PBR / NPR）打补丁；要在材质其它 onBeforeCompile 之后执行（NPR 会自己替换部分片段）
export function applyTriplanar(material) {
  const previous = material.onBeforeCompile;
  const previousKey = material.customProgramCacheKey;
  material.onBeforeCompile = (shader, renderer) => {
    previous.call(material, shader, renderer);
    Object.assign(shader.uniforms, triplanarUniforms);
    shader.vertexShader = vertexHead + shader.vertexShader.replace("void main() {", `void main() {${vertexBody}`);
    let fragment = shader.fragmentShader;
    for (const chunk of SAMPLED_CHUNKS) fragment = fragment.replace(`#include <${chunk}>`, THREE.ShaderChunk[chunk]);
    fragment = fragment
      .replace(SAMPLED_TEXTURES, "triSample($1, $2)")
      .replace(
        "normal = normalize( tbn * mapN );",
        "normal = vTriInstanced > 0.5 ? normalize( tbn * mapN ) : triNormal( normalMap, normalScale );"
      );
    shader.fragmentShader = triplanarFragmentHead + fragment;
  };
  material.customProgramCacheKey = () => `${previousKey.call(material)}-triplanar-1`;
  material.needsUpdate = true;
}

export const triplanarVertexHead = vertexHead;
export const triplanarVertexBody = vertexBody;

// 把程序贴图做成可平铺：原图与错开半张的副本在边缘附近交叉混合，左右 / 上下边缘的值完全一致
const tileMaterial = new THREE.ShaderMaterial({
  uniforms: { tSource: { value: null } },
  vertexShader: /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`,
  fragmentShader: /* glsl */ `
uniform sampler2D tSource;
varying vec2 vUv;
void main() {
  vec2 w = smoothstep(0.55, 0.95, abs(vUv - 0.5) * 2.0);
  vec4 a = texture2D(tSource, vUv);
  vec4 b = texture2D(tSource, fract(vUv + vec2(0.5, 0.0)));
  vec4 c = texture2D(tSource, fract(vUv + vec2(0.0, 0.5)));
  vec4 d = texture2D(tSource, fract(vUv + 0.5));
  gl_FragColor = mix(mix(a, b, w.x), mix(c, d, w.x), w.y);
}
`,
  depthTest: false,
  depthWrite: false,
});
const tileScene = new THREE.Scene();
const tileCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
tileScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), tileMaterial));

export function createTiler(size) {
  const raw = new THREE.WebGLRenderTarget(size, size, { type: THREE.HalfFloatType, depthBuffer: false });
  raw.texture.wrapS = THREE.RepeatWrapping;
  raw.texture.wrapT = THREE.RepeatWrapping;
  return {
    target: raw,
    // 先把程序贴图画到 raw，再调用它写进最终贴图
    resolve(renderer, destination) {
      tileMaterial.uniforms.tSource.value = raw.texture;
      renderer.setRenderTarget(destination);
      renderer.render(tileScene, tileCamera);
    },
  };
}

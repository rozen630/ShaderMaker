// AI / 用户自己写的 Shader：编译检查、存到浏览器（IndexedDB）、注册进材质库。
// 内置 Shader 写在 shaders.js 里随包发布；这里的只存在本机浏览器，换电脑不会跟过去，
// 想长期保留、跨电脑共用，就把代码收进 shaders.js（见 README「自定义 Shader」）。
import * as THREE from "three";
import { makeSurfaceShader, makeVfxShader, vertexShader } from "./shaders.js";
import { tileableGlsl } from "./vendor/tileable-shaders.js";
import { loadAll, saveRecord, removeRecord } from "./store.js";

export const USER_CODE_MARKER = "// @user-code";
export const customCategory = { id: "custom", label: "自定义" };

// 给 AI 看的写法说明（read_shader 不传 id 时返回）
export const shaderGuide = `ShaderMaker 自定义 Shader 写法（GLSL ES 3.0 / WebGL2，片元着色器，渲染成一张 1024² 的贴图，再三向投影贴到模型上）

两种类型：
1. kind="surface"（写实材质，推荐）：只写一个函数
   SurfaceData sampleSurface(vec2 uv) { ... }
   struct SurfaceData { vec3 baseColor; vec3 emissive; float ao; float roughness; float metalness; float height; };
   - baseColor / emissive：线性颜色 0–1；ao、roughness、metalness：0–1；height：-1..1（会生成法线，也用于「置换高度」把表面推出去）。
   - 每个字段都要赋值。会被调用多次（底色、ORM、法线、自发光各一次，法线还会偏移 uv 再采样），不要依赖副作用。
2. kind="vfx"（自发光特效）：写完整的 void main()，最后 gl_FragColor = vec4(grade(col), 1.0); 颜色同时是底色和自发光。

可用 uniform：uTime、uResolution、uColorA（暗部色）、uColorB（主色）、uAccent（点缀色）、uSpeed、uScale、uIntensity、uContrast、uWarp、uGlow、uSeed（随机种子）。界面上的三色和滑条直接改这些值，请用它们而不是写死颜色。
可用函数：
- shaderTime()：动画时间（已乘速度）。图案平移每秒约 0.01–0.05 个贴图宽，相位 / 脉冲约 t*0.1–1.0。不要把时间加进哈希种子，会逐帧闪烁。
- grade(vec3)：对比度 / 强度调色，VFX 输出时用。
- tiles(float base) → vec2：按 uScale 取整数格数，传给下面的可平铺函数。
- spectrum(float t) → vec3：彩虹色。
- bricks(vec2 uv, vec2 count) → vec4（x=到砖边距离，y=砖随机 id，zw=砖内坐标）；bevel(float edgeDistance, float mortar, float width)。
- 可平铺库（tuxalin/procedural-tileable-shaders）：pos 传 uv，scale 必须是整数格数（用 tiles()），seed 传 uSeed 或 uSeed + 常数。常用函数和返回值：
  fbm(vec2 pos, vec2 scale, int octaves, float shift, float timeShift, float gain, float lacunarity, float octaveFactor, float seed) → float，实际约 0–1.3、中位约 0.6
    例：fbm(uv, tiles(4.0), 5, 0.0, 0.0, 0.5, 2.0, 0.0, uSeed)
  perlinNoise / gradientNoise / noise(vec2 pos, vec2 scale, float seed) → float，-1..1
  voronoi(vec2 pos, vec2 scale, float jitter, float phase, float seed) → vec3：x = 到细胞边缘的距离，yz = 细胞位置 0–1（可当随机 id）
  cellularNoise(vec2 pos, vec2 scale, float jitter, float seed) → vec2：x = F1，y = F2
  cracks(vec2 pos, vec2 scale, float jitter, float width, float smoothness, float warp, float warpScale, bool warpSmudge, float seed) → float：裂纹线上 0，其余 1
  tileHexagons(vec2 pos, vec2 scale, bool isVertical, out float edgeDistance) → vec4：xy = 格内 UV 0–1，zw = 格中心（可当随机 id），edgeDistance = 到六边形边的距离（0 在边上）
  metaballs(vec2 pos, vec2 scale, float jitter, float seed) → float：到细胞边缘的距离 0–1
  dotsNoise(vec2 pos, vec2 scale, float density, float size, float sizeVariation, float roundness, float seed) → vec3：x = 圆点，y = 随机亮度，z = 圆点大小
  hash1D(vec2) → float、hash2D(vec2) → vec2：0–1 随机
  另有 organicNoise、fbmVoronoi、fbmPerlin、curlWarp、perlinNoiseWarp、randomLines、wavePattern、checkerboard、tileWeave 等——read_shader 传 id="library" 可查全部函数的签名和返回值说明。
- 旧版不可平铺的 fbm(vec2)、noise(vec2)、voronoi(vec2 p, float t) 也在，但贴到模型上会有接缝，尽量用上面的可平铺版本。

规则：
- 贴图必须能无缝平铺：只用 uv（0–1）配合整数格数的可平铺函数；不要用 gl_FragCoord、不要对 uv 做非整数缩放。
- 循环次数要有上限（for 用常量上限），不要写可能死循环的代码。
- 不要声明 uniform、varying、precision，也不要 #include；这些外框已经提供。
- 想参考现成写法：read_shader 传入一个内置 Shader 的 id（例如 snow、stylizedBrick、ice、nebula）。`;

// 可平铺库的函数参考：每个函数签名连同它上方的注释（@param / @return），read_shader id="library" 时返回
export function libraryReference() {
  const lines = tileableGlsl.split("\n");
  const out = [];
  for (let i = 0; i < lines.length; i += 1) {
    if (!/^(float|vec[234]|mat[234]|int|bool) [A-Za-z0-9_]+\(/.test(lines[i])) continue;
    const doc = [];
    for (let j = i - 1; j >= 0 && lines[j].startsWith("//"); j -= 1) {
      if (/@return|^\/\/ [A-Z]/.test(lines[j]) && !lines[j].startsWith("// ----")) doc.unshift(lines[j].replace(/^\/\/\s*/, "  "));
    }
    out.push(lines[i].replace(/\s*\{?\s*$/, ""), ...doc);
  }
  return out.join("\n");
}

// ---- 编译检查 ----

const checkScene = new THREE.Scene();
const checkCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const checkMesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
checkScene.add(checkMesh);

function parseErrors(log, source, pass) {
  const lines = source.split("\n");
  const marker = lines.findIndex((line) => line.trim() === USER_CODE_MARKER) + 1;
  const out = [];
  for (const raw of log.split("\n")) {
    const match = raw.match(/^ERROR:\s*\d+:(\d+):\s*(.*)$/);
    if (!match) continue;
    const at = Number(match[1]);
    const message = match[2].trim();
    if (marker && at > marker) {
      const line = at - marker;
      out.push({ pass, line, message, code: (lines[at - 1] || "").trim() });
    } else {
      out.push({ pass, line: null, message, code: (lines[at - 1] || "").trim() });
    }
  }
  if (!out.length && log.trim()) out.push({ pass, line: null, message: log.trim().slice(0, 400), code: "" });
  return out;
}

// 依次编译这个 Shader 的所有通道（底色 / ORM / 法线 / 自发光），返回错误列表（空 = 通过）
export function checkShader(renderer, definition, uniforms) {
  const passes = [["base", definition.fragment], ...Object.entries(definition.channels || {})];
  const target = new THREE.WebGLRenderTarget(4, 4);
  const previousTarget = renderer.getRenderTarget();
  const previousHandler = renderer.debug.onShaderError;
  let captured = null;
  renderer.debug.onShaderError = (gl, program, glVertexShader, glFragmentShader) => {
    const log = gl.getShaderInfoLog(glFragmentShader) || gl.getProgramInfoLog(program) || "";
    captured = { log, source: gl.getShaderSource(glFragmentShader) || "" };
  };
  const errors = [];
  try {
    for (const [pass, fragment] of passes) {
      captured = null;
      const material = new THREE.ShaderMaterial({ uniforms, vertexShader, fragmentShader: fragment, depthTest: false, depthWrite: false });
      checkMesh.material = material;
      renderer.setRenderTarget(target);
      renderer.render(checkScene, checkCamera);
      material.dispose();
      if (captured) {
        errors.push(...parseErrors(captured.log, captured.source, pass));
        break;
      }
    }
  } finally {
    renderer.debug.onShaderError = previousHandler;
    renderer.setRenderTarget(previousTarget);
    target.dispose();
  }
  return errors.slice(0, 8);
}

export function formatErrors(errors, code) {
  const total = code.split("\n").length;
  return errors
    .map((error) => {
      const where =
        error.line && error.line <= total
          ? `第 ${error.line} 行`
          : "外框代码（检查 sampleSurface / main 是否定义、签名和返回值是否正确）";
      return `[${error.pass}] ${where}：${error.message}${error.code ? `\n    ${error.code}` : ""}`;
    })
    .join("\n");
}

// ---- 构建 ----

export function buildShader(record) {
  const code = `\n${USER_CODE_MARKER}\n${record.code}`;
  const definition =
    record.kind === "vfx" ? makeVfxShader(record.name, code) : makeSurfaceShader(record.name, code, { tileable: true });
  definition.source = record.code;
  definition.custom = true;
  definition.timeScale = record.timeScale ?? 0.3;
  return definition;
}

// 自定义 Shader 的默认参数：Surface 让 ORM 贴图说了算，VFX 靠自发光
export function defaultValues(kind) {
  const colors = { uColorA: [0.08, 0.08, 0.1], uColorB: [0.45, 0.45, 0.5], uAccent: [0.9, 0.75, 0.5] };
  if (kind === "vfx") {
    return { ...colors, uSpeed: 1, uScale: 1, uWarp: 0.5, uGlow: 0.6, uSeed: 1, uRoughness: 0.4, uEmissive: 0.5, uNormal: 0.05 };
  }
  return { ...colors, uSpeed: 1, uScale: 1, uWarp: 0.3, uSeed: 1, uMetalness: 1, uRoughness: 1, uNormal: 1, uDisplace: 0.015 };
}

// ---- 存储（src/store.js，IndexedDB） ----

export const loadCustomShaders = () => loadAll("customShaders");
export const saveCustomShader = (record) => saveRecord("customShaders", record);
export const removeCustomShader = (id) => removeRecord("customShaders", id);

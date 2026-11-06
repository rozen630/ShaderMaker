// 程序天空：太阳位置、云量、霾决定天空颜色和光照，不用 HDR 贴图（插件包里不占体积）。
// 天空画进立方体贴图当背景，再经 PMREM 做成 scene.environment；Key / Fill / Rim 灯跟着太阳走。
// 天空是视觉近似（大气透射用 Kasten–Young 气团公式估太阳颜色），不是物理大气积分。
import * as THREE from "three";

export const skySliders = [
  { key: "sunElevation", label: "太阳高度", min: -12, max: 90, step: 1, default: 30, suffix: "°" },
  { key: "sunAzimuth", label: "太阳方位", min: 0, max: 360, step: 1, default: 110, suffix: "°" },
  { key: "cloud", label: "云量", min: 0, max: 1, step: 0.01, default: 0.3 },
  { key: "haze", label: "霾", min: 0, max: 1, step: 0.01, default: 0.25 },
];

export const skyDefaults = Object.fromEntries(skySliders.map((def) => [def.key, def.default]));

// 自然语言里的时间 / 天气词 → 天空参数（怎么生效见 nl.js）。
// 默认相机在方位约 30° 处，日出 / 黄昏的方位让低角度阳光从侧面照到看得见的一面
export const skyPhrases = [
  { keys: ["日出", "清晨", "sunrise", "dawn"], values: { sunElevation: 4, sunAzimuth: 120 }, note: "日出" },
  { keys: ["正午", "中午", "烈日", "noon", "midday"], values: { sunElevation: 72 }, note: "正午" },
  { keys: ["上午", "下午", "afternoon", "morning"], values: { sunElevation: 35 }, note: "白天" },
  { keys: ["黄昏", "日落", "傍晚", "golden hour", "sunset", "dusk"], values: { sunElevation: 3, sunAzimuth: 290 }, note: "黄昏" },
  { keys: ["暮光", "蓝调", "twilight", "blue hour"], values: { sunElevation: -4 }, note: "暮光" },
  { keys: ["夜晚", "夜里", "深夜", "黑夜", "night"], values: { sunElevation: -12 }, note: "夜晚" },
  { keys: ["晴朗", "晴天", "万里无云", "clear sky", "sunny"], values: { cloud: 0.05, haze: 0.1 }, note: "晴朗" },
  { keys: ["多云", "cloudy"], values: { cloud: 0.55 }, note: "多云" },
  { keys: ["阴天", "乌云", "overcast"], values: { cloud: 0.95, haze: 0.45 }, note: "阴天" },
  { keys: ["雾霾", "朦胧", "起雾", "hazy", "foggy"], values: { haze: 0.8 }, note: "有霾" },
];

const skyVertex = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const skyFragment = /* glsl */ `
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform float uSunPower;
uniform vec3 uMoonDir;
uniform float uCloud;
uniform float uHaze;
varying vec3 vDir;

float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0)), f.x), f.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  mat2 m = mat2(0.8, -0.6, 0.6, 0.8);
  for (int i = 0; i < 6; i++) { v += noise(p) * a; p = m * p * 2.02 + 7.3; a *= 0.5; }
  return v;
}

void main() {
  vec3 d = normalize(vDir);
  float sunH = uSunDir.y;
  float day = smoothstep(-0.12, 0.1, sunH);
  // 暮色只在太阳贴着地平线（约 -10° 到 +12°）时出现
  float twilight = (1.0 - smoothstep(0.0, 0.22, abs(sunH + 0.02))) * smoothstep(-0.18, -0.06, sunH);
  float up = max(d.y, 0.0);
  float cosT = dot(d, uSunDir);
  vec2 flatD = normalize(d.xz + vec2(1e-4));
  // 必须 clamp：舍入误差会让它略小于 0，pow 负数得 NaN，PMREM 会把 NaN 扩散到整张环境贴图
  float toward = clamp(dot(flatD, normalize(uSunDir.xz + vec2(1e-4))) * 0.5 + 0.5, 0.0, 1.0);

  // 天顶 → 地平线渐变；霾让地平线发白、天顶变淡
  // 太阳越低天空越暗，低角度阳光才压得住天光
  float skyLevel = mix(0.4, 1.0, smoothstep(0.02, 0.45, sunH));
  vec3 zenith = mix(vec3(0.004, 0.007, 0.018), vec3(0.075, 0.2, 0.58) * skyLevel, day);
  vec3 horizon = mix(vec3(0.012, 0.018, 0.036), vec3(0.5, 0.64, 0.84) * skyLevel, day);
  zenith = mix(zenith, horizon * 0.8, uHaze * 0.45);
  vec3 groundTint = horizon;
  // 太阳低时，朝太阳那一侧的地平线染上太阳的颜色
  horizon = mix(horizon, uSunColor * 0.75, twilight * 0.65 * pow(toward, 1.5));
  // 地平线色只占贴近地平线的一窄条，霾越重越宽
  vec3 sky = mix(zenith, horizon, exp(-up * mix(7.0, 2.5, uHaze)));

  // 暮色：朝太阳一侧的地平线发橙，背向一侧偏紫
  vec3 warm = vec3(1.0, 0.36, 0.1) * mix(0.18, 1.5, pow(toward, 3.0));
  vec3 violet = vec3(0.22, 0.14, 0.32) * (1.0 - toward);
  sky += (warm + violet) * twilight * exp(-up * 5.0) * 0.7;

  // 太阳周围的前向散射光晕，霾越重越大
  float sunUp = smoothstep(-0.06, 0.02, sunH);
  float glow = pow(max(cosT, 0.0), mix(10.0, 3.0, uHaze)) * (0.25 + uHaze * 0.7) + pow(max(cosT, 0.0), 220.0) * 1.4;
  sky += uSunColor * uSunPower * glow * sunUp * 0.8;

  // 星星：夜里才有，霾和云遮掉
  float night = 1.0 - smoothstep(-0.18, -0.02, sunH);
  vec2 starUv = vec2(atan(d.z, d.x) * 140.0, asin(clamp(d.y, -1.0, 1.0)) * 140.0);
  vec2 cell = floor(starUv);
  float star = step(0.985, hash(cell)) * smoothstep(0.38, 0.0, length(fract(starUv) - 0.5));
  sky += vec3(0.75, 0.82, 1.0) * star * hash(cell + 3.1) * 0.9 * night * up * (1.0 - uHaze);

  // 月亮（夜里给一个可反射的亮点）
  float moon = smoothstep(0.99955, 0.9997, dot(d, uMoonDir));
  sky += vec3(0.65, 0.72, 0.9) * moon * 3.0 * night;

  // 云：投到头顶一张平面上的 fbm，靠近地平线压扁、淡出
  float cloudMask = 0.0;
  if (d.y > 0.0) {
    vec2 uv = d.xz / (d.y + 0.12) * 0.55;
    float n = fbm(uv * 1.4 + vec2(3.7, 1.9));
    float cover = clamp(uCloud, 0.0, 1.0);
    cloudMask = smoothstep(1.02 - cover * 0.9, 1.18 - cover * 0.75, n + cover * 0.32);
    cloudMask *= smoothstep(0.0, 0.1, d.y);
    float thick = fbm(uv * 2.7 + 11.0);
    vec3 ambient = mix(horizon, zenith, 0.4) * 1.2 + vec3(0.02);
    vec3 lit = uSunColor * uSunPower * (0.55 + 0.9 * pow(max(cosT, 0.0), 4.0)) * day;
    vec3 cloudCol = mix(lit + ambient, ambient * 0.55, smoothstep(0.35, 0.8, thick) * cover);
    cloudCol += warm * twilight * 0.25;
    sky = mix(sky, cloudCol, cloudMask);
  }

  // 阴天整体发灰
  float overcast = smoothstep(0.6, 1.0, uCloud);
  vec3 grey = vec3(dot(sky, vec3(0.3, 0.5, 0.2))) * vec3(0.92, 0.95, 1.0) + vec3(0.06, 0.065, 0.07) * day;
  sky = mix(sky, grey, overcast * 0.85);

  // 太阳圆盘：故意比真实太阳大（约 0.9°），反射里才看得见；云挡住时变暗
  float disk = smoothstep(0.99986, 0.99992, cosT);
  sky += uSunColor * uSunPower * disk * 36.0 * sunUp * (1.0 - cloudMask) * (1.0 - overcast);

  // 地平线以下：地面，靠近地平线和天空融在一起
  if (d.y < 0.0) {
    vec3 groundLight = vec3(dot(groundTint, vec3(0.3, 0.5, 0.2))) * 0.6 + uSunColor * uSunPower * max(sunH, 0.0) * 0.5;
    vec3 ground = vec3(0.34, 0.31, 0.27) * groundLight;
    sky = mix(sky, ground, smoothstep(0.0, 0.35, -d.y));
  }

  gl_FragColor = vec4(sky, 1.0);
}
`;

const sunDirection = (elevation, azimuth) => {
  const e = THREE.MathUtils.degToRad(elevation);
  const a = THREE.MathUtils.degToRad(azimuth);
  return new THREE.Vector3(Math.cos(e) * Math.sin(a), Math.sin(e), Math.cos(e) * Math.cos(a));
};

// 太阳穿过大气后的颜色：气团越长，蓝光散射掉越多
function sunTransmittance(elevation, haze) {
  const e = Math.max(elevation, -1);
  const airmass = 1 / (Math.sin(THREE.MathUtils.degToRad(e)) + 0.50572 * Math.pow(e + 6.07995, -1.6364));
  const k = [0.035, 0.075, 0.16].map((value) => value * (1 + haze * 1.4));
  const t = k.map((value) => Math.exp(-value * Math.max(airmass, 1)));
  const peak = Math.max(...t);
  return { color: new THREE.Color(t[0] / peak, t[1] / peak, t[2] / peak), power: 0.45 + 0.55 * peak };
}

export function createSky(renderer, pmrem) {
  const uniforms = {
    uSunDir: { value: new THREE.Vector3(0, 1, 0) },
    uSunColor: { value: new THREE.Color(1, 1, 1) },
    uSunPower: { value: 1 },
    uMoonDir: { value: new THREE.Vector3(0, 1, 0) },
    uCloud: { value: skyDefaults.cloud },
    uHaze: { value: skyDefaults.haze },
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: skyVertex,
    fragmentShader: skyFragment,
    side: THREE.BackSide,
    depthWrite: false,
  });
  const skyScene = new THREE.Scene();
  skyScene.add(new THREE.Mesh(new THREE.SphereGeometry(5, 64, 32), material));
  // 背景直接用这张立方体贴图，512 足够天空渐变；云边会略软
  const cubeTarget = new THREE.WebGLCubeRenderTarget(512, { type: THREE.HalfFloatType, generateMipmaps: false });
  const cubeCamera = new THREE.CubeCamera(0.1, 10, cubeTarget);
  let envTarget = null;
  const values = { ...skyDefaults };

  function set(next = {}) {
    for (const def of skySliders) {
      if (next[def.key] === undefined || next[def.key] === null) continue;
      const value = Number(next[def.key]);
      if (Number.isFinite(value)) values[def.key] = THREE.MathUtils.clamp(value, def.min, def.max);
    }
    return { ...values };
  }

  // 重画天空并重新生成环境贴图（滑条拖动时每次 input 调一次，约几毫秒）
  function render() {
    const sun = sunDirection(values.sunElevation, values.sunAzimuth);
    const { color, power } = sunTransmittance(values.sunElevation, values.haze);
    uniforms.uSunDir.value.copy(sun);
    uniforms.uSunColor.value.copy(color);
    uniforms.uSunPower.value = power;
    uniforms.uMoonDir.value.copy(sunDirection(38, values.sunAzimuth + 180));
    uniforms.uCloud.value = values.cloud;
    uniforms.uHaze.value = values.haze;
    const previousTarget = renderer.getRenderTarget();
    cubeCamera.update(renderer, skyScene);
    const next = pmrem.fromCubemap(cubeTarget.texture);
    envTarget?.dispose();
    envTarget = next;
    renderer.setRenderTarget(previousTarget);
    return { background: cubeTarget.texture, environment: envTarget.texture, lights: lighting(sun, color, power) };
  }

  // 灯光跟着太阳：白天 Key 是太阳，太阳落下后换成从对面升起的冷色月光
  function lighting(sun, sunColor, power) {
    const el = values.sunElevation;
    const clouds = Math.pow(values.cloud, 1.5);
    const dayLight = THREE.MathUtils.smoothstep(el, -3, 3);
    const sunIntensity = 4.5 * power * dayLight * (1 - 0.85 * clouds) * (1 - 0.3 * values.haze);
    const moonIntensity = 0.6 * (1 - THREE.MathUtils.smoothstep(el, -8, -3));
    const useSun = sunIntensity >= moonIntensity;
    const keyDir = useSun ? sun.clone() : sunDirection(38, values.sunAzimuth + 180);
    // 太阳贴着地平线时灯位抬高一点，阴影不至于拉得无限长
    keyDir.y = Math.max(keyDir.y, 0.12);
    keyDir.normalize();
    const day = THREE.MathUtils.smoothstep(el, -6, 6);
    const skyTint = new THREE.Color(0x6f8fd8).lerp(new THREE.Color(0xb8c8e0), values.haze * 0.6);
    const keyColor = useSun ? sunColor.clone().lerp(new THREE.Color(0xdde4ee), clouds * 0.7) : new THREE.Color(0xa9bce8);
    const fillDir = new THREE.Vector3(-keyDir.x, 0.35, -keyDir.z).normalize();
    return {
      key: { color: keyColor.getHex(), intensity: useSun ? sunIntensity : moonIntensity, position: keyDir.multiplyScalar(6.5).toArray() },
      fill: { color: skyTint.getHex(), intensity: 0.06 + 0.1 * day, position: fillDir.multiplyScalar(5).toArray() },
      rim: { color: (useSun ? sunColor.clone().lerp(skyTint, 0.5) : new THREE.Color(0x7aa7ff)).getHex(), intensity: 0.5 + 0.8 * day, position: [-1.6, 2.6, 2.4] },
      hemi: 0.04 + 0.06 * day,
      exposure: THREE.MathUtils.lerp(2.2, 0.82, day) * (1 + 0.3 * clouds),
      // NPR 全画面模式的平涂背景：取天空地平线附近的颜色
      flat: new THREE.Color(0x0b1020).lerp(new THREE.Color(0x8fa8c8).lerp(new THREE.Color(0x9a9ea6), clouds), day).lerp(new THREE.Color(0xd08050), THREE.MathUtils.clamp(1 - Math.abs(el - 2) / 10, 0, 1) * 0.5).getHex(),
    };
  }

  return { values, set, render };
}

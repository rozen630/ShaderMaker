// 自定义环境：用户上传的全景环境图（.hdr / .exr / JPG / PNG / WebP 等距柱状投影）。
// 上传的图没有手调好的灯光，所以导入时分析一遍：最亮的一小块当主光（方向 + 颜色），平均亮度定曝光，顺便做缩略图。
// 插件页面的 CSP 不允许 blob: 地址，所以字节直接交给解析器 / createImageBitmap，不经过 URL。
import * as THREE from "three";
import { RGBELoader } from "three/addons/loaders/RGBELoader.js";
import { EXRLoader } from "three/addons/loaders/EXRLoader.js";

export const ENV_FILE = /\.(hdr|exr|jpe?g|png|webp)$/i;
export const ENV_ACCEPT = ".hdr,.exr,.jpg,.jpeg,.png,.webp";
export const MAX_ENV_BYTES = 100 * 1024 * 1024;
export const THUMB_WIDTH = 96;
export const THUMB_HEIGHT = 48;

export const envSliders = [
  { key: "rotation", label: "旋转", min: 0, max: 360, step: 1, default: 0, suffix: "°" },
  { key: "exposure", label: "曝光", min: -3, max: 3, step: 0.1, default: 0, suffix: " EV" },
];

const kindOf = (name) => {
  const ext = String(name).toLowerCase().match(ENV_FILE)?.[1];
  return ext === "hdr" || ext === "exr" ? ext : ext ? "ldr" : null;
};

const srgbToLinear = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));

// 解析成 three 纹理，另外给一个按 (u, v) 取线性 RGB 的采样函数（v = 1 是图片顶边，和 three 的等距柱状 uv 一致）
export async function decodeEnvironment(bytes, name) {
  const kind = kindOf(name);
  if (!kind) throw new Error("只支持 .hdr / .exr / .jpg / .png / .webp 全景图");
  if (kind === "hdr" || kind === "exr") {
    const loader = kind === "hdr" ? new RGBELoader() : new EXRLoader();
    let data;
    try {
      data = loader.parse(bytes);
    } catch (error) {
      throw new Error(`${kind.toUpperCase()} 解析失败：${error.message || error}`);
    }
    if (!data?.data || !data.width || !data.height) throw new Error(`${kind.toUpperCase()} 文件里没有图像数据`);
    const texture = new THREE.DataTexture(data.data, data.width, data.height, data.format, data.type);
    texture.colorSpace = THREE.LinearSRGBColorSpace;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = false;
    // .hdr 数据从上往下存（要翻转），.exr 从下往上存
    const topDown = kind === "hdr";
    texture.flipY = topDown;
    texture.needsUpdate = true;
    const channels = Math.round(data.data.length / (data.width * data.height));
    const half = data.data instanceof Uint16Array;
    const read = half ? (i) => THREE.DataUtils.fromHalfFloat(data.data[i]) : (i) => data.data[i];
    const sample = (u, v) => {
      const x = Math.min(data.width - 1, Math.floor(u * data.width));
      const row = Math.min(data.height - 1, Math.floor((1 - v) * data.height));
      const y = topDown ? row : data.height - 1 - row;
      const i = (y * data.width + x) * channels;
      const r = read(i);
      return channels >= 3 ? [r, read(i + 1), read(i + 2)] : [r, r, r];
    };
    return { texture, sample, kind, width: data.width, height: data.height };
  }
  let bitmap;
  try {
    bitmap = await createImageBitmap(new Blob([bytes]), { imageOrientation: "flipY" });
  } catch {
    throw new Error("图片解码失败");
  }
  const texture = new THREE.Texture(bitmap);
  texture.colorSpace = THREE.SRGBColorSpace;
  // 已经在解码时上下翻转过了（ImageBitmap 不支持 flipY）
  texture.flipY = false;
  texture.needsUpdate = true;
  // 分析用小图：缩到 512 宽以内读像素
  const width = Math.min(512, bitmap.width);
  const height = Math.max(1, Math.round((width * bitmap.height) / bitmap.width));
  const canvas = new OffscreenCanvas(width, height);
  const context = canvas.getContext("2d", { willReadFrequently: true });
  context.drawImage(bitmap, 0, 0, width, height);
  const pixels = context.getImageData(0, 0, width, height).data;
  // bitmap 已经翻转过，第 0 行是图片底边（v = 0）
  const sample = (u, v) => {
    const x = Math.min(width - 1, Math.floor(u * width));
    const y = Math.min(height - 1, Math.floor(v * height));
    const i = (y * width + x) * 4;
    return [srgbToLinear(pixels[i] / 255), srgbToLinear(pixels[i + 1] / 255), srgbToLinear(pixels[i + 2] / 255)];
  };
  return { texture, sample, kind, width: bitmap.width, height: bitmap.height };
}

// 等距柱状 uv → 方向（与 three 的 equirectUv 互逆）
function directionAt(u, v) {
  const a = (u - 0.5) * Math.PI * 2;
  const lat = (v - 0.5) * Math.PI;
  return [Math.cos(lat) * Math.cos(a), Math.sin(lat), Math.cos(lat) * Math.sin(a)];
}

const luminance = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];

// 分析：主光方向 / 颜色 / 占全图能量的比例，平均亮度和颜色，地平线颜色（卡通平涂背景用），缩略图
export function analyzeEnvironment({ sample, kind }) {
  const W = 256;
  const H = 128;
  const cells = [];
  let energy = 0;
  let weightSum = 0;
  const average = [0, 0, 0];
  const horizon = [0, 0, 0];
  let horizonWeight = 0;
  for (let y = 0; y < H; y++) {
    const v = (y + 0.5) / H;
    const weight = Math.cos((v - 0.5) * Math.PI);
    for (let x = 0; x < W; x++) {
      const u = (x + 0.5) / W;
      const c = sample(u, v).map((value) => (Number.isFinite(value) ? Math.max(value, 0) : 0));
      const l = luminance(c);
      cells.push({ u, v, c, l, weight });
      energy += l * weight;
      weightSum += weight;
      for (let k = 0; k < 3; k++) average[k] += c[k] * weight;
      if (Math.abs(v - 0.5) < 0.12) {
        for (let k = 0; k < 3; k++) horizon[k] += c[k];
        horizonWeight += 1;
      }
    }
  }
  for (let k = 0; k < 3; k++) {
    average[k] /= weightSum;
    horizon[k] /= Math.max(horizonWeight, 1);
  }
  const averageLuminance = Math.max(energy / weightSum, 1e-4);
  // 最亮的 0.5% 当主光（太阳 / 主灯）
  const bright = [...cells].sort((a, b) => b.l - a.l).slice(0, Math.max(8, Math.round(cells.length * 0.005)));
  const dir = [0, 0, 0];
  const color = [0, 0, 0];
  let brightEnergy = 0;
  for (const cell of bright) {
    const w = cell.l * cell.weight;
    const d = directionAt(cell.u, cell.v);
    for (let k = 0; k < 3; k++) {
      dir[k] += d[k] * w;
      color[k] += cell.c[k] * cell.weight;
    }
    brightEnergy += w;
  }
  const dirLength = Math.hypot(...dir) || 1;
  const peak = Math.max(...color) || 1;
  // 缩略图：按平均亮度归一后 Reinhard 压到 sRGB，存成 RGB 字节数组
  const thumb = [];
  const scale = 0.18 / averageLuminance;
  for (let y = 0; y < THUMB_HEIGHT; y++) {
    for (let x = 0; x < THUMB_WIDTH; x++) {
      const c = sample((x + 0.5) / THUMB_WIDTH, 1 - (y + 0.5) / THUMB_HEIGHT);
      for (let k = 0; k < 3; k++) {
        const value = Math.max(c[k], 0) * scale;
        const mapped = value / (1 + value);
        thumb.push(Math.round(255 * Math.pow(Math.min(mapped, 1), 1 / 2.2)));
      }
    }
  }
  return {
    kind,
    key: {
      direction: dir.map((value) => value / dirLength),
      color: color.map((value) => value / peak),
      // 主光占整张图能量的比例：有太阳的室外图大，阴天 / 室内图小
      share: brightEnergy / Math.max(energy, 1e-6),
      // 低动态范围图片里太阳被截到 1，能量算不出来，看最亮处有没有顶满
      clipped: kind === "ldr" && bright[0].l > 0.9,
    },
    averageLuminance,
    average,
    horizon,
    thumb,
  };
}

// 按分析结果和用户的旋转 / 曝光配灯光，结构与 sky.js 的 lighting 一致
export function environmentLights(analysis, { rotation = 0, exposure = 0 } = {}) {
  const angle = THREE.MathUtils.degToRad(rotation);
  // scene.environmentRotation 把环境绕 Y 转 angle，主光方向跟着转
  const keyDir = new THREE.Vector3(...analysis.key.direction).applyAxisAngle(new THREE.Vector3(0, 1, 0), angle);
  // 主光在地平线下（比如地面反光最亮）时抬到斜上方，阴影才有意义
  keyDir.y = Math.max(keyDir.y, 0.25);
  keyDir.normalize();
  // HDR 里的太阳已经在环境光里了，主光只补阴影和方向感；低动态范围图的太阳被截掉，主光要补回来
  const share = THREE.MathUtils.clamp(analysis.key.share, 0, 1);
  // 系数按原来 4 张 Poly Haven HDR 手调的主光强度（0.22–0.55）标定
  const intensity = analysis.key.clipped ? 1.2 : analysis.kind === "ldr" ? 0.4 : 0.15 + 0.6 * share;
  // 直接取的太阳颜色太饱和（日落接近纯红），往白色拉一些
  const keyColor = new THREE.Color(...analysis.key.color).lerp(new THREE.Color(1, 1, 1), 0.4);
  const ambient = new THREE.Color(...analysis.average);
  const ambientPeak = Math.max(ambient.r, ambient.g, ambient.b) || 1;
  ambient.multiplyScalar(1 / ambientPeak);
  const fillDir = new THREE.Vector3(-keyDir.x, 0.35, -keyDir.z).normalize();
  const flat = new THREE.Color(...analysis.horizon);
  const flatPeak = Math.max(flat.r, flat.g, flat.b) || 1;
  flat.multiplyScalar(Math.min(1, 0.7 / flatPeak)).convertLinearToSRGB();
  return {
    key: { color: keyColor.getHex(), intensity, position: keyDir.multiplyScalar(6.5).toArray() },
    fill: { color: ambient.getHex(), intensity: 0.1, position: fillDir.multiplyScalar(5).toArray() },
    rim: { color: ambient.clone().lerp(new THREE.Color(1, 1, 1), 0.5).getHex(), intensity: 0.9, position: [-1.6, 2.6, 2.4] },
    hemi: 0.06,
    // 只做轻微的自动曝光：原来手调的 4 张 HDR 平均亮度差 9 倍，曝光都在 1 左右；再乘用户的 EV
    exposure: THREE.MathUtils.clamp(Math.pow(0.45 / analysis.averageLuminance, 0.15), 0.5, 2) * Math.pow(2, exposure),
    flat: flat.getHex(),
  };
}

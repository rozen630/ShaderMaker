// HDR 压缩：把 Radiance .hdr 拆成两张普通图片，体积约为原来的 1/5–1/10，加载时在页面里还原（src/packedHdr.js）。
// - 底图 <name>.jpg：颜色除以增益后（每个通道都 ≤ 1）转 sRGB，存成普通 JPEG。
// - 增益 <name>.gain.png：每个像素「亮出 1 多少」，log2(增益) / MAX_LOG 存成 12 位（×16 成 16 位，0–65520），拆进 PNG 的 R（高字节）和 G（低字节）。
//   画布读 PNG 只给 8 位，所以不用 16 位 PNG；大部分像素增益为 0，PNG 压得很小。
// 还原：颜色 = sRGB→线性(底图) × 2^(code / 65520 × MAX_LOG)。增益只在比 1 亮的地方（太阳、灯）不为 1。
import { readFile, writeFile } from "node:fs/promises";
import * as THREE from "three";
import { RGBELoader } from "three/addons/loaders/RGBELoader.js";
import jpeg from "jpeg-js";
import { PNG } from "pngjs";

export const MAX_LOG = 24;

function linearToSrgb(value) {
  return value <= 0.0031308 ? value * 12.92 : 1.055 * Math.pow(value, 1 / 2.4) - 0.055;
}

// 亮部（> 1 的像素，太阳 / 灯）的能量对得上多少：解码 JPEG 乘回增益，按通道和原图比
function brightError(data, jpgData, codes, width, height) {
  const decoded = jpeg.decode(jpgData, { useTArray: true }).data;
  const ref = [0, 0, 0];
  const got = [0, 0, 0];
  for (let i = 0; i < width * height; i += 1) {
    if (!codes[i]) continue;
    const scale = Math.pow(2, (codes[i] / 65520) * MAX_LOG);
    for (let c = 0; c < 3; c += 1) {
      ref[c] += Math.min(Math.max(data[i * 4 + c], 0), 65504);
      const v = decoded[i * 4 + c] / 255;
      got[c] += Math.min((v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)) * scale, 65504);
    }
  }
  return Math.max(...ref.map((value, c) => (value > 0 ? Math.abs(got[c] / value - 1) : 0)));
}

// 质量从 90 起，亮部颜色偏差超过 tolerance 就提高（小而亮的灯在 JPEG 里最容易偏色，夜景就靠它们照明）
export async function packHdr(hdrPath, outBase, { qualities = [90, 93, 95, 97], tolerance = 0.025 } = {}) {
  const buffer = await readFile(hdrPath);
  const loader = new RGBELoader().setDataType(THREE.FloatType);
  const { data, width, height } = loader.parse(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength));
  const base = Buffer.alloc(width * height * 4);
  const gain = new PNG({ width, height, colorType: 2, inputColorType: 2, inputHasAlpha: false });
  gain.data = Buffer.alloc(width * height * 3);
  const codes = new Uint16Array(width * height);
  for (let i = 0; i < width * height; i += 1) {
    const r = Math.max(data[i * 4], 0);
    const g = Math.max(data[i * 4 + 1], 0);
    const b = Math.max(data[i * 4 + 2], 0);
    const peak = Math.max(r, g, b, 1);
    // 增益先量化，底图按量化后的增益去除，还原时两者正好对上
    // 12 位精度（步长 MAX_LOG/4096 ≈ 0.006 档，约 0.4%，看不出来）；低 4 位留 0，PNG 压得更小
    const code = Math.min(4095, Math.round((Math.log2(peak) / MAX_LOG) * 4095)) * 16;
    const scale = Math.pow(2, (code / 65520) * MAX_LOG);
    base[i * 4] = Math.round(linearToSrgb(Math.min(r / scale, 1)) * 255);
    base[i * 4 + 1] = Math.round(linearToSrgb(Math.min(g / scale, 1)) * 255);
    base[i * 4 + 2] = Math.round(linearToSrgb(Math.min(b / scale, 1)) * 255);
    base[i * 4 + 3] = 255;
    gain.data[i * 3] = code >> 8;
    gain.data[i * 3 + 1] = code & 255;
    codes[i] = code;
  }
  let jpg;
  let quality;
  let error;
  for (quality of qualities) {
    jpg = jpeg.encode({ data: base, width, height }, quality).data;
    error = brightError(data, jpg, codes, width, height);
    if (error <= tolerance) break;
  }
  const png = PNG.sync.write(gain, { colorType: 2, inputColorType: 2, inputHasAlpha: false });
  await writeFile(`${outBase}.jpg`, jpg);
  await writeFile(`${outBase}.gain.png`, png);
  return { width, height, quality, brightError: error, jpg: jpg.length, png: png.length };
}

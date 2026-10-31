// 还原 cindy-plugin/hdrPack.mjs 压缩的 HDR：底图 JPEG（sRGB）× 增益 PNG（log2 编码，R 高字节 / G 低字节）。
// 插件版用它代替 .hdr（体积约 1/5），网页版仍直接加载 Poly Haven 的 .hdr。
import * as THREE from "three";

const MAX_LOG = 24;

async function readPixels(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: ${response.status}`);
  // colorSpaceConversion: none —— 按文件里的原值读，不做色彩管理
  const bitmap = await createImageBitmap(await response.blob(), { colorSpaceConversion: "none", premultiplyAlpha: "none" });
  const { width, height } = bitmap;
  const canvas = new OffscreenCanvas(width, height);
  const context = canvas.getContext("2d", { willReadFrequently: true });
  context.drawImage(bitmap, 0, 0);
  bitmap.close();
  return context.getImageData(0, 0, width, height);
}

// sRGB 8 位 → 线性，查表
const srgbToLinear = new Float32Array(256);
for (let i = 0; i < 256; i += 1) {
  const c = i / 255;
  srgbToLinear[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

// url 是底图地址（.jpg），增益图在同名的 .gain.png；返回和 RGBELoader 一样的半精度等距柱状贴图
export async function loadPackedHdr(url) {
  const [base, gain] = await Promise.all([readPixels(url), readPixels(url.replace(/\.jpg$/, ".gain.png"))]);
  const { width, height } = base;
  if (gain.width !== width || gain.height !== height) throw new Error(`${url}: 底图和增益图尺寸不一致`);
  const out = new Uint16Array(width * height * 4);
  const one = THREE.DataUtils.toHalfFloat(1);
  // 增益只有 4096 种取值，同样查表
  const scales = new Float32Array(4096);
  for (let i = 0; i < 4096; i += 1) scales[i] = Math.pow(2, ((i * 16) / 65520) * MAX_LOG);
  const toHalf = THREE.DataUtils.toHalfFloat;
  const b = base.data;
  const g = gain.data;
  // 按文件顺序（从上往下）存，配合 flipY = true，和 RGBELoader 的结果一致
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = y * width + x;
      const o = i * 4;
      const scale = scales[((g[i * 4] << 8) | g[i * 4 + 1]) >> 4];
      // 半精度上限 65504（太阳可能更亮），和 RGBELoader 一样截断
      out[o] = toHalf(Math.min(srgbToLinear[b[i * 4]] * scale, 65504));
      out[o + 1] = toHalf(Math.min(srgbToLinear[b[i * 4 + 1]] * scale, 65504));
      out[o + 2] = toHalf(Math.min(srgbToLinear[b[i * 4 + 2]] * scale, 65504));
      out[o + 3] = one;
    }
  }
  const texture = new THREE.DataTexture(out, width, height, THREE.RGBAFormat, THREE.HalfFloatType);
  texture.colorSpace = THREE.LinearSRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.flipY = true;
  texture.needsUpdate = true;
  return texture;
}

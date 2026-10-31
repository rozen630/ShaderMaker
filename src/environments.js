// HDR 来自 Poly Haven（CC0）。背景直接显示环境，所以用 2k，1k 放大后会糊。
// Cindy 插件页面不能联网、整包又限 8 MB，打包时用 esbuild define 换成包内压缩过的版本
// （底图 JPEG + 增益 PNG，扩展名 .jpg，由 src/packedHdr.js 还原；见 cindy-plugin/build.mjs）
const HDR_BASE = typeof __SHADERMAKER_HDR_BASE__ === "string" ? __SHADERMAKER_HDR_BASE__ : "https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr";
const HDR_RES = typeof __SHADERMAKER_HDR_RES__ === "string" ? __SHADERMAKER_HDR_RES__ : "2k";
const HDR_EXT = typeof __SHADERMAKER_HDR_EXT__ === "string" ? __SHADERMAKER_HDR_EXT__ : "hdr";
const polyHaven = (name) => `${HDR_BASE}/${HDR_RES}/${name}_${HDR_RES}.${HDR_EXT}`;

export const environments = {
  studio: {
    id: "studio",
    name: "摄影棚",
    keys: ["摄影棚", "棚拍", "studio", "indoor", "室内"],
    hdr: polyHaven("royal_esplanade"),
    background: 0x141820,
    exposure: 1.02,
    rotation: 0.55,
    key: { color: 0xfff3e2, intensity: 0.55, position: [3.4, 5.2, 2.6] },
    fill: { color: 0xa9c8ff, intensity: 0.16, position: [-3.6, 2.0, -1.8] },
    rim: { color: 0x8ee7c5, intensity: 2.2, position: [-1.5, 2.3, 2.2] },
    hemi: 0.18,
  },
  sunset: {
    id: "sunset",
    name: "日落",
    keys: ["日落", "黄昏", "暖光", "sunset", "golden hour", "dusk"],
    hdr: polyHaven("venice_sunset"),
    background: 0x2a1a14,
    exposure: 1.12,
    rotation: 0.15,
    key: { color: 0xffb067, intensity: 0.35, position: [4.2, 3.6, 1.4] },
    fill: { color: 0x6f8cff, intensity: 0.1, position: [-3.2, 1.6, -2.2] },
    rim: { color: 0xff7a3c, intensity: 1.8, position: [-2.2, 1.8, 2.4] },
    hemi: 0.08,
  },
  night: {
    id: "night",
    name: "夜景",
    keys: ["夜景", "夜晚", "黑夜", "night", "moon", "dark"],
    hdr: polyHaven("moonless_golf"),
    background: 0x07090f,
    exposure: 0.92,
    rotation: 1.15,
    key: { color: 0xcfe0ff, intensity: 0.22, position: [2.6, 5.8, 1.8] },
    fill: { color: 0x4d6dff, intensity: 0.08, position: [-3.8, 1.4, -1.2] },
    rim: { color: 0x7aa7ff, intensity: 1.4, position: [-1.1, 2.6, 2.6] },
    hemi: 0.06,
  },
  plaza: {
    id: "plaza",
    name: "户外广场",
    keys: ["户外", "广场", "室外", "plaza", "outdoor", "daylight"],
    hdr: polyHaven("spruit_sunrise"),
    background: 0x8ea4b8,
    exposure: 1.08,
    rotation: 0.35,
    key: { color: 0xfff6e8, intensity: 0.28, position: [3.8, 6.2, 2.2] },
    fill: { color: 0x9ec4ff, intensity: 0.12, position: [-4.0, 2.4, -2.0] },
    rim: { color: 0xffffff, intensity: 0.9, position: [-1.8, 3.0, 2.8] },
    hemi: 0.1,
  },
};

export const defaultEnvironment = "studio";

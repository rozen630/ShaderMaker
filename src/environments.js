// HDR 来自 Poly Haven（CC0）。背景直接显示环境，所以用 2k，1k 放大后会糊
const POLYHAVEN = "https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/2k";

export const environments = {
  studio: {
    id: "studio",
    name: "摄影棚",
    keys: ["摄影棚", "棚拍", "studio", "indoor", "室内"],
    hdr: `${POLYHAVEN}/royal_esplanade_2k.hdr`,
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
    hdr: `${POLYHAVEN}/venice_sunset_2k.hdr`,
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
    hdr: `${POLYHAVEN}/moonless_golf_2k.hdr`,
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
    hdr: `${POLYHAVEN}/spruit_sunrise_2k.hdr`,
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

import { presets } from "./shaders.js";
import { environments } from "./environments.js";

const colorMap = {
  红: [0.86, 0.12, 0.16],
  赤: [0.86, 0.12, 0.16],
  red: [0.86, 0.12, 0.16],
  橙: [0.95, 0.48, 0.12],
  orange: [0.95, 0.48, 0.12],
  金: [0.96, 0.78, 0.28],
  gold: [0.96, 0.78, 0.28],
  golden: [0.96, 0.78, 0.28],
  黄: [0.95, 0.86, 0.22],
  yellow: [0.95, 0.86, 0.22],
  绿: [0.18, 0.78, 0.38],
  green: [0.18, 0.78, 0.38],
  青: [0.18, 0.86, 0.78],
  cyan: [0.18, 0.86, 0.78],
  teal: [0.1, 0.62, 0.58],
  蓝: [0.18, 0.42, 0.95],
  blue: [0.18, 0.42, 0.95],
  深蓝: [0.05, 0.12, 0.32],
  navy: [0.05, 0.12, 0.32],
  紫: [0.55, 0.28, 0.86],
  purple: [0.55, 0.28, 0.86],
  violet: [0.55, 0.28, 0.86],
  粉: [0.95, 0.45, 0.72],
  pink: [0.95, 0.45, 0.72],
  白: [0.92, 0.94, 0.98],
  white: [0.92, 0.94, 0.98],
  黑: [0.04, 0.04, 0.05],
  black: [0.04, 0.04, 0.05],
  灰: [0.45, 0.46, 0.48],
  gray: [0.45, 0.46, 0.48],
  grey: [0.45, 0.46, 0.48],
  银: [0.78, 0.82, 0.88],
  silver: [0.78, 0.82, 0.88],
};

const presetHints = [
  { id: "lookdev", keys: ["lookdev", "look dev", "校准", "标准灰", "灰卡", "macbeth", "色卡"] },
  { id: "lava", keys: ["岩浆", "熔岩", "火山", "lava", "molten", "magma"] },
  { id: "ocean", keys: ["海", "海洋", "水", "浪", "ocean", "sea", "water"] },
  { id: "aurora", keys: ["极光", "aurora", "northern"] },
  { id: "stars", keys: ["星空", "星星", "宇宙", "星河", "star", "space", "galaxy", "night"] },
  { id: "plasma", keys: ["等离子", "赛博", "故障", "plasma", "cyber"] },
  { id: "marble", keys: ["大理石", "玉", "石纹", "marble"] },
  { id: "fire", keys: ["火", "火焰", "燃烧", "fire", "flame", "ember"] },
  { id: "neon", keys: ["霓虹", "城市", "夜店", "neon", "city"] },
];

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function mixColor(a, b, t = 0.5) {
  return [a[0] * (1 - t) + b[0] * t, a[1] * (1 - t) + b[1] * t, a[2] * (1 - t) + b[2] * t];
}

function findColors(text) {
  const hits = [];
  for (const [name, rgb] of Object.entries(colorMap)) {
    if (text.includes(name)) hits.push({ name, rgb });
  }
  return hits;
}

function nudge(current, amount, min, max) {
  return clamp(current + amount, min, max);
}

export function interpretPrompt(raw, state) {
  const text = raw.trim().toLowerCase();
  if (!text) return { ok: false, message: "先输入一句想改的效果。" };

  const next = { ...state.params };
  const notes = [];
  let shader = state.shader;

  for (const item of presetHints) {
    if (item.keys.some((key) => text.includes(key))) {
      const preset = presets[item.id];
      shader = preset.shader;
      Object.assign(next, preset);
      notes.push(`切换到 ${item.id}`);
      break;
    }
  }

  const colors = findColors(text);
  if (colors.length >= 2) {
    next.uColorA = mixColor(colors[0].rgb, [0.03, 0.03, 0.04], 0.35);
    next.uColorB = colors[0].rgb;
    next.uAccent = colors[1].rgb;
    notes.push(`主色 ${colors[0].name}，点缀 ${colors[1].name}`);
  } else if (colors.length === 1) {
    next.uColorB = colors[0].rgb;
    next.uAccent = mixColor(colors[0].rgb, [1, 1, 1], 0.35);
    next.uColorA = mixColor(colors[0].rgb, [0.02, 0.02, 0.03], 0.7);
    notes.push(`颜色偏向 ${colors[0].name}`);
  }

  if (/更快|再快|加速|faster|speed up|quicker/.test(text)) {
    next.uSpeed = nudge(next.uSpeed, 0.25, 0, 2);
    notes.push("加快");
  }
  if (/更慢|慢一点|减速|slower|slow down|calmer|平静|安静|温柔/.test(text)) {
    next.uSpeed = nudge(next.uSpeed, -0.22, 0, 2);
    next.uWarp = nudge(next.uWarp, -0.12, 0, 2.4);
    notes.push("放慢、更稳");
  }
  if (/冻结|暂停|freeze|stop|静止/.test(text)) {
    next.uSpeed = 0;
    notes.push("冻结动画");
  }
  if (/更亮|亮一点|brighter|bloom/.test(text)) {
    next.uIntensity = nudge(next.uIntensity, 0.18, 0.3, 2);
    next.uGlow = nudge(next.uGlow, 0.15, 0, 2);
    notes.push("提高亮度");
  }
  if (/更暗|暗一点|dim|darker/.test(text)) {
    next.uIntensity = nudge(next.uIntensity, -0.18, 0.3, 2);
    notes.push("压暗");
  }
  if (/发光|光晕|glow|bloom/.test(text)) {
    next.uGlow = nudge(next.uGlow, 0.28, 0, 2);
    notes.push("加强发光");
  }
  if (/对比|更冲|punchy|contrast/.test(text)) {
    next.uContrast = nudge(next.uContrast, 0.16, 0.4, 2);
    notes.push("提高对比");
  }
  if (/细|更密|zoom in|smaller|tighter|细节/.test(text)) {
    next.uScale = nudge(next.uScale, 0.45, 0.4, 5);
    notes.push("纹路更细");
  }
  if (/粗|更大|zoom out|bigger|broader|宏大/.test(text)) {
    next.uScale = nudge(next.uScale, -0.4, 0.4, 5);
    notes.push("纹路更阔");
  }
  if (/扭曲|混乱|乱|chaotic|warp|glitch/.test(text)) {
    next.uWarp = nudge(next.uWarp, 0.3, 0, 2.4);
    notes.push("增加扭曲");
  }
  if (/干净|平滑|smooth|clean/.test(text)) {
    next.uWarp = nudge(next.uWarp, -0.25, 0, 2.4);
    notes.push("更干净");
  }
  if (/换一种|随机|shuffle|random/.test(text)) {
    next.uSeed = Math.floor(Math.random() * 200);
    notes.push("换了一组噪声种子");
  }
  if (/更金属|金属感|metallic|more metal/.test(text)) {
    next.uMetalness = nudge(next.uMetalness, 0.22, 0, 1);
    next.uRoughness = nudge(next.uRoughness, -0.12, 0, 1);
    notes.push("提高金属度");
  }
  if (/塑料|陶瓷|plastic|ceramic|less metal/.test(text)) {
    next.uMetalness = nudge(next.uMetalness, -0.25, 0, 1);
    notes.push("更像介质");
  }
  if (/更光滑|更亮泽|glossier|smoother|polish/.test(text)) {
    next.uRoughness = nudge(next.uRoughness, -0.16, 0, 1);
    next.uEnv = nudge(next.uEnv, 0.12, 0, 2.4);
    notes.push("更光滑");
  }
  if (/更粗糙|磨砂|rougher|matte/.test(text)) {
    next.uRoughness = nudge(next.uRoughness, 0.18, 0, 1);
    notes.push("更粗糙");
  }
  if (/环境光|ibl/.test(text)) {
    next.uEnv = nudge(next.uEnv, 0.2, 0, 2.4);
    notes.push("加强环境光");
  }

  let environment = state.environment;
  for (const env of Object.values(environments)) {
    if (env.keys.some((key) => text.includes(key))) {
      environment = env.id;
      notes.push(`环境切到 ${env.name}`);
      break;
    }
  }

  if (!notes.length) {
    return {
      ok: false,
      message: "没听懂这句。可以试：更红、慢一点、改成星空、加发光。",
    };
  }

  return {
    ok: true,
    shader,
    environment,
    params: next,
    message: notes.join(" · "),
  };
}

export const hintPrompts = [
  "回到 lookdev",
  "切到日落环境",
  "make it more metallic",
  "换成夜景",
  "改成岩浆，慢一点",
];

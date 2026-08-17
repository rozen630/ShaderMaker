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
  { id: "lookdev", keys: ["lookdev", "look dev", "校准", "灰卡", "macbeth", "色卡"] },
  { id: "brushedSteel", keys: ["拉丝钢", "拉丝金属", "brushed steel", "brushed metal"] },
  { id: "frostedGlass", keys: ["磨砂玻璃", "雾面玻璃", "frosted glass"] },
  { id: "amberGlass", keys: ["琥珀玻璃", "茶色玻璃", "amber glass"] },
  { id: "glossyPlastic", keys: ["亮面塑料", "光面塑料", "glossy plastic"] },
  { id: "mattePlastic", keys: ["哑光塑料", "磨砂塑料", "matte plastic"] },
  { id: "carPaint", keys: ["车漆", "汽车漆", "car paint"] },
  { id: "soapFilm", keys: ["薄膜虹彩", "肥皂膜", "油膜", "soap film", "thin film"] },
  { id: "chrome", keys: ["铬", "chrome", "镜子", "mirror"] },
  { id: "gray", keys: ["灰球", "标准灰", "18%灰", "gray ball", "grey ball"] },
  { id: "aluminum", keys: ["铝", "铝合金", "aluminum", "aluminium"] },
  { id: "steel", keys: ["钢", "钢材", "steel"] },
  { id: "copper", keys: ["铜", "紫铜", "copper"] },
  { id: "gold", keys: ["金球", "黄金球", "gold ball"] },
  { id: "titanium", keys: ["钛", "钛金属", "titanium"] },
  { id: "rubber", keys: ["橡胶", "rubber"] },
  { id: "ceramic", keys: ["陶瓷", "瓷器", "ceramic", "porcelain"] },
  { id: "lacquer", keys: ["烤漆", "漆面", "lacquer"] },
  { id: "pearl", keys: ["珍珠", "珠光", "pearl"] },
  { id: "velvet", keys: ["丝绒", "天鹅绒", "velvet"] },
  { id: "satin", keys: ["缎面", "丝绸", "satin", "silk"] },
  { id: "leather", keys: ["皮革", "皮质", "leather"] },
  { id: "water", keys: ["水球", "清水", "water material"] },
  { id: "acrylic", keys: ["亚克力", "有机玻璃", "acrylic"] },
  { id: "diamond", keys: ["钻石", "水晶", "diamond", "crystal"] },
  { id: "glass", keys: ["玻璃球", "玻璃", "glass"] },
  { id: "lava", keys: ["岩浆", "熔岩", "火山", "lava", "molten", "magma"] },
  { id: "ocean", keys: ["海", "海洋", "水", "浪", "ocean", "sea", "water"] },
  { id: "aurora", keys: ["极光", "aurora", "northern"] },
  { id: "stars", keys: ["星空", "星星", "宇宙", "星河", "star", "space", "galaxy"] },
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
  let presetId = state.preset || state.shader;

  for (const item of presetHints) {
    if (item.keys.some((key) => text.includes(key))) {
      const preset = presets[item.id];
      presetId = item.id;
      shader = preset.shader;
      Object.assign(next, preset);
      notes.push(`切换到 ${preset.name || item.id}`);
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
    if (next.uTransmission > 0.4) next.uAttenuationColor = colors[0].rgb;
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
  if (/更金属|金属感|metallic|more metal|chrome|铬/.test(text)) {
    next.uMetalness = nudge(next.uMetalness, 0.22, 0, 1);
    next.uRoughness = nudge(next.uRoughness, -0.12, 0, 1);
    notes.push("提高金属度");
  }
  if (/塑料|陶瓷|plastic|ceramic|less metal|电介质/.test(text)) {
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
  if (/清漆|车漆|clearcoat|coat/.test(text) && !/去掉清漆|不要清漆|无清漆|remove clearcoat|no clearcoat/.test(text)) {
    next.uClearcoat = nudge(next.uClearcoat, 0.28, 0, 1);
    next.uClearcoatRoughness = nudge(next.uClearcoatRoughness, -0.08, 0, 1);
    notes.push("加强清漆");
  }
  if (/去掉清漆|不要清漆|无清漆|remove clearcoat|no clearcoat/.test(text)) {
    next.uClearcoat = 0;
    notes.push("去掉清漆");
  }
  if (/布|织物|丝绒|sheen|velvet|cloth/.test(text)) {
    next.uSheen = nudge(next.uSheen, 0.3, 0, 1);
    next.uMetalness = nudge(next.uMetalness, -0.2, 0, 1);
    notes.push("加织物光泽");
  }
  if (/虹彩|珠光|变彩|iridescent|iridescence/.test(text)) {
    next.uIridescence = nudge(next.uIridescence, 0.35, 0, 1);
    notes.push("加强虹彩薄膜");
  }
  if (/透明|透射|transmission/.test(text) && !/玻璃|glass/.test(text)) {
    next.uTransmission = nudge(next.uTransmission, 0.35, 0, 1);
    next.uMetalness = 0;
    next.uRoughness = nudge(next.uRoughness, -0.18, 0, 1);
    notes.push("提高透射");
  }
  if (/更厚|厚一点|thicker/.test(text)) {
    next.uThickness = nudge(next.uThickness, 0.2, 0, 2);
    notes.push("增加体积厚度");
  }
  if (/更薄|薄一点|thinner/.test(text) && !/薄膜/.test(text)) {
    next.uThickness = nudge(next.uThickness, -0.2, 0, 2);
    notes.push("减小体积厚度");
  }
  if (/色散|彩虹折射|dispersion/.test(text)) {
    next.uDispersion = nudge(next.uDispersion, 0.3, 0, 1);
    next.uTransmission = Math.max(next.uTransmission, 0.75);
    notes.push("增加色散");
  }
  if (/吸收|染色玻璃|体积颜色|attenuation|absorption/.test(text)) {
    next.uAttenuationDistance = nudge(next.uAttenuationDistance, -0.5, 0.05, 10);
    notes.push("加强体积吸收");
  }
  if (/折射率|ior/.test(text)) {
    next.uIor = nudge(next.uIor, 0.12, 1, 2.33);
    notes.push("提高折射率");
  }
  if (/各向异性|拉丝|aniso|brushed/.test(text)) {
    next.uAnisotropy = nudge(next.uAnisotropy, 0.28, 0, 1);
    next.uMetalness = nudge(next.uMetalness, 0.18, 0, 1);
    notes.push("加各向异性");
  }
  if (/镜面|高光|specular/.test(text)) {
    next.uSpecularIntensity = nudge(next.uSpecularIntensity, 0.2, 0, 2);
    notes.push("加强镜面反射");
  }
  if (/法线|凹凸|normal|bump/.test(text)) {
    next.uNormal = nudge(next.uNormal, 0.25, 0, 2);
    notes.push("加强法线");
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
      message: "没听懂这句。可以试：更红、慢一点、改成星空、加清漆、更像玻璃。",
    };
  }

  return {
    ok: true,
    preset: presetId,
    shader,
    environment,
    params: next,
    message: notes.join(" · "),
  };
}

export const hintPrompts = {
  pbr: ["回到 lookdev", "换成拉丝钢", "换成磨砂玻璃", "做成珍珠虹彩", "增加色散"],
  shader: ["改成岩浆，慢一点", "改成星空", "make it calmer and more purple", "冻结动画"],
};

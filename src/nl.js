import { presets } from "./presets.js";
import { environments } from "./environments.js";
import { styles } from "./stylize.js";
import { nprPresets } from "./npr.js";
import { displayModels } from "./models.js";

const pbrRenderKeys = ["写实", "真实感", "realistic", "photoreal", "pbr渲染", "回到pbr", "切回pbr"];
const nprRenderKeys = ["npr", "非真实", "风格化渲染"];

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

// 按顺序匹配、先命中先用：更具体的说法（龟裂熔岩、全息膜）要排在泛称（熔岩、全息）前面
const presetHints = [
  { id: "kintsugi", keys: ["金缮", "金继", "裂纹金", "kintsugi"] },
  { id: "crackedLava", keys: ["龟裂熔岩", "裂纹熔岩", "龟裂岩浆", "cracked lava", "cracked magma"] },
  { id: "crystal", keys: ["晶簇", "晶体", "晶面", "crystal facet"] },
  { id: "hexArmor", keys: ["六角装甲", "六边形装甲", "蜂窝装甲", "hex armor", "honeycomb"] },
  { id: "weave", keys: ["丝织", "编织", "织锦", "布纹", "weave"] },
  { id: "scales", keys: ["龙鳞", "鳞片", "鱼鳞", "蛇鳞", "dragon scale", "scales"] },
  { id: "circuit", keys: ["电路板", "电路", "pcb", "circuit"] },
  { id: "biolume", keys: ["生物荧光", "荧光", "bioluminescent", "biolume"] },
  { id: "liquidChrome", keys: ["液态金属", "液体金属", "水银", "liquid metal", "liquid chrome", "mercury"] },
  { id: "holoFoil", keys: ["镭射膜", "镭射", "全息膜", "幻彩膜", "holo foil", "holographic foil"] },
  { id: "nebula", keys: ["星云", "nebula"] },
  { id: "shield", keys: ["能量护盾", "护盾", "力场", "force field", "shield"] },
  { id: "plasmaNet", keys: ["等离子网", "电网", "plasma net"] },
  { id: "lightning", keys: ["电弧", "闪电", "雷电", "lightning"] },
  { id: "plasterWall", keys: ["剥落墙", "掉皮墙", "墙皮", "灰泥墙", "plaster"] },
  { id: "stylizedBrick", keys: ["红砖", "砖墙", "砖块", "brick"] },
  { id: "stoneWall", keys: ["石墙", "鹅卵石", "苔藓石", "cobblestone", "stone wall"] },
  { id: "limestoneBrick", keys: ["石灰岩", "石板路", "铺路石", "limestone", "paver"] },
  { id: "formworkConcrete", keys: ["木模混凝土", "清水模板", "board formed", "formwork"] },
  { id: "mosaic", keys: ["马赛克", "mosaic"] },
  { id: "treeBark", keys: ["树皮", "树干", "bark"] },
  { id: "snowTracks", keys: ["车辙", "轮胎印", "雪地车印", "tracks"] },
  { id: "ice", keys: ["冰面", "冰块", "冰川", "冰晶", "ice", "glacier"] },
  { id: "diamondCut", keys: ["钻石", "diamond", "brilliant"] },
  { id: "quartz", keys: ["水晶", "石英", "quartz"] },
  { id: "emerald", keys: ["祖母绿", "绿宝石", "emerald"] },
  { id: "amberGlass", keys: ["琥珀玻璃", "茶色玻璃", "amber glass"] },
  { id: "amber", keys: ["琥珀", "amber"] },
  { id: "jade", keys: ["翡翠", "玉石", "jade"] },
  { id: "brushedScratch", keys: ["划痕", "刮花", "拉丝划痕", "scratched"] },
  { id: "wornPaint", keys: ["掉漆", "旧漆", "斑驳", "worn paint", "chipped paint"] },
  { id: "damascus", keys: ["大马士革", "花纹钢", "damascus"] },
  { id: "patina", keys: ["铜绿", "铜锈", "绿锈", "patina", "verdigris"] },
  { id: "concrete", keys: ["混凝土", "水泥", "concrete", "cement"] },
  { id: "granite", keys: ["花岗岩", "granite"] },
  { id: "terrazzo", keys: ["水磨石", "terrazzo"] },
  { id: "sand", keys: ["沙丘", "沙地", "沙漠", "沙子", "sand", "dune"] },
  { id: "snow", keys: ["雪地", "积雪", "snow"] },
  { id: "leatherGrain", keys: ["荔枝纹", "皮纹", "leather grain"] },
  { id: "lookdev", keys: ["lookdev", "look dev", "校准", "灰卡", "macbeth", "色卡"] },
  { id: "brushedSteel", keys: ["拉丝钢", "拉丝金属", "brushed steel", "brushed metal"] },
  { id: "frostedGlass", keys: ["磨砂玻璃", "雾面玻璃", "frosted glass"] },
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
  { id: "wood", keys: ["木纹", "木头", "木地板", "木板", "wood", "plank"] },
  { id: "rust", keys: ["锈铁", "生锈", "锈蚀", "铁锈", "rust", "corroded"] },
  { id: "scifi", keys: ["科幻", "机甲", "面板", "sci-fi", "scifi", "panel"] },
  { id: "carbon", keys: ["碳纤维", "carbon"] },
  { id: "rock", keys: ["岩石", "石头", "石块", "rock", "stone"] },
  { id: "hammered", keys: ["锤纹", "锻打", "锤目", "hammered"] },
  { id: "tiles", keys: ["瓷砖", "tile"] },
  { id: "caustics", keys: ["焦散", "水下", "池底", "caustic"] },
  { id: "hologram", keys: ["全息", "hologram", "holo"] },
  { id: "vortex", keys: ["传送门", "漩涡", "星门", "portal", "vortex"] },
  { id: "rain", keys: ["数字雨", "代码雨", "矩阵", "matrix", "digital rain"] },
  { id: "cells", keys: ["细胞", "生物", "有机", "cell", "organic"] },
  { id: "lava", keys: ["岩浆", "熔岩", "火山", "lava", "molten", "magma"] },
  { id: "ocean", keys: ["海", "海洋", "水", "浪", "ocean", "sea", "water"] },
  { id: "aurora", keys: ["极光", "aurora", "northern"] },
  { id: "stars", keys: ["星空", "星星", "宇宙", "星河", "star", "space", "galaxy"] },
  { id: "plasma", keys: ["等离子", "plasma"] },
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
  // 描边粗细由 NPR 处理，不能误触发纹理尺度的「粗 / 细」
  const patternText = text.replace(/(描边|体素)[^，,。;；\s]*/g, "").replace(/(粗|细)体素/g, "");
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
  if (/细(?!胞)|更密|zoom in|smaller|tighter|细节/.test(patternText)) {
    next.uScale = nudge(next.uScale, 0.45, 0.4, 5);
    notes.push("纹路更细");
  }
  if (/粗|更大|zoom out|bigger|broader|宏大/.test(patternText)) {
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

  let style = state.style;
  for (const item of Object.values(styles)) {
    if (item.keys.some((key) => text.includes(key))) {
      style = item.id;
      notes.push(item.id === "none" ? "关闭滤镜" : `滤镜切到 ${item.name}`);
      break;
    }
  }

  let render = state.render;
  let nprPreset = state.nprPreset;
  for (const item of Object.values(nprPresets)) {
    if (item.keys.some((key) => text.includes(key))) {
      render = "npr";
      nprPreset = item.id;
      notes.push(`NPR ${item.name}`);
      break;
    }
  }
  if (render === state.render && nprRenderKeys.some((key) => text.includes(key))) {
    render = "npr";
    notes.push("切到 NPR");
  }
  if (pbrRenderKeys.some((key) => text.includes(key))) {
    render = "pbr";
    style = "none";
    notes.push("回到 PBR 写实");
  }

  let displayModel = null;
  for (const def of Object.values(displayModels)) {
    if (def.keys.some((key) => text.includes(key))) {
      displayModel = def.id;
      notes.push(`展示模型 ${def.label}`);
      break;
    }
  }

  // 体素：开 / 关 / 粗细
  let voxel = null;
  if (/关掉体素|取消体素|去掉体素|不要体素|no voxel/.test(text)) {
    voxel = "off";
    notes.push("关闭体素");
  } else if (/体素更细|细体素|体素细一点|finer voxel/.test(text)) {
    voxel = "fine";
    notes.push("体素：细");
  } else if (/体素更粗|粗体素|体素粗一点|coarser voxel|chunky/.test(text)) {
    voxel = "coarse";
    notes.push("体素：粗");
  } else if (/体素|voxel|teardown/.test(text)) {
    voxel = "on";
    notes.push("体素化");
  }

  let nprValues = null;
  if (/描边(更|再)?粗|粗描边|粗一点的描边|thicker outline/.test(text)) {
    nprValues = { outline: Math.min((state.nprValues?.outline ?? 0.012) + 0.008, 0.04) };
    notes.push("描边加粗");
  } else if (/描边(更|再)?细|细描边|thinner outline/.test(text)) {
    nprValues = { outline: Math.max((state.nprValues?.outline ?? 0.012) - 0.005, 0.003) };
    notes.push("描边变细");
  } else if (/去掉描边|不要描边|无描边|no outline/.test(text)) {
    nprValues = { outline: 0 };
    notes.push("去掉描边");
  }
  if (/阴影(更)?冷|冷色阴影|cool shadow/.test(text)) {
    nprValues = { ...nprValues, shadowHue: 0.9 };
    notes.push("冷色阴影");
  } else if (/阴影(更)?暖|暖色阴影|warm shadow/.test(text)) {
    nprValues = { ...nprValues, shadowHue: -0.8 };
    notes.push("暖色阴影");
  }
  if (nprValues && render !== "npr") {
    render = "npr";
    notes.push("切到 NPR");
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
    style,
    render,
    nprPreset,
    nprValues,
    displayModel,
    voxel,
    params: next,
    message: notes.join(" · "),
  };
}

export const hintPrompts = {
  pbr: ["换成拉丝钢", "做成珍珠虹彩", "二次元渲染", "赛璐璐，描边粗一点", "厚涂，暖色阴影", "回到写实"],
  shader: ["金缮", "龟裂熔岩", "六角装甲，体素化", "液态金属", "能量护盾，更蓝", "回到写实"],
};

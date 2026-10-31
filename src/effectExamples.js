// 内置效果范例：全部只用 effects.js 的基础能力写成，也是给 AI 参考的模板（read_effect 传 id 读取）。
// - scaleBloom：实例（鳞片）+ overlay（换色），点击触发，交替换色
// - ripple：deform（涟漪起伏）+ overlayEmissive（光环），点击触发
// - hoverHalo：overlayEmissive，跟着鼠标指针

export const effectExamples = {
  scaleBloom: {
    id: "scaleBloom",
    name: "鳞片绽放",
    keys: ["鳞片绽放", "绽放", "羽毛", "scale bloom", "feather"],
    description: "点击模型，一片片立体鳞片从点击处向外传播：经过时长出、翘起、扭转，之后平伏，表面换成目标色；再点一次换回来。",
    params: [
      { key: "uFromColor", label: "起始色", type: "color", default: "#5aeee7", lite: true },
      { key: "uToColor", label: "目标色", type: "color", default: "#ee62ee", lite: true },
      { key: "uSpeed", label: "扩散速度", min: 0.1, max: 2, default: 0.55, lite: true },
      { key: "uSize", label: "大小", min: 0.03, max: 0.25, default: 0.12 },
      { key: "uLift", label: "翘起", min: 0, max: 1.6, default: 0.75 },
      { key: "uTwist", label: "扭转", min: 0, max: 2.5, default: 0.6 },
      { key: "uCurl", label: "卷曲", min: 0, max: 1, default: 0.35 },
      { key: "uRadial", label: "背离点击", min: 0, max: 1, default: 0 },
    ],
    common: `// 波带宽（展示空间单位）
const float BAND = 0.16;
// 波前半径：点击后按速度向外走；没点过时在很远的地方
float bloomRadius() { return uClickCount > 0.5 ? uClickAge * uSpeed : -10.0; }
// 奇数次点击从起始色变到目标色，偶数次变回来
bool bloomForward() { return mod(uClickCount, 2.0) > 0.5; }
vec3 bloomFrom() { return bloomForward() ? uFromColor : uToColor; }
vec3 bloomTo() { return bloomForward() ? uToColor : uFromColor; }`,
    overlay: `vec3 overlay(vec3 pos, vec3 normal, vec3 color) {
  if (uClickCount < 0.5) return color;
  // 第一次保留材质原色；之后从上一次换好的颜色开始
  if (uClickCount > 1.5) color = bloomFrom();
  // 表面在波前稍后换色，接缝藏在鳞片下面
  float inside = 1.0 - smoothstep(-0.03, 0.03, distance(pos, uClickPos) - (bloomRadius() - BAND * 0.4));
  return mix(color, bloomTo(), inside);
}`,
    instances: {
      count: 20000,
      seed: 1,
      geometry: { type: "blade", width: 0.6 },
      material: { metalness: 0.1, roughness: 0.42, specular: 0.35, clearcoat: 0.2, iridescence: 0.1, envMap: 0.8 },
      vertex: `vec3 instanceVertex(vec3 p, inout vec3 n, inout vec3 color) {
  // 局部坐标：流向沿 Z 轴，或背离点击点；加一点随机偏角
  mat3 frame = surfaceFrame(iNormal, mix(vec3(0.0, 0.0, 1.0), iRoot - uClickPos, uRadial));
  vec3 up = frame[2];
  vec3 along = rotateAxis(frame[1], up, (iRand.x - 0.5) * 1.1);
  vec3 side = normalize(cross(along, up));

  // t：相对波前的位置（以波带宽为单位），> 0 表示波前已经过去
  float t = (bloomRadius() - distance(iRoot, uClickPos) - (iRand.y - 0.5) * BAND * 0.8) / BAND;
  float grow = smoothstep(-1.2, 0.0, t) * (1.0 - smoothstep(0.6, 2.6, t));
  float size = uSize * (0.55 + 0.9 * iRand.z) * grow;
  float wave = exp(-t * t * 0.9);
  float lift = uLift * wave * (0.55 + 0.7 * iRand.w);
  float twist = uTwist * ((iRand.w - 0.5) * 2.0 + t * 0.3) * wave;
  p.z += uCurl * p.y * p.y * wave;

  // 绕侧向轴翘起，再绕自身长度方向扭转
  vec3 dir = rotateAxis(along, side, lift);
  up = rotateAxis(up, side, lift);
  vec3 across = rotateAxis(side, dir, twist);
  up = rotateAxis(up, dir, twist);
  n = normalize(across * n.x + dir * n.y + up * n.z);

  // 根部从起始色变成目标色，波前附近的鳞片尖保留起始色；根部压暗，缝隙更深
  vec3 root = mix(bloomFrom(), bloomTo(), smoothstep(-0.8, 0.2, t));
  float tip = smoothstep(0.3, 1.0, p.y) * (1.0 - smoothstep(0.3, 1.8, t));
  color = mix(root, bloomFrom(), tip) * mix(0.3, 1.0, smoothstep(0.0, 0.55, p.y));
  return iRoot + iNormal * 0.003 + (across * p.x + dir * p.y + up * p.z) * size;
}`,
    },
  },

  ripple: {
    id: "ripple",
    name: "点击涟漪",
    keys: ["涟漪", "波纹", "水波", "ripple"],
    description: "点击模型，一圈起伏从点击处传开，带一道光环，慢慢衰减。",
    params: [
      { key: "uRippleColor", label: "光色", type: "color", default: "#66d9ff", lite: true },
      { key: "uHeight", label: "起伏", min: 0, max: 0.08, default: 0.025, lite: true },
      { key: "uSpeed", label: "扩散速度", min: 0.2, max: 3, default: 1 },
      { key: "uWavelength", label: "波长", min: 0.03, max: 0.5, default: 0.08 },
      { key: "uDamping", label: "衰减", min: 0, max: 3, default: 0.8 },
      { key: "uGlow", label: "光强", min: 0, max: 5, default: 2 },
    ],
    common: `// 从点击点传出去的一个波包：返回 -1..1 的起伏，envelope 是包络（光环用）
float rippleWave(vec3 pos, out float envelope) {
  envelope = 0.0;
  if (uClickCount < 0.5) return 0.0;
  float x = (distance(pos, uClickPos) - uClickAge * uSpeed) / uWavelength;
  // 包络约两个波长宽，随时间衰减
  envelope = exp(-x * x * 0.35) * exp(-uClickAge * uDamping);
  return sin(x * 3.14159) * envelope;
}`,
    deform: `vec3 deform(vec3 pos, vec3 normal) {
  float envelope;
  return pos + normal * rippleWave(pos, envelope) * uHeight;
}`,
    overlay: `vec3 overlayEmissive(vec3 pos, vec3 normal) {
  // 只有波峰发光
  float envelope;
  float crest = max(rippleWave(pos, envelope), 0.0);
  return uRippleColor * crest * crest * uGlow;
}`,
  },

  hoverHalo: {
    id: "hoverHalo",
    name: "悬停光圈",
    keys: ["光圈", "悬停", "hover"],
    description: "鼠标指着模型时，表面上出现一圈跟着指针走的光环。",
    params: [
      { key: "uHaloColor", label: "光色", type: "color", default: "#ffcc66", lite: true },
      { key: "uRadius", label: "半径", min: 0.05, max: 0.6, default: 0.18, lite: true },
      { key: "uWidth", label: "环宽", min: 0.005, max: 0.1, default: 0.02 },
      { key: "uGlow", label: "光强", min: 0, max: 6, default: 2 },
    ],
    overlay: `vec3 overlayEmissive(vec3 pos, vec3 normal) {
  if (uPointerOn < 0.5) return vec3(0.0);
  float d = distance(pos, uPointerPos);
  float ring = exp(-pow((d - uRadius) / uWidth, 2.0));
  float fill = (1.0 - smoothstep(0.0, uRadius, d)) * 0.15;
  float pulse = 0.75 + 0.25 * sin(uTime * 4.0);
  return uHaloColor * (ring + fill) * pulse * uGlow;
}`,
  },
};

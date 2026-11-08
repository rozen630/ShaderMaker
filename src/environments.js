// 内置环境只有程序天空（src/sky.js）：灯光、曝光和背景由太阳高度 / 方位、云量、霾实时算出。
// 其它环境都是用户上传的全景图（src/customEnv.js），存在本机浏览器里。
// key / background 只用来画面板上的色块
export const environments = {
  sky: {
    id: "sky",
    name: "天空",
    procedural: true,
    keys: ["程序天空", "天空", "蓝天", "白云", "procedural sky", "sky"],
    background: 0x6f8fc0,
    key: { color: 0xfff1d6 },
  },
};

export const defaultEnvironment = "sky";

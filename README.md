# ShaderMaker

用 Three.js 做的 PBR shader 工作台：展台上的 3D cube 实时显示 shader，下面用自然语言改效果。

## 预览

- Cindy 侧边栏：https://shadermaker.workers.xd.team （仅自己可见）
- 本机：`python3 -m http.server 5173 --bind 127.0.0.1`，然后打开 http://127.0.0.1:5173
- Three.js `r170` 通过 unpkg CDN 加载，仓库不托管 `vendor/`。

## 怎么用

1. 默认预设是 **PBR Lookdev**：Macbeth 色卡 + 灰阶 + 金属条，用来看灯光和环境。
2. 预览是 PBR 展台：可见摄影棚 + 金属承台 + 3D cube。
3. HDR 环境光会映在 cube 上；右侧可切摄影棚 / 日落 / 夜景 / 户外广场。
4. 底部也可以说：`切到日落环境`、`换成夜景`、`回到 lookdev`。

解析在浏览器本地完成，不依赖后端。

## 版本管理

仓库在 [github.com/rozen630/ShaderMaker](https://github.com/rozen630/ShaderMaker)，默认分支 `main`。

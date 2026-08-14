# ShaderMaker

用 Three.js 做的 PBR shader 工作台：展台上的 3D cube 实时显示 shader，下面用自然语言改效果。

## 预览

- Cindy 侧边栏：https://shadermaker.workers.xd.team （仅自己可见）
- 本机：`python3 -m http.server 5173 --bind 127.0.0.1`，然后打开 http://127.0.0.1:5173
- Three.js `r170` 通过 unpkg CDN 加载，仓库不托管 `vendor/`。

## 怎么用

1. 右侧分成两个大标签：**PBR** 和 **Shader**。
2. **PBR** 默认是 Lookdev cube：Macbeth 色卡 + 灰阶粗糙度 + 金属条。铬 / 灰 / 金 / 玻璃点进去会变成球。这里只调金属度、粗糙度、清漆、透射这些物理参数。
3. **Shader** 才是极光 / 岩浆 / 星空那些程序纹理，速度、扭曲、发光只出现在这一页。
4. 预览是 PBR 展台：可见摄影棚 + 金属承台 + 主体。
5. HDR 环境光会映在材质上；失败时回落到 `RoomEnvironment`。右侧可切摄影棚 / 日落 / 夜景 / 户外广场。
6. 底部也可以说：`切到日落环境`、`切到铬球`、`换成玻璃`、`回到 lookdev`。

解析在浏览器本地完成，不依赖后端。

## 版本管理

仓库在 [github.com/rozen630/ShaderMaker](https://github.com/rozen630/ShaderMaker)，默认分支 `main`。

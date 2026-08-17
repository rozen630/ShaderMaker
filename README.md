# ShaderMaker

用 Three.js 做的 PBR shader 工作台：展台上的 3D 模型实时显示材质，下面用自然语言改效果。

## 预览

- Cindy 侧边栏：https://shadermaker.workers.xd.team （仅自己可见）
- 本机：`python3 -m http.server 5173 --bind 127.0.0.1`，然后打开 http://127.0.0.1:5173
- Three.js `r170` 通过 unpkg CDN 加载，仓库不托管 `vendor/`。

## 怎么用

1. 右侧分成两个大标签：**PBR** 和 **Shader**。
2. **PBR** 内置 26 个材质，按校准、金属、介质、涂层、织物、透明体、光学分类。覆盖常见金属、塑料、橡胶、陶瓷、车漆、丝绒、玻璃、水、钻石和虹彩薄膜。
3. PBR 参数覆盖 `MeshPhysicalMaterial` 的金属度、粗糙度、镜面、IOR、清漆、Sheen、各向异性、虹彩、透射、体积吸收和色散。
4. **Shader** 才是极光 / 岩浆 / 星空那些程序纹理，速度、扭曲、发光只出现在这一页。
5. 预览是 PBR 展台：可见摄影棚 + 金属承台 + 主体。
6. HDR 环境光会映在材质上；失败时回落到 `RoomEnvironment`。右侧可切摄影棚 / 日落 / 夜景 / 户外广场。
7. 底部可以说：`换成拉丝钢`、`做成珍珠虹彩`、`换成磨砂玻璃`、`增加色散`。

解析在浏览器本地完成，不依赖后端。

## 版本管理

仓库在 [github.com/rozen630/ShaderMaker](https://github.com/rozen630/ShaderMaker)，默认分支 `main`。

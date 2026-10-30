# ShaderMaker

用 Three.js 做的 PBR shader 工作台：展台上的 3D 模型实时显示材质，下面用自然语言改效果。

## 预览

- Cindy 侧边栏：https://shadermaker.workers.xd.team （仅自己可见）
- 本机：`python3 serve.py`，然后打开 http://127.0.0.1:5173（这个服务禁止浏览器缓存，改完代码刷新即生效）
- Three.js `r170` 通过 unpkg CDN 加载，仓库不托管 `vendor/`。

## 怎么用

界面是沉浸式画布：模型占满画面，材质库（左）和外观设置（右）是浮在上面的半透明面板；窄屏和 Cindy 侧栏里面板会依次排到画面下方。右上角切换 **Lite / Pro**（记在本机）：

- **Lite**：材质库、写实 / 卡通、展示模型、环境、滤镜、体素，每种材质只留 3 个常用滑条（卡通再加阴影亮度和描边粗细）。
- **Pro**：全部参数（按基础 / 表层 / 体积等分组）、材质分类筛选、滤镜强度、作用范围、通道检查。
- 两种模式共用同一份材质和设置，切换不丢状态。哪些滑条属于 Lite 由 `src/presets.js` / `src/npr.js` 里的 `lite: true` 决定。

1. 左侧材质库分成两个标签：**PBR 材质** 和 **Shader**。
2. **PBR** 内置 26 个材质，按校准、金属、介质、涂层、织物、透明体、光学分类。覆盖常见金属、塑料、橡胶、陶瓷、车漆、丝绒、玻璃、水、钻石和虹彩薄膜。
3. PBR 参数覆盖 `MeshPhysicalMaterial` 的金属度、粗糙度、镜面、IOR、清漆、Sheen、各向异性、虹彩、透射、体积吸收和色散。
4. **Shader** 内置 58 个程序纹理，带实时缩略图卡片，按类别分组（Pro 模式可筛选，分组定义在 `src/presets.js` 的 `shaderCategories`）：
   - **宝石 · 冰晶**：冰面、钻石切面、水晶、祖母绿、琥珀、翡翠、晶簇——程序贴图 + 透射 / 折射率 / 色散等物理参数
   - **金属**：划痕拉丝、掉漆金属、大马士革钢、铜绿、液态金属、锈铁、锤纹金属
   - **石材 · 陶瓷**：风格化红砖、石灰岩砖、苔藓石墙、剥落墙面、马赛克、木模混凝土、清水混凝土、抛光花岗岩、水磨石、大理石、岩石、釉面瓷砖、金缮
   - **自然**：沙丘、雪地、车辙雪地、老树皮、岩浆、龟裂熔岩、海洋、木纹
   - **有机 · 织物**：荔枝纹皮革、丝织、龙鳞、生物荧光
   - **科幻**：科幻面板、六角装甲、电路板、碳纤维、镭射膜
   - **VFX**（14）：极光、等离子、星空、火焰、霓虹、焦散、全息、传送门、数字雨、细胞、星云、能量护盾、等离子网、电弧
   - **速度统一**：速度 1 = 每个效果的自然速度，动态效果默认 1、静态写实材质默认 0；各效果的快慢集中在 `src/shaders.js` 末尾的 `timeScales`。
   - VFX 特效的底色自动压暗，靠自发光出效果，不会被环境光照成一片灰。
   - **次表面散射**（冰、翡翠、琥珀、大理石、磨砂玻璃、珍珠、雪）、**冰下碎冰**（视差层：表面下几层缓慢漂移的碎冰板，转动视角能看出纵深）和**积雪覆盖**在 Pro 的参数里可调（`src/materialFx.js`）。
   - **置换**：Surface Shader 的高度写在 ORM 贴图的 alpha 通道，顶点着色器按三向投影读出来真的把表面推出去（砖缝凹进去、石头鼓起来），「置换高度」滑条控制；体素开着时不置换。
   - 积雪会真的鼓起来：展示模型加载时做了均匀细分（`src/models.js` 的 `densify`，共享边同一个中点，置换不会裂缝），雪沿平均法线外推，「积雪厚度」控制高度；体素化仍用细分前的网格。
   - 程序贴图用**三向投影**（triplanar）贴到模型上，不走模型 UV，所以 UV 岛之间、球体接缝处都不会裂开；贴图每帧额外做一次可平铺处理，投影重复处也没有接缝（`src/triplanar.js`）。体素每块只取一个颜色，仍按 UV 取样。
   - 「随机变体」整体旋转色相、换噪声种子，快速找配色。
5. 顶栏：**渲染模式** + **作用范围**。
   - **PBR / NPR 一键切换**：两种模式共用同一份材质（底色、ORM、法线、自发光），只换光照模型。
   - NPR 预设：赛璐璐、二次元、厚涂；右侧可调色阶、明暗交界、阴影冷暖、高光、边缘光、描边。
   - **作用于：仅模型 / 全局**。仅模型时背景保持写实 HDR，NPR 材质输出 ACES 反函数抵消画面色调映射，滤镜按主体遮罩生效（不开 Bloom）；全局时背景也换成平涂底色。
6. 右侧：环境（摄影棚 / 日落 / 夜景 / 户外广场）和**画面滤镜**（像素 / 漫画 / 油画 / 素描 / 赛博 / 胶片 / 蓝图）。
   - **NPR 与滤镜的区别**：NPR 是材质 Shader，着色时就知道法线、光源、阴影和材质属性；滤镜是相机后处理，只拿到渲染好的 2D 像素。两者可以叠加。
7. 打开时默认材质是雪地（积雪带置换，能直接看到曲面细分的效果；Lookdev 色卡球在材质库「校准」里）。展示方式参照 MaterialX Viewer：模型悬浮在清晰的 HDR 环境前（Poly Haven 2k，CC0），不放地面、背景板和台座；模型不自动旋转，拖动画面查看。右侧面板可切换展示**模型**：
   - **Shader Ball**（默认）：MaterialX 的 shaderball。外壳挂当前材质；内芯色环和灰底盘是校色参照，任何模式下都保持写实，不参与 NPR / 描边。程序贴图在外壳上平铺 2 次。
   - **球 / 方块**（圆角）：和 Shader Ball 共用同一个取景框，切换时画面大小一致。
   - NPR 描边使用预先算好的平滑法线外扩，凹面和硬边都不会错位。
8. **体素化**（右侧面板最上方：开关 + 精细度滑条 12–96，即模型高度方向的体素数）：Teardown 式效果，把展示模型转成表面体素，用实例化网格渲染。
   - 每块体素记住它在原模型上的 UV，材质贴图按这个点取色，所以一块一个颜色；动画 Shader 照样会动，PBR / NPR、滤镜、通道查看都可以叠加。
   - 体素 AO：按 26 邻域被占用的格数压暗，角落和缝隙更暗；另有逐块亮度抖动和方块边缘轻微压暗。
   - 拖动滑条实时重算，最近 8 个精细度会缓存；Shader Ball 精细度 72 约 4 万块，生成约 70 ms。体素开启时法线贴图强度归零（每块是平面）。
   - 也可以说：`体素化`、`teardown，体素更粗`、`关掉体素`。
9. **通道查看**可以把 Base / AO / 粗糙 / 金属 / 法线 / 自发光单独贴到主体上检查；查看时自动关闭风格化与色调映射，屏幕上就是贴图原值。
10. 底部可以说：`换成科幻面板`、`改成锈铁，二次元`、`赛璐璐，描边粗一点`、`厚涂，暖色阴影`、`像素风`、`回到写实`。

解析在浏览器本地完成，不依赖后端。

## 代码结构

- `src/shaders.js`：GLSL（公共噪声 / Voronoi、Surface 协议、各 Shader）
- `src/presets.js`：PBR 材质库、Shader 预设参数、滑条定义
- `src/npr.js`：NPR 光照模型、描边、PBR → NPR 转换规则
- `src/stylize.js`：画面滤镜后处理管线
- `src/voxel.js`：体素化（表面体素采样、体素 AO、实例化网格、材质体素补丁）
- `src/models.js`：展示模型（Shader Ball / 球 / 方块）与校色件
- `src/environments.js`：HDR 环境；`src/nl.js`：自然语言解析；`src/app.js`：场景与界面（末尾导出给 Cindy 插件用的控制接口）
- `cindy-plugin/`：Cindy 插件（见下文）

## Surface Shader

- Surface 类 Shader 使用 Surface PBR 管线，分别输出 Base Color、AO / Roughness / Metalness、Normal 和 Emissive。
- Surface 法线由各材质自己的高度函数生成，不再共用一张通用噪声法线。
- 直射光来自 Key / Fill 方向光、Rim 点光和半球光，Key Light 开启阴影。
- HDR 经 PMREM 写入 `scene.environment`，提供 IBL 间接漫反射和镜面反射；这不是动态多次反弹 GI。
- 当前法线只改变光照细节，不改变模型轮廓；位移和视差仍未加入。

## NPR 转换规则

NPR 不是滤镜，而是给 `MeshToonMaterial` 打补丁换掉光照：灯光（含阴影）只累计受光量，再统一分阶、上阴影色。PBR 属性按下面的规则转换：

- 金属度：分成天空 / 地平线 / 地面三段的分阶反射，代替 HDR 反射
- 粗糙度：决定硬高光的大小和强度
- 清漆：额外的硬白高光点
- Sheen：边缘光，颜色取 Sheen 颜色
- 透射：半透明加强边缘光，颜色偏向吸收色
- 虹彩 / 色散：彩虹色边缘光
- Surface Shader 逐像素读取 ORM 贴图，同一块材质上的锈和金属会分别处理
- 明暗由主光决定：着色器按方向认出主光，补光 / 点光只给 25% 权重，不改场景灯光本身
- 全局 NPR 背景换平涂色并关闭 ACES；仅模型时保留 ACES，NPR 材质输出 ACES 反函数抵消
- 描边是沿顶点方向外扩的背面外壳；主体用模板缓冲，玻璃主体也不会透出外壳
- 暂不支持：各向异性高光的拉伸形状、体积吸收的厚度变化

## Cindy 插件

ShaderMaker 可以打包成 Cindy 插件：左侧导航多一个 ShaderMaker 入口（整页打开，也可以拖进侧栏或弹成独立窗口），对话里的 AI 能直接调整页面。

```bash
npm install
npm run build:plugin   # 生成 dist/cindy-plugin/
```

然后用 Cindy 的 `ghost_forge_pack` 打包 `dist/cindy-plugin/`（或 `ghost_forge_install` 直接安装）。

- **AI 工具**（没有打开的 ShaderMaker 页面时，会自动在当前任务的右侧栏打开任务页，首次加载约 2 秒）：
  - `set_look`：精确设置材质、PBR / NPR、NPR 预设、滤镜与强度、作用范围、环境、展示模型、体素与精细度、材质参数、三色、NPR 参数，返回完整状态。
  - `describe_look`：一句话调整，等同于页面输入框（复用 `src/nl.js`）。
  - `snapshot`：截取当前画面给 AI 看，方便它边调边检查。
- **打包时的改动**（插件页面 CSP 只允许包内脚本，且不能联网）：
  - esbuild 把 `src/` 与 three.js 打成一个 `app.js`，替代页面里的 importmap（内联脚本会被 CSP 拦截）。
  - HDR 放进包里。整包限 8 MB，所以插件版用 1k HDR（下载缓存在 `.cache/hdr/`），网页版仍用 2k。
  - `ghost.json` 由 `cindy-plugin/manifest.mjs` 生成，工具参数的可选项读自现有数据，新增材质 / 滤镜 / 环境不用改插件代码。
- 同一份页面有两个入口：左侧导航的主视图（`mainView`）和跟任务走的右侧栏任务页（`taskView`）。可能同时开着好几份，后台按「当前任务的任务页 → 主视图 → 其它」选一份执行，不会重复执行。
- 结构：`cindy-plugin/page.js`（页面入口，经 BroadcastChannel 接收请求）、`cindy-plugin/main.js`（插件后台，选页面 / 自动打开任务页 / 转发 AI 工具调用）、`src/app.js` 末尾的 `shaderMaker` 控制接口。

## 第三方资源

- `assets/models/materialx-shaderball.glb`：MaterialX Viewer 的默认 Shader Ball，来自 [AcademySoftwareFoundation/MaterialX](https://github.com/AcademySoftwareFoundation/MaterialX/tree/main/resources/Geometry)，Apache License 2.0，授权原文见 `assets/models/MATERIALX-LICENSE.txt`。内芯色环为 ShaderMaker 程序生成，不是原始资源的一部分。
- `src/vendor/tileable-shaders.js`：[tuxalin/procedural-tileable-shaders](https://github.com/tuxalin/procedural-tileable-shaders)（MIT，授权原文见 `src/vendor/TILEABLE-SHADERS-LICENSE.txt`），新版 Shader 用到的可平铺噪声、Voronoi、裂纹、六边形、编织、Domain Warping。原库有几处类型错误编译不过，做了最小修补，改动处标了「ShaderMaker」。
- HDR 环境：[Poly Haven](https://polyhaven.com/hdris)（CC0），网页版运行时从 Poly Haven CDN 加载 2k 版本；Cindy 插件版把 1k 版本打进包里。

## 版本管理

仓库在 [github.com/rozen630/ShaderMaker](https://github.com/rozen630/ShaderMaker)，默认分支 `main`。

# ShaderMaker

用 Three.js 做的 PBR shader 工作台：展台上的 3D 模型实时显示材质，下面用自然语言改效果。

## 预览

- Cindy 侧边栏：https://shadermaker.workers.xd.team （仅自己可见）
- 本机：`python3 serve.py`，然后打开 http://127.0.0.1:5173（这个服务禁止浏览器缓存，改完代码刷新即生效）
- Three.js `r170` 通过 unpkg CDN 加载，仓库不托管 `vendor/`。

## 怎么用

1. 左侧材质库分成两个标签：**PBR 材质** 和 **Shader**。
2. **PBR** 内置 26 个材质，按校准、金属、介质、涂层、织物、透明体、光学分类。覆盖常见金属、塑料、橡胶、陶瓷、车漆、丝绒、玻璃、水、钻石和虹彩薄膜。
3. PBR 参数覆盖 `MeshPhysicalMaterial` 的金属度、粗糙度、镜面、IOR、清漆、Sheen、各向异性、虹彩、透射、体积吸收和色散。
4. **Shader** 内置 20 个程序纹理，带实时缩略图卡片：
   - **Surface · PBR**（10）：岩浆、海洋、大理石、木纹、锈铁、科幻面板、碳纤维、岩石、锤纹金属、釉面瓷砖
   - **VFX**（10）：极光、等离子、星空、火焰、霓虹、焦散、全息、传送门、数字雨、细胞
   - 「随机变体」整体旋转色相、换噪声种子，快速找配色。
5. 顶栏：**渲染模式** + **作用范围**。
   - **PBR / NPR 一键切换**：两种模式共用同一份材质（底色、ORM、法线、自发光），只换光照模型。
   - NPR 预设：赛璐璐、二次元、厚涂；右侧可调色阶、明暗交界、阴影冷暖、高光、边缘光、描边。
   - **作用于：仅模型 / 全局**。仅模型时背景保持写实 HDR，NPR 材质输出 ACES 反函数抵消画面色调映射，滤镜按主体遮罩生效（不开 Bloom）；全局时背景也换成平涂底色。
6. 右侧：环境（摄影棚 / 日落 / 夜景 / 户外广场）和**画面滤镜**（像素 / 漫画 / 油画 / 素描 / 赛博 / 胶片 / 蓝图）。
   - **NPR 与滤镜的区别**：NPR 是材质 Shader，着色时就知道法线、光源、阴影和材质属性；滤镜是相机后处理，只拿到渲染好的 2D 像素。两者可以叠加。
7. 展示方式参照 MaterialX Viewer：模型悬浮在清晰的 HDR 环境前（Poly Haven 2k，CC0），不放地面、背景板和台座。视口左上角可切换展示**模型**：
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
- `src/environments.js`：HDR 环境；`src/nl.js`：自然语言解析；`src/app.js`：场景与界面

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

## 第三方资源

- `assets/models/materialx-shaderball.glb`：MaterialX Viewer 的默认 Shader Ball，来自 [AcademySoftwareFoundation/MaterialX](https://github.com/AcademySoftwareFoundation/MaterialX/tree/main/resources/Geometry)，Apache License 2.0，授权原文见 `assets/models/MATERIALX-LICENSE.txt`。内芯色环为 ShaderMaker 程序生成，不是原始资源的一部分。
- HDR 环境：[Poly Haven](https://polyhaven.com/hdris)（CC0），运行时从 Poly Haven CDN 加载 2k 版本。

## 版本管理

仓库在 [github.com/rozen630/ShaderMaker](https://github.com/rozen630/ShaderMaker)，默认分支 `main`。

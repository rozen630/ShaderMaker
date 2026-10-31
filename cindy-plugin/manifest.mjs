// ghost.json 生成器：工具参数的枚举和说明全部来自 catalog（现有数据），新增材质 / 滤镜 / 环境不用改这里。
const list = (items) => items.map((item) => `${item.id}=${item.name}`).join("，");
const ranges = (items) => items.map((item) => `${item.key}(${item.label} ${item.min}–${item.max})`).join("，");

export function buildManifest(catalog, version) {
  const pbr = catalog.materials.filter((item) => item.library === "pbr");
  const shader = catalog.materials.filter((item) => item.library === "shader");
  const voxel = catalog.voxelResolution;

  return {
    schemaVersion: 3,
    minCindyVersion: "0.1.120",
    id: "shadermaker",
    name: "ShaderMaker",
    description: "材质与 Shader 预览工作台：PBR 材质库、程序化 Shader、NPR 卡通渲染、画面滤镜、Teardown 式体素化和鳞片绽放动画；AI 可以直接写 GLSL 新增自定义 Shader。",
    whenToUse:
      "需要预览或调整材质球、PBR 材质、程序化 Shader 效果、NPR 卡通渲染、描边、画面滤镜（像素/漫画/油画等）、体素化效果，或想看材质在不同环境光下的渲染结果，或想让 AI 写一个新的程序化材质 / Shader 效果时找我",
    version,
    entry: "main.js",
    icon: "assets/icon.png",
    command: "shadermaker",
    mainView: { title: "ShaderMaker", icon: "image", html: "main-view.html" },
    // 同一份页面也作为任务页：AI 调用工具时如果没有打开的页面，后台会在当前任务右侧栏自动打开它
    taskView: { title: "ShaderMaker", html: "main-view.html" },
    tools: [
      {
        name: "set_look",
        description:
          "精确设置 ShaderMaker 页面的材质、渲染模式、滤镜、环境、展示模型、体素和材质参数，只改传入的项。返回调整后的完整状态与无法识别的项（warnings）。没有打开的 ShaderMaker 页面时会自动在当前任务右侧栏打开（首次需加载几秒）。",
        parameters: {
          type: "object",
          properties: {
            material: {
              type: "string",
              description: `材质预设 id，切换后材质参数重置为该预设。PBR 材质：${list(pbr)}。Shader 效果：${list(shader)}。也可以是用 write_shader 写的自定义 Shader 的 id（read_shader 可列出）`,
            },
            render: { type: "string", enum: ["pbr", "npr"], description: "pbr=写实渲染，npr=卡通渲染（带描边）" },
            nprPreset: {
              type: "string",
              enum: catalog.nprPresets.map((item) => item.id),
              description: `NPR 风格预设：${list(catalog.nprPresets)}。只传它而不传 render 时会自动切到 npr`,
            },
            style: {
              type: "string",
              enum: catalog.styles.map((item) => item.id),
              description: `画面滤镜：${list(catalog.styles)}`,
            },
            styleAmount: { type: "number", minimum: 0, maximum: 1, description: "滤镜强度 0–1" },
            scope: {
              type: "string",
              enum: ["subject", "global"],
              description: "NPR 与滤镜的作用范围：subject=只作用于展示模型，global=整个画面",
            },
            environment: {
              type: "string",
              enum: catalog.environments.map((item) => item.id),
              description: `环境光（HDR）：${list(catalog.environments)}`,
            },
            displayModel: {
              type: "string",
              enum: catalog.displayModels.map((item) => item.id),
              description: `展示模型：${list(catalog.displayModels)}`,
            },
            voxel: { type: "boolean", description: "体素化开关（Teardown 式方块效果）" },
            voxelResolution: {
              type: "integer",
              minimum: voxel.min,
              maximum: voxel.max,
              description: `体素精细度 ${voxel.min}–${voxel.max}，越大方块越小，默认 ${voxel.default}。只传它时会自动打开体素`,
            },
            params: {
              type: "object",
              additionalProperties: { type: "number" },
              description: `材质参数微调，键为参数名，超出范围会被截断：${ranges(catalog.params)}`,
            },
            colors: {
              type: "object",
              properties: {
                uColorA: { type: "string", description: "暗部色 #rrggbb" },
                uColorB: { type: "string", description: "主色 #rrggbb" },
                uAccent: { type: "string", description: "高光 / 点缀色 #rrggbb" },
              },
              description: "材质三色（#rrggbb）",
            },
            scales: {
              type: "object",
              description:
                "鳞片绽放：模型表面长出一片片立体鳞片，从起点向外传播——经过时翘起、扭转，之后平伏，表面换成目标色。再播放一次会换回来。用户也可以直接点击模型触发。",
              properties: {
                on: { type: "boolean", description: "开关" },
                play: { type: "boolean", description: "true = 从画面正中对着的模型表面开始播放一波" },
                progress: {
                  type: ["number", "null"],
                  minimum: 0,
                  maximum: 1,
                  description: "把当前这一波停在某个进度（0–1，0.3 左右鳞片最多），方便 snapshot 截图；没有波时会先播放；null = 继续播放",
                },
                colorFrom: { type: "string", description: "起始色 #rrggbb（鳞片尖）" },
                colorTo: { type: "string", description: "目标色 #rrggbb（鳞片根和换色后的表面）" },
                density: { type: "number", minimum: 2000, maximum: 40000, description: "鳞片数量，默认 20000" },
                size: { type: "number", minimum: 0.03, maximum: 0.25, description: "鳞片大小（模型高约 1.5），默认 0.12" },
                speed: { type: "number", minimum: 0.1, maximum: 2, description: "扩散速度，默认 0.55" },
                lift: { type: "number", minimum: 0, maximum: 1.6, description: "翘起角度（弧度），默认 0.75" },
                twist: { type: "number", minimum: 0, maximum: 2.5, description: "扭转，默认 0.6" },
                curl: { type: "number", minimum: 0, maximum: 1, description: "卷曲，默认 0.35" },
                flow: { type: "string", enum: ["z", "radial"], description: "鳞片朝向：z = 沿模型 Z 轴排列，radial = 背离起点" },
              },
            },
            nprValues: {
              type: "object",
              additionalProperties: { type: "number" },
              description: `NPR 光照参数微调（render=npr 时生效）：${ranges(catalog.nprParams)}`,
            },
          },
        },
      },
      {
        name: "describe_look",
        description:
          "用一句自然语言调整 ShaderMaker 页面，等同于在页面输入框里输入（例如「生锈的铜，卡通描边，体素粗一点」）。返回页面的解析说明与调整后的完整状态。没有打开的 ShaderMaker 页面时会自动在当前任务右侧栏打开（首次需加载几秒）。",
        parameters: {
          type: "object",
          properties: {
            text: { type: "string", description: "效果描述，用户原话透传，不要扩写" },
          },
          required: ["text"],
        },
      },
      {
        name: "snapshot",
        description:
          "截取 ShaderMaker 当前画面给你查看，并返回当前完整状态。调整后想确认效果是否符合要求时使用。没有打开的 ShaderMaker 页面时会自动在当前任务右侧栏打开（首次需加载几秒）。",
        parameters: {
          type: "object",
          properties: {
            max_size: { type: "integer", minimum: 256, maximum: 1280, description: "截图长边像素，默认 768" },
          },
        },
      },
      {
        name: "read_shader",
        description:
          "读取 ShaderMaker 的 Shader 写法说明和源码。不传 id：返回自定义 Shader 的写法说明（可用的 uniform、函数、规则）以及全部内置 / 自定义 Shader 列表——第一次写 Shader 前先调一次。传 id：返回该 Shader 的 GLSL 源码和预设参数，可以拿现成的效果当模板。只读，不改页面。",
        parameters: {
          type: "object",
          properties: {
            id: { type: "string", description: "Shader 或材质预设的 id（例如 snow、stylizedBrick、ice、nebula）；传 library 返回可平铺函数库全部函数的签名和返回值说明；不传则返回写法说明和列表" },
          },
        },
      },
      {
        name: "write_shader",
        description:
          "新建或修改一个自定义 Shader：提交 GLSL 代码，页面先编译检查。编译失败会返回带行号的错误，照着修改后再调用；通过后保存到这台电脑的浏览器存储，加入材质库「自定义」分组并（默认）立刻切换过去。写之前先用 read_shader 看写法说明。写完建议用 snapshot 看效果，再迭代。只改页面和本机浏览器存储，不写工作目录文件、不联网。",
        parameters: {
          type: "object",
          properties: {
            id: { type: "string", description: "英文 id，字母开头，2–40 位字母 / 数字 / _ / -；与已有自定义 Shader 同 id 时覆盖它，不能与内置 id 重名" },
            name: { type: "string", description: "显示名称（中文即可），最多 40 字" },
            kind: { type: "string", enum: ["surface", "vfx"], description: "surface=写实材质（写 SurfaceData sampleSurface(vec2 uv)），vfx=自发光特效（写完整 void main()）。默认 surface" },
            code: { type: "string", description: "GLSL 代码，只写自己的函数，不要声明 uniform / varying / precision" },
            timeScale: { type: "number", minimum: 0, maximum: 3, description: "速度 1 时的动画快慢倍率，静态材质可用 0.3，默认 0.3" },
            params: {
              type: "object",
              additionalProperties: { type: "number" },
              description: `预设的材质参数（键同 set_look 的 params），例如 uRoughness、uDisplace、uSss、uSnow、uEmissive：${ranges(catalog.params)}`,
            },
            colors: {
              type: "object",
              properties: {
                uColorA: { type: "string", description: "暗部色 #rrggbb" },
                uColorB: { type: "string", description: "主色 #rrggbb" },
                uAccent: { type: "string", description: "高光 / 点缀色 #rrggbb" },
              },
              description: "预设三色（#rrggbb），Shader 里用 uColorA / uColorB / uAccent 读取",
            },
            apply: { type: "boolean", description: "通过后是否立刻切换到它，默认 true" },
          },
          required: ["id", "code"],
        },
      },
      {
        name: "delete_shader",
        description: "删除一个自定义 Shader（只能删 write_shader 写的，内置的不能删）。会从这台电脑的浏览器存储和材质库里移除，不可撤销。",
        parameters: {
          type: "object",
          properties: {
            id: { type: "string", description: "要删除的自定义 Shader 的 id" },
          },
          required: ["id"],
        },
      },
    ],
  };
}

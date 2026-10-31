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
    description: "材质与 Shader 预览工作台：PBR 材质库、程序化 Shader、NPR 卡通渲染、画面滤镜和 Teardown 式体素化；AI 可以直接写 GLSL 新增自定义 Shader，以及套在模型上的可编程效果（表面、形变、实例几何，响应点击 / 指针）。",
    whenToUse:
      "需要预览或调整材质球、PBR 材质、程序化 Shader 效果、NPR 卡通渲染、描边、画面滤镜（像素/漫画/油画等）、体素化效果，或想看材质在不同环境光下的渲染结果，或想让 AI 写一个新的程序化材质 / Shader 效果、或模型上的动态效果（点击扩散、鳞片 / 羽毛 / 草等实例几何、形变）时找我",
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
              description: `展示模型：${list(catalog.displayModels)}；也可以是导入模型的 id 或名字（状态里的 model.importedModels）`,
            },
            modelParts: {
              type: "array",
              items: { type: "string" },
              description: "导入模型里套用 ShaderMaker 材质的部件（部件 key 或名字，见状态里的 model.parts），其余部件保留原材质。效果（鳞片等实例、表面换色、形变）只作用在这些部件上",
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
            effect: {
              type: ["object", "string", "null"],
              description:
                "当前效果（read_effect 可列出：内置 scaleBloom 鳞片绽放 / ripple 点击涟漪 / hoverHalo 悬停光圈，以及 write_effect 写的）。传 null 关闭；传对象 { id, params, trigger, freezeAge }：id 切换效果，params 调效果参数，trigger=true 模拟一次点击（画面正中对着的表面点），freezeAge 把「距上次点击的秒数」停在某个值方便 snapshot 截某一刻（null 恢复）。",
              properties: {
                id: { type: ["string", "null"], description: "效果 id；null 关闭" },
                params: { type: "object", description: "效果参数，键是效果声明的 key，颜色传 #rrggbb" },
                trigger: { type: "boolean", description: "模拟点击一次" },
                freezeAge: { type: ["number", "null"], description: "停在点击后第几秒；null 恢复" },
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
        name: "import_model",
        description:
          "从一个 HTTPS 地址导入 GLB 模型到 ShaderMaker（经 Cindy 下载进媒体库，再在页面里解析），存到这台电脑的浏览器存储并切换过去。返回模型的部件列表：默认面积最大的部件套用 ShaderMaker 材质，可用 set_look 的 modelParts 改。只支持单文件 GLB（不支持 Draco / meshopt 压缩和 KTX2 贴图），上限 200 MB。用户本机上的文件请让用户点面板「导入模型」或直接拖到画面上。会联网下载该地址。",
        parameters: {
          type: "object",
          properties: {
            url: { type: "string", description: "GLB 文件的 HTTPS 地址" },
            name: { type: "string", description: "显示名称，可省略" },
          },
          required: ["url"],
        },
      },
      {
        name: "delete_model",
        description: "删除一个导入的模型（内置的 Shader Ball / 球 / 方块不能删），从这台电脑的浏览器存储里移除。",
        parameters: { type: "object", properties: { id: { type: "string", description: "导入模型的 id" } }, required: ["id"] },
      },
      {
        name: "read_effect",
        description:
          "读取 ShaderMaker 效果的写法说明和定义。效果是套在展示模型上的可编程层：overlay（表面逐像素换色 / 自发光）、deform（顶点形变）、instances（在表面散布实例几何，如鳞片、羽毛、草、尖刺），能读时间、点击、鼠标指针等输入，并声明自己的参数（自动生成面板滑条）。不传 id：返回写法说明和效果列表——第一次写效果前先调一次；传 id：返回该效果的完整定义（可以拿内置范例 scaleBloom / ripple / hoverHalo 当模板）。只读。",
        parameters: {
          type: "object",
          properties: { id: { type: "string", description: "效果 id；不传返回写法说明和列表" } },
        },
      },
      {
        name: "write_effect",
        description:
          "新建或修改一个自定义效果：提交效果定义（参数 + GLSL 片段），页面在所有相关材质（写实 / 卡通主体、描边、阴影、滤镜）里编译检查。失败返回带「部分 + 行号」的错误，改了再调；通过后保存到这台电脑的浏览器存储，加入面板「效果」列表并（默认）立刻启用。写之前先用 read_effect 看写法说明。写完用 set_look 的 effect.trigger / freezeAge 配合 snapshot 检查。只改页面和本机浏览器存储，不写工作目录文件、不联网。",
        parameters: {
          type: "object",
          properties: {
            id: { type: "string", description: "英文 id，字母开头，2–40 位；同 id 覆盖已有自定义效果，不能和内置范例重名" },
            name: { type: "string", description: "显示名称" },
            description: { type: "string", description: "一句话说明（面板提示用）" },
            params: {
              type: "array",
              description: "参数：{ key: 'uXxx', label, min, max, default, lite? } 或 { key, label, type: 'color', default: '#rrggbb', lite? }；代码里当 uniform 用",
              items: { type: "object" },
            },
            common: { type: "string", description: "共用 GLSL 辅助函数" },
            overlay: { type: "string", description: "定义 vec3 overlay(vec3 pos, vec3 normal, vec3 color) 和 / 或 vec3 overlayEmissive(vec3 pos, vec3 normal)" },
            deform: { type: "string", description: "定义 vec3 deform(vec3 pos, vec3 normal)" },
            instances: {
              type: "object",
              description:
                "实例：{ count（≤60000）, seed, geometry: { type: blade|quad|box|cone|sphere|custom, … }, material: { metalness, roughness, specular, clearcoat, iridescence, emissive, envMap, doubleSided }, vertex: 定义 vec3 instanceVertex(vec3 p, inout vec3 n, inout vec3 color), fragment?: 定义 vec3 instanceFragment(vec3 color, vec3 local) }",
            },
            apply: { type: "boolean", description: "通过后是否立刻启用，默认 true" },
            trigger: { type: "boolean", description: "启用后模拟点击一次" },
          },
          required: ["id"],
        },
      },
      {
        name: "delete_effect",
        description: "删除一个自定义效果（内置范例不能删）。从这台电脑的浏览器存储和面板里移除，不可撤销。",
        parameters: { type: "object", properties: { id: { type: "string", description: "要删除的效果 id" } }, required: ["id"] },
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

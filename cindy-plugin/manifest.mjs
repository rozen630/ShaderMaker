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
    description: "材质与 Shader 预览工作台：PBR 材质库、程序化 Shader、NPR 卡通渲染、画面滤镜和 Teardown 式体素化。",
    whenToUse:
      "需要预览或调整材质球、PBR 材质、程序化 Shader 效果、NPR 卡通渲染、描边、画面滤镜（像素/漫画/油画等）、体素化效果，或想看材质在不同环境光下的渲染结果时找我",
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
              enum: catalog.materials.map((item) => item.id),
              description: `材质预设，切换后材质参数重置为该预设。PBR 材质：${list(pbr)}。Shader 效果：${list(shader)}`,
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
    ],
  };
}

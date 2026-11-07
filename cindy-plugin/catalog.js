// 打包时在 Node 里执行：从现有数据导出可选项，生成 ghost.json 里的工具参数枚举，避免手写清单跟数据脱节。
import { presets, sliderDefs } from "../src/presets.js";
import { filters, MAX_FILTERS } from "../src/filters.js";
import { environments } from "../src/environments.js";
import { skySliders } from "../src/sky.js";
import { envSliders } from "../src/customEnv.js";
import { displayModels } from "../src/models.js";
import { nprPresets, nprSliders } from "../src/npr.js";
import { voxelResolution } from "../src/voxel.js";

const unique = (defs) => [...new Map(defs.map((def) => [def.key, def])).values()];

export const catalog = {
  materials: Object.entries(presets).map(([id, preset]) => ({
    id,
    name: preset.name || id,
    library: preset.family || "pbr",
  })),
  filters: Object.values(filters).map(({ id, name, params }) => ({
    id,
    name,
    params: params.map(({ key, label, min, max, default: value }) => ({ key, label, min, max, default: value })),
  })),
  maxFilters: MAX_FILTERS,
  environments: Object.values(environments).map(({ id, name }) => ({ id, name })),
  skyParams: skySliders.map(({ key, label, min, max }) => ({ key, label, min, max })),
  envParams: Object.fromEntries(envSliders.map(({ key, min, max }) => [key, { min, max }])),
  displayModels: Object.values(displayModels).map(({ id, label }) => ({ id, name: label })),
  nprPresets: Object.values(nprPresets).map(({ id, name }) => ({ id, name })),
  params: unique(sliderDefs).map(({ key, label, min, max }) => ({ key, label, min, max })),
  nprParams: nprSliders.map(({ key, label, min, max }) => ({ key, label, min, max })),
  voxelResolution,
};

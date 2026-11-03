<div align="center">

# ✦ ShaderMaker ✦

English | [简体中文](README_CN.md)

**One material, three worlds.**
Realistic PBR · stylized NPR · Teardown-style voxels. Switch rendering styles with one click while snow, displacement and subsurface scattering follow the same procedural material.

![version](https://img.shields.io/badge/version-1.8.0-7c5cff?style=flat-square)
![three.js](https://img.shields.io/badge/three.js-r170-000000?style=flat-square&logo=three.js)
![shaders](https://img.shields.io/badge/shaders-58-ff6b9d?style=flat-square)
![pbr](https://img.shields.io/badge/PBR%20materials-26-38bdf8?style=flat-square)
![cindy](https://img.shields.io/badge/Cindy-plugin-22c55e?style=flat-square)

<br>

[Download the latest Cindy plugin](https://github.com/rozen630/ShaderMaker/releases/latest) · [Changelog](CHANGELOG.md)

<br>

| Realistic PBR | Stylized NPR | Voxel |
|:---:|:---:|:---:|
| <img src="docs/images/snow-pbr.jpg" width="260"> | <img src="docs/images/snow-npr.jpg" width="260"> | <img src="docs/images/snow-voxel.jpg" width="260"> |
| <img src="docs/images/brick-pbr.jpg" width="260"> | <img src="docs/images/brick-npr.jpg" width="260"> | <img src="docs/images/brick-voxel.jpg" width="260"> |

<sub>Top: snow that really bulges out; NPR outlines follow the snow, while voxel snow stacks upward one block at a time.<br>Bottom: stylized red brick with raised bricks and matching shadows; voxel bricks protrude by whole blocks.</sub>

</div>

---

## ⚡ Get started in 30 seconds

```bash
python3 serve.py          # → http://127.0.0.1:5173 (cache disabled; refresh to see changes)
```

After packing and installing the Cindy plugin, tell Cindy what to change in chat:

```text
Make it a sci-fi panel       Rusty metal, anime style       Cel shading with thicker outlines
Painterly, warm shadows      Pixel art                    Teardown style, larger voxels
```

Use the web page to preview and adjust materials manually. Use Cindy chat for natural-language changes and effect triggers. Three.js `r170` is loaded from the unpkg CDN; the repository does not include `vendor/`.

> 🧩 Install the **Cindy plugin** to let the assistant adjust materials and inspect screenshots from chat. See [Cindy plugin](#-cindy-plugin).

---

## 🌌 Effects × render modes: full matrix support

Since 1.5.0, every material effect works in all three render modes with consistent geometry: the model, outlines, shadows, filter masks and channel views all use the same vertex displacement.

| Effect | Realistic PBR | Stylized NPR | Voxel |
|---|:---:|:---:|:---:|
| Triplanar projection (seamless textures) | ✅ | ✅ | ✅ one color per block |
| **Height displacement** | ✅ real displacement after tessellation | ✅ outlines expand with the surface | ✅ blocks stretch by whole grid cells |
| **Snow** | ✅ raised snow, surface relief and sparkling crystals | ✅ toon-shaded snow | ✅ blocks turn white; top-facing blocks grow upward |
| **Subsurface scattering** | ✅ backlit translucency and rim glow | ✅ banded translucent colors | ✅ |
| **Crushed ice under the surface** | ✅ parallax layers with depth as the view changes | ✅ | ✅ sampled per block |
| Dynamic shadows | ✅ follow displacement | ✅ | ✅ follow stretched blocks |
| Screen-space filters (line-art effects) | ✅ | ✅ | ✅ |

<div align="center">

| NPR · Ice | NPR · Jade (SSS) | Voxel · Ice | Voxel · Comic filter |
|:---:|:---:|:---:|:---:|
| <img src="docs/images/ice-npr.jpg" width="190"> | <img src="docs/images/jade-npr.jpg" width="190"> | <img src="docs/images/ice-voxel.jpg" width="190"> | <img src="docs/images/voxel-comic.jpg" width="190"> |

</div>

---

## 🧩 Programmable effects (foundation)

ShaderMaker provides building blocks instead of hard-coding individual effects. An effect combines parameters with any of the following parts (`src/effects.js`):

| Part | Write | Examples |
|---|---|---|
| **overlay** | `vec3 overlay(pos, normal, color)` / `vec3 overlayEmissive(pos, normal)`, evaluated per pixel on the surface in display-space coordinates | Click-driven recoloring, scan lines, dissolve, halos |
| **deform** | `vec3 deform(pos, normal)`, evaluated on surface vertices | Ripples, bulges, waves; normals are recomputed and outlines, shadows and filters follow |
| **instances** | Choose geometry (feather, quad, cube, cone, sphere or custom vertices), scatter up to 60,000 instances by surface area, and write `instanceVertex(p, n, color)` | Scales, feathers, grass, spikes, fragments |
| **common** | Shared helper functions | — |

- **Inputs:** `uTime`; the two most recent click positions and their ages (`uClickPos`, `uClickAge`, `uClickCount`, `uPrevClick*`); the surface point under the pointer (`uPointerPos`, `uPointerOn`); model center and size.
- **Parameters:** declare `{ key, label, min, max, default }` or a color. The panel creates sliders and color pickers automatically, and `set_look` can adjust them.
- **Automatic integration:** effect code is injected into the relevant PBR, NPR, voxel surface, shadow, model-only filter-mask and outline materials. Changing an effect recompiles them.
- **Compile checks:** all related materials are compiled on test geometry when an effect is written. Errors identify the part and line; a failed effect is rolled back.
- **Storage:** custom effects are saved in the local browser's IndexedDB, alongside custom shaders.

Three built-in examples use only these capabilities (`src/effectExamples.js`):

| Example | Building blocks |
|---|---|
| Scale bloom `scaleBloom` | Feather instances that bend, twist and curl, plus an overlay; click to trigger and alternate colors |
| Click ripple `ripple` | Vertex deformation plus emissive wave crests |
| Hover halo `hoverHalo` | Emissive overlay that follows the pointer |

AI tools: `read_effect` (instructions and examples), `write_effect` (compile-check, save and enable), and `delete_effect`. The `effect` field in `set_look` selects effects, adjusts parameters, triggers simulated clicks, and can freeze an effect at a chosen age for screenshots.

---

## 🚗 Import your own models

Click **Import Model** beside “Display Model” in the right panel, or drag a `.glb` onto the canvas. Models are stored in this browser on this computer and remain available when you reopen the page.

- **Parts:** each source material becomes a part. Selected parts use ShaderMaker's material and receive snow, displacement and effects (scales grow only on these parts). Unselected parts keep their original materials; in NPR mode they are converted to matching toon materials, and voxel colors are sampled from the original materials.
- **Default selection:** parts whose names resemble vehicle paint or bodywork (`paint`, `body`, and Chinese equivalents) are selected together. If none match, the most visible part is chosen by rendering numbered views from 14 directions, so a large but occluded interior is not selected.
- **Processing:** multi-material meshes are split by material, normals are repaired, and the model is scaled by its longest edge. Selected parts are subdivided within a total budget of 1.5 million triangles. Overlapping front and back surfaces on thin panels are separated to prevent snow or displacement from tearing them apart; displacement is reduced where triangles remain too large.
- **Framing:** imported models are framed using their own dimensions.
- **Limits:** one self-contained GLB/glTF file, up to 200 MB. Draco/meshopt compression and KTX2 textures need decoders, which are not available on the plugin page. The page will suggest unpacking first with `npx @gltf-transform/cli copy input.glb output.glb`.
- **AI:** `import_model` imports a GLB from an HTTPS URL (Cindy downloads it to the media library for the page); `set_look` accepts an imported model's ID or name in `displayModel` and changes selected parts through `modelParts`; `delete_model` removes it. Import local files from the page because the plugin cannot read local file paths.

---

## 🎨 Material library

### PBR · 26 materials

Grouped into **calibration, metals, dielectrics, coatings, fabrics, transparent materials and optics**. Includes common metals, plastics, rubber, ceramics, automotive paint, velvet, glass, water, diamonds and iridescent films. Parameters cover the full `MeshPhysicalMaterial` feature set: metalness, roughness, specular, IOR, clearcoat, sheen, anisotropy, iridescence, transmission, volume absorption and dispersion.

### Shaders · 58 procedural textures

Live thumbnail cards; Pro mode can filter by category (`shaderCategories` in `src/presets.js`):

| Category | Examples |
|---|---|
| 💎 **Gems · ice** | Ice, diamond facets, crystal, emerald, amber, jade, geodes |
| ⚙️ **Metals** | Brushed scratches, chipped paint, Damascus steel, patina, liquid metal, rust, hammered metal |
| 🧱 **Stone · ceramic** | Stylized red brick, limestone brick, mossy stone wall, peeling walls, mosaic, formed concrete, polished granite, terrazzo, marble, rock, glazed tile, kintsugi |
| 🏔️ **Nature** | Dunes, snow, tracked snow, old bark, magma, cracked lava, ocean, wood grain |
| 🐉 **Organic · fabric** | Lychee leather, woven silk, dragon scales, bioluminescence |
| 🛸 **Sci-fi** | Sci-fi panels, hex armor, circuit boards, carbon fiber, holographic film |
| ✨ **VFX** · 14 | Aurora, plasma, starfield, fire, neon, caustics, holograms, portals, digital rain, cells, nebula, energy shield, plasma web, electric arc |

- **Consistent speed:** speed 1 means each effect's natural pace. Animated effects default to 1; static realistic materials default to 0. Values are centralized in `timeScales` at the end of `src/shaders.js`.
- **VFX backgrounds are dimmed automatically**, allowing emission to show without being washed out by ambient light.
- **Random variants:** rotate the overall hue and change the noise seed to explore color variations.
- **Snow is selected by default**, showing tessellation and snow displacement immediately. The Lookdev color-check sphere is under “Calibration.”

---

## 🔬 Material effects (`src/materialFx.js`)

<details open>
<summary><b>Height displacement · tessellation</b></summary>

- The Surface Shader writes height into the ORM texture's alpha channel. The vertex shader samples it with triplanar projection and really pushes the surface out: brick joints sink in and stones bulge. Control it with the displacement-height slider.
- Display models are uniformly subdivided on load (`densify` in `src/models.js`). Shared edges use the same midpoint, so displacement does not crack along seams.
- Displacement follows the **average normal** (`outlineNormal`), so duplicate vertices at UV seams move by the same amount.
- **NPR:** the outline shell samples the same height map, so snow and bricks do not swallow the outline.
- **Voxel:** blocks stretch by whole cells along the nearest axis to the surface normal. They only extend outward, avoiding holes; stretched faces retain per-cell edge shading.
</details>

<details>
<summary><b>Snow</b></summary>

- Snow covers upward-facing surfaces, with noise breaking up the snow line; it layers over any material.
- Snow bulges along the average normal. “Snow Depth” controls its height; the snow surface has separate relief and sparkling ice crystals.
- **NPR:** snow roughness and metalness feed toon-highlight parameters, so snow does not get metallic highlights.
- **Voxel:** each block is classified at its center and turns white; upward-facing blocks grow by the snow depth while side-facing blocks only change color.
</details>

<details>
<summary><b>Subsurface scattering (SSS)</b></summary>

- Approximates light entering and scattering out of a material: backlit areas become translucent and edges glow. It is added to emission so highly transmissive ice and gems do not wash it out.
- Used on ice, jade, amber, marble, frosted glass, pearls and snow.
- **NPR:** uses stepped shading with a translucent band on backlit areas and a rim; band softness follows the boundary-softness parameter.
</details>

<details>
<summary><b>Crushed ice under the surface</b></summary>

- Parallax layers render slowly drifting ice plates at several depths, with white pressure ridges and bubbles. Deeper layers are darker and bluer, creating depth as the view changes.
- **Voxel:** each block samples a color at its center, preserving depth variation across the ice.
</details>

<details>
<summary><b>Triplanar projection · tiling</b></summary>

- Procedural textures are projected in display space from the X, Y and Z directions and blended by the normal, rather than using model UVs. This avoids seams between UV islands and across spheres (`src/triplanar.js`).
- A seamless tiling pass runs each frame, so repeated projections have no visible seams.
</details>

---

## 🖌️ Rendering modes

### Realistic PBR

- Direct light comes from Key/Fill directional lights, a Rim point light and hemisphere light. Key Light casts shadows.
- HDR is processed with PMREM into `scene.environment` for image-based indirect diffuse and specular lighting (not dynamic multi-bounce global illumination).
- Surface Shaders output Base Color, AO/Roughness/Metalness, Normal and Emissive separately; each material generates its normal map from its own height function.

### Stylized NPR · cel shading / anime / painterly

NPR is not a screen filter: it patches `MeshToonMaterial` and replaces its lighting model. Lights, including shadows, accumulate illumination, which is then quantized into bands and given a unified shadow color. Both modes use the same material data; only lighting changes.

| PBR property | NPR appearance |
|---|---|
| Metalness | Three-band sky/horizon/ground reflection instead of HDR reflection |
| Roughness | Size and strength of hard highlights |
| Clearcoat | Additional hard white highlight |
| Sheen | Rim light colored by Sheen |
| Transmission | Translucency and stronger rim light, tinted toward the absorption color |
| Iridescence / dispersion | Rainbow-colored rim light |
| Subsurface scattering | Stepped translucent bands |
| Snow | Snow color and toon highlights |

- Surface Shaders read ORM per pixel, so rust and metal on one material are handled separately.
- The main light controls shading: the shader identifies it by direction. Fill and point lights contribute at 25% weight and do not modify scene lights.
- **Scope: model only / global.** Model-only mode preserves ACES tone mapping and applies the inverse ACES transform to NPR output; global mode uses a flat background and disables ACES.
- Outlines use an average-normal expanded back-face shell. The main object uses the stencil buffer, so glass does not show outlines through itself.
- Not yet supported: stretched anisotropic highlights or thickness variation from volumetric absorption.

### Voxel · Teardown style

- Toggle in the right panel and adjust detail from 12–96 voxels along the model's height. The display model becomes a surface voxel mesh rendered with instancing.
- Each block retains UVs and surface direction from the original model. Textures are sampled at that point, one color per block, and animated shaders continue to animate.
- Voxel AO darkens blocks according to occupancy in their 26-cell neighborhood; per-block brightness variation and darkened edges add depth.
- Changing detail recomputes the model in real time; the most recent eight detail levels are cached. At detail 72, the Shader Ball creates about 40,000 blocks in roughly 70 ms.
- Voxelization samples the mesh before tessellation, producing the same result faster.
- Not yet supported: outlines around voxels in NPR mode.

### Screen-space filters

Pixel art / comic / oil paint / sketch / cyber / film / blueprint. NPR is a material shader that knows about normals, lights and shadows; filters are camera post-processing and only see the rendered 2D image. They can be combined. Line-art filters use normal and depth buffers and support voxels and displacement.

---

## 🖥️ Interface

An immersive canvas keeps the model large, with frosted-glass material and appearance panels floating on the left and right. On narrow screens and inside the Cindy sidebar, panels stack below the canvas. Switch between **Lite / Pro** at the top right (saved on this device):

- **Lite:** material library, PBR/NPR, display model, environment, filters and voxels; three common sliders per material, plus shadow brightness and outline width in NPR.
- **Pro:** all parameters grouped into Base / Surface / Volume, material-category filters, filter strength and scope, and channel inspection.
- Both modes share material and settings state. Switching does not discard changes. `lite: true` in `src/presets.js` / `src/npr.js` determines which sliders appear in Lite.

**Display** follows MaterialX Viewer: the model floats against a clear HDR environment (studio / sunset / night / outdoor plaza), without a floor or pedestal and without auto-rotation. Drag to inspect it.

- **Shader Ball** (default): the shell uses the current material; the inner color ring and gray base remain realistic as calibration references in every mode.
- **Sphere / Cube** (rounded): share the Shader Ball's framing.
- **Channel view:** inspect Base / AO / Roughness / Metalness / Normal / Emissive on the model with the same shape as the final render.

---

## 🧩 Cindy plugin

ShaderMaker adds an entry in Cindy's left navigation. Open it as a full page, drag it into the sidebar, or pop it out into a separate window. Cindy chat can control the page directly.

```bash
npm install
npm run build:plugin      # → dist/cindy-plugin/
```

Then use Cindy's `ghost_forge_pack` to package `dist/cindy-plugin/` as `shadermaker-<version>.cindy` and import it. Each GitHub Release also includes the matching `.cindy` package.

| AI tool | Purpose |
|---|---|
| `set_look` | Set materials, PBR/NPR, NPR presets, filters and strength, scope, environment, display model, voxels and detail, material values, colors and NPR parameters; returns the full state |
| `describe_look` | Parse a natural-language change from Cindy chat (reuses `src/nl.js`) |
| `snapshot` | Capture the current view so the assistant can inspect it |
| `read_shader` | Without an ID: custom shader instructions and list; with an ID: that shader's GLSL source as a template; `library`: signatures and return values for all tiling functions |
| `export_shader` | Send the current material's GLSL, parameters and active effect code to chat for copying and adapting to another engine; optionally include compiled Three.js source |
| `write_shader` | Create or edit a custom GLSL shader, compile-check it, then add it to the Custom group; failures include line numbers |
| `delete_shader` | Delete a custom shader (built-in shaders cannot be deleted) |
| `import_model` / `delete_model` | Import a GLB from an HTTPS URL / remove an imported model; see [Import your own models](#-import-your-own-models) |
| `read_effect` / `write_effect` / `delete_effect` | Read effect instructions and examples, compile-check and save effects, or delete them; see [Programmable effects](#-programmable-effects-foundation) |

- If no ShaderMaker page is open, the plugin opens the task page in the current task's right sidebar (first load takes about 2 seconds).
- The same page has two entry points: the main view (`mainView`) and task view (`taskView`). If several are open, the plugin chooses the current task's task view, then the main view, then another view; it does not run an action twice.
- **Plugin build differences** (the plugin page's CSP allows only bundled scripts and does not allow network access):
  - esbuild bundles `src/` and Three.js into one `app.js`, replacing the import map (inline scripts are blocked by CSP).
  - HDR environments are bundled and compressed as a base JPEG plus gain PNG (`cindy-plugin/hdrPack.mjs`) and reconstructed as HDR when the page loads (`src/packedHdr.js`). Four 2K environments take about 3.7 MB, smaller than the original 1K `.hdr` files, with highlight color and energy error within 2.5%. The web version loads `.hdr` files directly from Poly Haven.
  - The display model is vertex-quantized (`cindy-plugin/modelPack.mjs`), which Three.js supports natively without a decoder; its size drops from 1.36 MB to 0.9 MB.
  - The full package is about 4.9 MB, down from 6.8 MB and below the 8 MB limit.
  - `ghost.json` is generated by `cindy-plugin/manifest.mjs`. Tool options come from existing data, so new materials, filters and environments do not require plugin code changes.

---

## 🤖 AI-written shaders

In Cindy, say “Write a glowing hex armor shader” and the assistant can work through the full loop:

```text
read_shader (learn the format) → write_shader (submit GLSL) → fix compile errors by line → snapshot (inspect) → iterate
```

- **Two shader types:** `surface` only implements `SurfaceData sampleSurface(vec2 uv)` and automatically gets Base Color, ORM, Normal, Emissive and displacement, with PBR/NPR/voxel support. `vfx` implements a full `main()` for emissive effects.
- **Compile checks:** Base Color, ORM, Normal and Emissive are compiled separately. Error line numbers point to the code the AI wrote, not the combined shader.
- **Storage:** custom shaders live in this computer's browser storage (IndexedDB), shared and synchronized in real time between the main view and task view. They persist when the page is reopened, but do not move to another computer or enter Git.
- **Promote a shader to the built-in library:** move its code and preset into `src/shaders.js` / `src/presets.js`, then publish it with the plugin so every computer gets it.

The library can grow without much package growth: all 58 shader sources total about 66 KB (about 17 KB compressed). The largest package assets are four HDR environments (8.3 MB uncompressed) and the Shader Ball model (2.4 MB). See `src/customShaders.js`.

---

## 🗂️ Code layout

```text
src/
├── app.js             Scene and UI; exports the shaderMaker control API for the Cindy plugin
├── shaders.js         GLSL: shared noise/Voronoi, Surface protocol, 58 shaders, timeScales
├── presets.js         PBR library, shader presets and categories, slider definitions
├── customShaders.js   Custom shader format and compile checks
├── effects.js         Programmable effects: inputs, parameters, GLSL injection, instances, compile checks
├── effectExamples.js  Built-in effect examples (scale bloom / click ripple / hover halo)
├── store.js           Local browser storage (IndexedDB)
├── materialFx.js      Displacement, snow, SSS, crushed ice (shared vertex expansion for PBR/NPR/voxel, outlines, shadows and filters)
├── triplanar.js       Triplanar projection and seamless tiling
├── npr.js             NPR lighting, outlines, PBR-to-NPR conversion rules
├── voxel.js           Voxelization: surface sampling, voxel AO, instanced mesh, material patches
├── stylize.js         Screen-space filter post-processing pipeline
├── models.js          Display models (Shader Ball / sphere / cube), tessellation, calibration parts
├── environments.js    HDR environments
├── nl.js              Natural-language parsing
└── vendor/            tileable-shaders (MIT)
cindy-plugin/          page.js (page entry) · main.js (plugin backend) · manifest.mjs · build.mjs
```

---

## 📜 Versions

See [CHANGELOG.md](CHANGELOG.md) for changes in each version. Each plugin release corresponds to a `vX.Y.Z` Git tag. The repository is at [github.com/rozen630/ShaderMaker](https://github.com/rozen630/ShaderMaker), with `main` as the default branch.

## 🙏 Third-party assets

- `assets/models/materialx-shaderball.glb`: the default Shader Ball from MaterialX Viewer, from [AcademySoftwareFoundation/MaterialX](https://github.com/AcademySoftwareFoundation/MaterialX/tree/main/resources/Geometry), under Apache License 2.0; see `assets/models/MATERIALX-LICENSE.txt`. The inner color ring is generated by ShaderMaker and is not part of the original asset; the plugin version of the model is vertex-quantized.
- `src/vendor/tileable-shaders.js`: [tuxalin/procedural-tileable-shaders](https://github.com/tuxalin/procedural-tileable-shaders), MIT; see `src/vendor/TILEABLE-SHADERS-LICENSE.txt`. ShaderMaker uses its seamless noise, Voronoi, crack, hexagon, weave and domain-warping functions. A few original type errors prevented compilation, so minimal fixes are marked `ShaderMaker`.
- HDR environments: [Poly Haven](https://polyhaven.com/hdris), CC0. The web version loads 2K `.hdr` files from Poly Haven's CDN; the Cindy plugin bundles compressed 2K versions.

// 生成 Cindy 插件源码目录 dist/cindy-plugin/，之后用 Cindy 的 ghost_forge_pack 打包成 .cindy。
//
// 插件页面的 CSP 只允许包内脚本、且不能联网，所以这里：
//   1. 用 esbuild 把 src/ 和 three.js 打成一个 app.js（页面里的 importmap 是内联脚本，会被 CSP 拦掉）；
//   2. 展示模型做顶点量化（modelPack.mjs）；
//   3. 从现有数据生成 ghost.json（工具参数枚举跟着材质 / 滤镜 / 环境数据走）。
// 环境只有程序天空和用户上传的图，包里不放 HDR。
//
// 用法：npm install && npm run build:plugin
import { build } from "esbuild";
import { packModel } from "./modelPack.mjs";
import { cp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { buildManifest } from "./manifest.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const pluginDir = join(root, "cindy-plugin");
const out = join(root, "dist", "cindy-plugin");
const pkg = JSON.parse(await readFile(join(root, "package.json"), "utf8"));

async function loadCatalog() {
  const file = join(root, ".cache", "catalog.mjs");
  await build({ entryPoints: [join(pluginDir, "catalog.js")], bundle: true, format: "esm", platform: "node", outfile: file, logLevel: "silent" });
  return (await import(`${pathToFileURL(file).href}?t=${Date.now()}`)).catalog;
}

// index.html → main-view.html：去掉 importmap 和带版本号的引用，改成加载打包后的 app.js
function pluginHtml(html) {
  const next = html
    .replace(/\s*<!--[^>]*-->\s*<script type="importmap">[\s\S]*?<\/script>/, "")
    .replace(/<script type="importmap">[\s\S]*?<\/script>/, "")
    .replace(/href="\.\/styles\.css[^"]*"/, 'href="./styles.css"')
    .replace(/<script type="module" src="\.\/src\/app\.js[^"]*"><\/script>/, '<script type="module" src="./app.js"></script>');
  if (/importmap|src\/app\.js/.test(next)) throw new Error("index.html 结构变了，main-view.html 改写失败");
  return next;
}

await rm(out, { recursive: true, force: true });
await mkdir(join(out, "assets"), { recursive: true });

const catalog = await loadCatalog();

await build({
  entryPoints: [join(pluginDir, "page.js")],
  bundle: true,
  format: "esm",
  minify: true,
  target: "chrome120",
  outfile: join(out, "app.js"),
  logLevel: "warning",
});

await writeFile(join(out, "main-view.html"), pluginHtml(await readFile(join(root, "index.html"), "utf8")));
await cp(join(root, "styles.css"), join(out, "styles.css"));
await cp(join(root, "assets", "models"), join(out, "assets", "models"), { recursive: true });
// 模型顶点量化，体积约减 40%（modelPack.mjs）
for (const file of await readdir(join(out, "assets", "models"))) {
  if (file.endsWith(".glb")) await packModel(join(root, "assets", "models", file), join(out, "assets", "models", file));
}
await cp(join(pluginDir, "assets", "icon.png"), join(out, "assets", "icon.png"));
await cp(join(pluginDir, "main.js"), join(out, "main.js"));
await writeFile(join(out, "ghost.json"), `${JSON.stringify(buildManifest(catalog, pkg.version), null, 2)}\n`);

console.log(`插件源码已生成：${out}`);

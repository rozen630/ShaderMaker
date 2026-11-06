// 生成 Cindy 插件源码目录 dist/cindy-plugin/，之后用 Cindy 的 ghost_forge_pack 打包成 .cindy。
//
// 插件页面的 CSP 只允许包内脚本、且不能联网，所以这里：
//   1. 用 esbuild 把 src/ 和 three.js 打成一个 app.js（页面里的 importmap 是内联脚本，会被 CSP 拦掉）；
//   2. 把 HDR 下载到 .cache/hdr/，压缩成「底图 JPEG + 增益 PNG」放进包里（hdrPack.mjs），页面改从包内读取并还原；
//   3. 展示模型做顶点量化（modelPack.mjs）；
//   4. 从现有数据生成 ghost.json（工具参数枚举跟着材质 / 滤镜 / 环境数据走）。
//
// 用法：npm install && npm run build:plugin
import { build } from "esbuild";
import { packHdr } from "./hdrPack.mjs";
import { packModel } from "./modelPack.mjs";
import { cp, mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { buildManifest } from "./manifest.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const pluginDir = join(root, "cindy-plugin");
const out = join(root, "dist", "cindy-plugin");
const cacheDir = join(root, ".cache", "hdr");
// HDR 用 2k 压缩版（hdrPack.mjs：底图 JPEG + 增益 PNG），4 张约 2.6 MB，比原来 1k 的 .hdr（约 5 MB）还小
const HDR_RES = "2k";
const pkg = JSON.parse(await readFile(join(root, "package.json"), "utf8"));

async function exists(path) {
  return stat(path).then(() => true, () => false);
}

async function loadCatalog() {
  const file = join(root, ".cache", "catalog.mjs");
  await build({ entryPoints: [join(pluginDir, "catalog.js")], bundle: true, format: "esm", platform: "node", outfile: file, logLevel: "silent" });
  return (await import(`${pathToFileURL(file).href}?t=${Date.now()}`)).catalog;
}

async function downloadHdr(url) {
  const file = join(cacheDir, basename(url));
  if (await exists(file)) return file;
  console.log(`下载 ${url}`);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HDR 下载失败 ${response.status}: ${url}`);
  await writeFile(file, Buffer.from(await response.arrayBuffer()));
  return file;
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
await mkdir(join(out, "assets", "hdr", HDR_RES), { recursive: true });
await mkdir(cacheDir, { recursive: true });

const catalog = await loadCatalog();

await build({
  entryPoints: [join(pluginDir, "page.js")],
  bundle: true,
  format: "esm",
  minify: true,
  target: "chrome120",
  outfile: join(out, "app.js"),
  define: {
    __SHADERMAKER_HDR_BASE__: JSON.stringify("./assets/hdr"),
    __SHADERMAKER_HDR_RES__: JSON.stringify(HDR_RES),
    __SHADERMAKER_HDR_EXT__: JSON.stringify("jpg"),
  },
  logLevel: "warning",
});

for (const env of catalog.environments) {
  // 程序天空没有 HDR
  if (!env.hdr) continue;
  // catalog 里是网页版的 2k 地址，换成插件用的分辨率
  const url = env.hdr.replaceAll("2k", HDR_RES);
  const name = basename(url).replace(/\.hdr$/, "");
  await packHdr(await downloadHdr(url), join(out, "assets", "hdr", HDR_RES, name));
}

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

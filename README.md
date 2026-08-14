# ShaderMaker

用 Three.js 做的全屏 shader 工作台：侧边浏览器里看实时画面，下面用自然语言改效果。

## 预览

- Cindy 侧边栏：https://shadermaker.workers.xd.team （仅自己可见）
- 本机：`python3 -m http.server 5173 --bind 127.0.0.1`，然后打开 http://127.0.0.1:5173
- Three.js `r170` 通过 unpkg CDN 加载，仓库不托管 `vendor/`。

## 怎么用

1. 右侧预览里会直接播当前 shader。
2. 右侧面板可以切换预设、拖滑杆。
3. 底部输入中文或英文，例如：
   - `改成岩浆，慢一点`
   - `make it calmer and more purple`
   - `变成星空，再亮一点`
   - `冻结动画`

解析在浏览器本地完成，不依赖后端。

## 版本管理

仓库在 [github.com/rozen630/ShaderMaker](https://github.com/rozen630/ShaderMaker)，默认分支 `main`。

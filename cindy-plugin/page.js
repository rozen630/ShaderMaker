// 插件页面入口：加载 ShaderMaker，并通过 BroadcastChannel 接收后台（main.js）转来的 AI 工具请求。
// 同一份页面既是左侧导航的主视图，也是任务右侧栏的任务页（地址带 ?session=<任务 id>）；
// 可能同时开着好几份，所以每份页面有自己的 pageId，后台只把请求发给选中的那一份。
import { shaderMaker } from "../src/app.js";

const channel = new BroadcastChannel("shadermaker");
const pageId = crypto.randomUUID();
const session = new URLSearchParams(location.search).get("session");

const handlers = {
  state: () => shaderMaker.getState(),
  set: (payload) => shaderMaker.setLook(payload),
  describe: (payload) => shaderMaker.describeLook(String(payload.text || "")),
  snapshot: (payload) => shaderMaker.snapshot(payload.maxSize),
  writeShader: (payload) => shaderMaker.writeShader(payload),
  readShader: (payload) => shaderMaker.readShader(payload),
  deleteShader: (payload) => shaderMaker.deleteShader(payload),
};

channel.addEventListener("message", async ({ data }) => {
  if (data?.type === "discover") {
    channel.postMessage({
      type: "here",
      id: data.id,
      pageId,
      kind: session ? "task" : "main",
      session,
      visible: document.visibilityState === "visible",
    });
    return;
  }
  if (data?.type !== "request" || data.target !== pageId || !handlers[data.action]) return;
  try {
    const result = await handlers[data.action](data.payload || {});
    channel.postMessage({ type: "response", id: data.id, ok: true, result });
  } catch (error) {
    channel.postMessage({ type: "response", id: data.id, ok: false, message: error?.message || String(error) });
  }
});

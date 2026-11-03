// 插件后台：收到 AI 工具调用后，经 BroadcastChannel 转给 ShaderMaker 页面执行（渲染只能在页面里做）。
// 选页面的顺序：当前任务的任务页 → 主视图（可见的优先）→ 其它任务页；一个都没有时，
// 在当前任务的右侧栏自动打开任务页，等它加载好再执行。
const channel = new BroadcastChannel('shadermaker');
const pending = new Map();
let nextId = 1;

channel.addEventListener('message', function (event) {
  const data = event.data;
  if (!data || !pending.has(data.id)) return;
  pending.get(data.id)(data);
});

function sleep(ms) {
  return new Promise(function (resolve) { setTimeout(resolve, ms); });
}

// 广播一次，收集 waitMs 内回应的所有页面
async function discover(waitMs) {
  const id = nextId++;
  const pages = [];
  pending.set(id, function (data) { if (data.type === 'here') pages.push(data); });
  channel.postMessage({ type: 'discover', id: id });
  await sleep(waitMs);
  pending.delete(id);
  return pages;
}

function choosePage(pages, sessionId) {
  const rank = function (page) {
    if (page.kind === 'task' && sessionId && page.session === sessionId) return 0;
    if (page.kind === 'main' && page.visible) return 1;
    if (page.kind === 'main') return 2;
    if (page.visible) return 3;
    return 4;
  };
  return pages.slice().sort(function (a, b) { return rank(a) - rank(b); })[0] || null;
}

async function foregroundSession() {
  if (typeof cindy.taskView !== 'function') return null;
  const peek = await cindy.taskView({ peek: true }).catch(function () { return null; });
  return peek && peek.ok ? peek.sessionId : null;
}

// 返回 { page } 或 { error }
async function findOrOpenPage() {
  const sessionId = await foregroundSession();
  const page = choosePage(await discover(400), sessionId);
  if (page && (page.kind === 'main' || page.session === sessionId || !sessionId)) return { page: page };
  if (!sessionId) {
    return { error: '当前没有可以承载 ShaderMaker 的任务。请在 Cindy 左侧导航打开 ShaderMaker 后重试。' };
  }
  const opened = await cindy.taskView({ sessionId: sessionId }).catch(function (error) {
    return { ok: false, message: error && error.message };
  });
  if (!opened || !opened.ok) {
    if (page) return { page: page };
    return { error: '没能自动打开 ShaderMaker（' + ((opened && (opened.message || opened.errorCode)) || '未知原因') + '）。请在 Cindy 左侧导航手动打开后重试。' };
  }
  // 新开的页面要加载脚本、模型和 HDR，最多等 20 秒
  for (let i = 0; i < 40; i += 1) {
    const ready = (await discover(500)).find(function (item) { return item.session === opened.sessionId; });
    if (ready) return { page: ready };
  }
  if (page) return { page: page };
  return { error: 'ShaderMaker 已在右侧栏打开，但页面迟迟没有加载完成，请稍后重试。' };
}

function ask(page, action, payload, timeoutMs) {
  return new Promise(function (resolve, reject) {
    const id = nextId++;
    const timer = setTimeout(function () {
      pending.delete(id);
      reject(Object.assign(new Error('ShaderMaker 页面没有及时响应，请确认页面仍然打开后重试。'), { code: 'PAGE_TIMEOUT' }));
    }, timeoutMs);
    pending.set(id, function (data) {
      if (data.type !== 'response') return;
      pending.delete(id);
      clearTimeout(timer);
      if (data.ok) resolve(data.result);
      else reject(Object.assign(new Error('执行失败：' + (data.message || '页面出错')), { code: 'PAGE_ERROR' }));
    });
    channel.postMessage({ type: 'request', id: id, target: page.pageId, action: action, payload: payload || {} });
  });
}

async function handle(msg) {
  const found = await findOrOpenPage();
  if (found.error) return { ok: false, errorCode: 'PAGE_NOT_OPEN', message: found.error };
  const page = found.page;
  const args = msg.args || {};
  if (msg.tool === 'set_look') {
    return { ok: true, result: await ask(page, 'set', args, 30000) };
  }
  if (msg.tool === 'describe_look') {
    return { ok: true, result: await ask(page, 'describe', { text: args.text }, 30000) };
  }
  if (msg.tool === 'snapshot') {
    const shot = await ask(page, 'snapshot', { maxSize: args.max_size }, 15000);
    const base64 = String(shot.dataUrl).replace(/^data:image\/\w+;base64,/, '');
    return {
      ok: true,
      result: { width: shot.width, height: shot.height, state: shot.state },
      images: [{ data: base64 }],
    };
  }
  if (msg.tool === 'write_shader') {
    const written = await ask(page, 'writeShader', args, 30000);
    // 编译失败按工具错误返回，错误信息带行号，AI 照着改了再调一次
    if (!written.compiled) {
      return { ok: false, errorCode: 'COMPILE_ERROR', message: 'GLSL 编译失败，修改后重新调用 write_shader：\n' + written.message };
    }
    return { ok: true, result: written };
  }
  if (msg.tool === 'read_shader') {
    return { ok: true, result: await ask(page, 'readShader', args, 15000) };
  }
  if (msg.tool === 'export_shader') {
    return { ok: true, result: await ask(page, 'exportShader', args, 30000) };
  }
  if (msg.tool === 'delete_shader') {
    return { ok: true, result: await ask(page, 'deleteShader', args, 15000) };
  }
  if (msg.tool === 'write_effect') {
    const written = await ask(page, 'writeEffect', args, 60000);
    if (!written.compiled) {
      return { ok: false, errorCode: 'COMPILE_ERROR', message: '效果编译失败，修改后重新调用 write_effect：\n' + written.message };
    }
    return { ok: true, result: written };
  }
  if (msg.tool === 'import_model') {
    // 下载进 Cindy 媒体库（GLB 是受支持的媒体类型，字节不经过沙箱），页面再从同源的 /media/ 读
    const fetched = await cindy.fetch({ url: String(args.url || ''), as: 'media', timeoutMs: 300000, label: 'ShaderMaker 模型', callId: msg.callId });
    if (!fetched || !fetched.ok) {
      return { ok: false, errorCode: 'DOWNLOAD_FAILED', message: '下载失败：' + ((fetched && fetched.message) || '未知原因') };
    }
    if (!fetched.media) {
      return { ok: false, errorCode: 'NOT_A_MODEL', message: '下载到的不是 GLB 模型（HTTP ' + fetched.status + '）' };
    }
    const hash = fetched.media.hash;
    const ext = String(fetched.media.ext || 'glb').replace(/^\./, '');
    const urls = ['/media/' + hash + '.' + ext, '/media/' + hash + ext];
    return { ok: true, result: await ask(page, 'importModel', { urls: urls, name: args.name }, 120000) };
  }
  if (msg.tool === 'delete_model') {
    return { ok: true, result: await ask(page, 'deleteModel', { id: args.id }, 15000) };
  }
  if (msg.tool === 'read_effect') {
    return { ok: true, result: await ask(page, 'readEffect', args, 15000) };
  }
  if (msg.tool === 'delete_effect') {
    return { ok: true, result: await ask(page, 'deleteEffect', args, 15000) };
  }
  return { ok: false, errorCode: 'UNKNOWN_TOOL', message: '未知的工具：' + msg.tool };
}

cindy.onHostMessage(async function (msg) {
  if (msg.type !== 'tool-call') return;
  let reply;
  try {
    reply = await handle(msg);
  } catch (error) {
    reply = { ok: false, errorCode: (error && error.code) || 'PAGE_ERROR', message: error && error.message ? error.message : String(error) };
  }
  await cindy.send(Object.assign({ type: 'tool-result', callId: msg.callId }, reply));
});

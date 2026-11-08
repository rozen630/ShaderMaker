// 本机浏览器存储（IndexedDB）：自定义 Shader、自定义效果、导入的模型和环境图都存在这里，主视图和任务页同源共用。
// 只在这台电脑上，换电脑不会跟过去；想长期保留就把定义收进仓库（见 README）。
const DB_NAME = "shadermaker";
// v1：customShaders；v2：加 effects；v3：加 models（导入模型的名称 / 部件设置）和 modelData（模型文件字节，按需读取）；
// v4：加 environments（上传环境图的名称 / 分析结果 / 旋转曝光）和 environmentData（环境图文件字节）
const DB_VERSION = 4;
const STORES = ["customShaders", "effects", "models", "modelData", "environments", "environmentData"];

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      for (const name of STORES) {
        if (!request.result.objectStoreNames.contains(name)) request.result.createObjectStore(name, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withStore(storeName, mode, run) {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, mode);
      const request = run(tx.objectStore(storeName));
      tx.oncomplete = () => resolve(request?.result);
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

// 读取全部记录，按创建时间排序；读不了（隐私模式等）时返回空列表
export async function loadAll(storeName) {
  try {
    const records = await withStore(storeName, "readonly", (store) => store.getAll());
    return (records || []).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  } catch {
    return [];
  }
}

export const saveRecord = (storeName, record) => withStore(storeName, "readwrite", (store) => store.put(record));
export const loadRecord = (storeName, id) => withStore(storeName, "readonly", (store) => store.get(id));
export const removeRecord = (storeName, id) => withStore(storeName, "readwrite", (store) => store.delete(id));

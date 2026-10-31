// 本机浏览器存储（IndexedDB）：自定义 Shader 和自定义效果都存在这里，主视图和任务页同源共用。
// 只在这台电脑上，换电脑不会跟过去；想长期保留就把定义收进仓库（见 README）。
const DB_NAME = "shadermaker";
// v1：customShaders；v2：加 effects
const DB_VERSION = 2;
const STORES = ["customShaders", "effects"];

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
export const removeRecord = (storeName, id) => withStore(storeName, "readwrite", (store) => store.delete(id));

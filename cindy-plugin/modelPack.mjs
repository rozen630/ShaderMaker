// 展示模型压缩：顶点属性量化（KHR_mesh_quantization，three.js 原生支持，不需要解码器，不受插件 CSP 限制）。
// 位置 16 位、法线 12 位、UV 14 位，索引能用 16 位就用 16 位；体积约为原来的一半，肉眼看不出差别。
// 量化把模型缩放 / 平移写进了节点变换，页面加载后由 models.js 的 dequantize 还原成浮点并烘回网格。
import { writeFile } from "node:fs/promises";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { quantize } from "@gltf-transform/functions";

export async function packModel(input, output) {
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
  const document = await io.read(input);
  await document.transform(quantize({ quantizePosition: 14, quantizeNormal: 8, quantizeTexcoord: 12 }));
  for (const mesh of document.getRoot().listMeshes()) {
    for (const primitive of mesh.listPrimitives()) {
      const indices = primitive.getIndices();
      const array = indices?.getArray();
      if (array && array.reduce((max, value) => Math.max(max, value), 0) < 65535) indices.setArray(new Uint16Array(array));
    }
  }
  const glb = await io.writeBinary(document);
  await writeFile(output, glb);
  return glb.length;
}

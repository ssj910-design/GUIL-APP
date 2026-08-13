import assert from "node:assert/strict";
import { partLeafPhotos, savePartLeafPhotos } from "./partLeafPhotos.js";

// partLeafPhotos: category+subcategory+part가 모두 일치하는 사진만 골라낸다.
const photos = [
  { id: "p1", category: "카도어", subcategory: null, part: "카도어 벤", url: "u1" },
  { id: "p2", category: "카도어", subcategory: null, part: "카도어 벤", url: "u2" },
  { id: "p3", category: "카도어", subcategory: null, part: "카도어 씰", url: "u3" },
];
const { mine, urls } = partLeafPhotos(photos, "카도어", null, "카도어 벤");
assert.deepEqual(urls, ["u1", "u2"]);
assert.equal(mine.length, 2);

// savePartLeafPhotos: nextUrls가 더 길면 추가된 url로 onAdd 호출.
{
  let added = null;
  await savePartLeafPhotos({
    unitId: "unit1", category: "카도어", subcategory: null, part: "카도어 벤",
    mine, urls, nextUrls: ["u1", "u2", "u3"],
    onAdd: async (payload) => { added = payload; },
    onRemove: async () => { throw new Error("onRemove는 호출되면 안 됨"); },
  });
  assert.deepEqual(added, { unitId: "unit1", category: "카도어", subcategory: null, part: "카도어 벤", url: "u3" });
}

// savePartLeafPhotos: nextUrls가 더 짧으면 빠진 사진의 id로 onRemove 호출.
{
  let removedId = null;
  await savePartLeafPhotos({
    unitId: "unit1", category: "카도어", subcategory: null, part: "카도어 벤",
    mine, urls, nextUrls: ["u1"],
    onAdd: async () => { throw new Error("onAdd는 호출되면 안 됨"); },
    onRemove: async (id) => { removedId = id; },
  });
  assert.equal(removedId, "p2");
}

// savePartLeafPhotos: 같은 url이 두 장 겹쳐도(멀티셋) 정확히 한 장만 삭제로 판별.
// findIndex가 앞에서부터 훑으면서 nextCounts(남은 개수)를 먼저 소진시키므로, 앞쪽
// 항목(d1)이 "남은 것"으로 매칭되고 뒤쪽 항목(d2)이 "빠진 것"으로 판별된다.
{
  const dupPhotos = [
    { id: "d1", category: "승장도어", subcategory: null, part: "승장도어 슈", url: "dup" },
    { id: "d2", category: "승장도어", subcategory: null, part: "승장도어 슈", url: "dup" },
  ];
  const { mine: dupMine, urls: dupUrls } = partLeafPhotos(dupPhotos, "승장도어", null, "승장도어 슈");
  let removedId = null;
  await savePartLeafPhotos({
    unitId: "unit1", category: "승장도어", subcategory: null, part: "승장도어 슈",
    mine: dupMine, urls: dupUrls, nextUrls: ["dup"],
    onAdd: async () => { throw new Error("onAdd는 호출되면 안 됨"); },
    onRemove: async (id) => { removedId = id; },
  });
  assert.equal(removedId, "d2");
}

console.log("OK: partLeafPhotos checks passed");

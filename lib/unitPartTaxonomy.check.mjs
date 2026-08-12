import assert from "node:assert/strict";
import { UNIT_PART_TAXONOMY, leafPathsOf, countFilled } from "./unitPartTaxonomy.js";

// 중분류를 거치는 리프(기계실>제어반>PCB)는 subcategory가 채워진다.
const machineRoom = UNIT_PART_TAXONOMY.find((c) => c.label === "기계실");
const machineRoomPaths = leafPathsOf(machineRoom, "기계실", null);
const pcb = machineRoomPaths.find((p) => p.part === "PCB");
assert.deepEqual(pcb, { category: "기계실", subcategory: "제어반", part: "PCB" });

// 중분류 없이 대분류 바로 아래 리프(기계실>비상통화장치)는 subcategory가 null.
const emergencyPhone = machineRoomPaths.find((p) => p.part === "비상통화장치");
assert.deepEqual(emergencyPhone, { category: "기계실", subcategory: null, part: "비상통화장치" });

// 카 상부는 중분류가 아예 없어 모든 리프가 subcategory: null, 개수는 4개.
const carTop = UNIT_PART_TAXONOMY.find((c) => c.label === "카 상부");
const carTopPaths = leafPathsOf(carTop, "카 상부", null);
assert.ok(carTopPaths.every((p) => p.subcategory === null));
assert.equal(carTopPaths.length, 4);

// countFilled: 같은 리프 이름("전체사진")이 기계실 안 여러 중분류(제어반/권상기/조속기)에
// 반복돼도, category+subcategory+part가 전부 일치할 때만 채워진 것으로 센다 —
// 제어반의 전체사진만 있고 권상기 전체사진은 없으면 기계실 전체 배지는 1이어야 한다.
const onlyControlPanelOverall = [{ category: "기계실", subcategory: "제어반", part: "전체사진" }];
assert.equal(countFilled(machineRoomPaths, onlyControlPanelOverall), 1);

// 전체 대분류 라벨이 확정된 7개와 정확히 일치하는지(오타 방지).
assert.deepEqual(
  UNIT_PART_TAXONOMY.map((c) => c.label),
  ["기계실", "카 상부", "카도어", "승장도어", "승강장", "카 내부", "승강로"]
);

console.log("OK: unitPartTaxonomy checks passed");

// 회귀 방지용 최소 self-check — `node lib/inventoryStock.check.mjs`
import assert from "node:assert/strict";
import { currentStock, stockHistory } from "./inventoryStock.js";

const M = (id, productId, qtyDelta, createdAt) => ({ id, productId, qtyDelta, createdAt, type: "adjust", note: null });
const movements = [
  M("m1", "p1", 4, "2026-02-10T00:00:00Z"),
  M("m2", "p1", -4, "2026-03-09T00:00:00Z"),
  M("m3", "p2", 10, "2026-01-01T00:00:00Z"),
];

assert.equal(currentStock(movements, "p1"), 0, "p1 재고 = 4-4 = 0");
assert.equal(currentStock(movements, "p2"), 10, "p2 재고 = 10");
assert.equal(currentStock(movements, "p3"), 0, "움직임 없는 제품은 0");

const history = stockHistory(movements, "p1");
assert.deepEqual(history.map((m) => m.id), ["m2", "m1"], "최신순 정렬");
assert.equal(history[0].balance, 0, "가장 최근(m2, -4) 이후 잔액 0");
assert.equal(history[1].balance, 4, "그 앞(m1, +4) 시점 잔액 4");

console.log("OK: inventoryStock checks passed");

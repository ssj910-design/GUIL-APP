// 발주서 승인 일시가 한국 시간으로 나오는지 — UTC 문자열을 그냥 자르던 버그(07:57 vs 16:57) 재발 방지.
// 실행: node lib/purchaseOrderData.check.mjs
import assert from "node:assert";
import { kstDateTime } from "./purchaseOrderData.js";

assert.deepStrictEqual(kstDateTime("2026-11-10T07:57:12.000Z"), { date: "2026-11-10", time: "16:57" });
// KST로 날이 바뀌는 경계 — UTC 기준 전날 15:30이 KST로는 다음 날 00:30.
assert.deepStrictEqual(kstDateTime("2026-11-09T15:30:00.000Z"), { date: "2026-11-10", time: "00:30" });
assert.deepStrictEqual(kstDateTime(null), { date: "", time: "" });
console.log("purchaseOrderData 승인일시 KST 변환 OK");

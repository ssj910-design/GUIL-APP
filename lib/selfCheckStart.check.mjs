// 회귀 방지용 최소 self-check — `node lib/selfCheckStart.check.mjs`
import assert from "node:assert/strict";
import { selfCheckNotStarted } from "./selfCheckStart.js";

const units = [{ id: "u1", siteId: "new" }, { id: "u2", siteId: "renewed" }];
const checks = [{ unitId: "u2", ym: "2026-08" }, { unitId: "u1", ym: "2026-09" }];

assert.equal(selfCheckNotStarted({ id: "new", contractDate: "2026-10-01" }, "2026-09", checks, units), true, "신규 현장, 10월 시작 → 9월엔 제외");
assert.equal(selfCheckNotStarted({ id: "new", contractDate: "2026-10-01" }, "2026-10", checks, units), false, "시작 달부터 포함");
assert.equal(selfCheckNotStarted({ id: "new", contractDate: "2026-09-20" }, "2026-09", checks, units), false, "달 중간 시작이면 그 달 포함");
assert.equal(selfCheckNotStarted({ id: "renewed", contractDate: "2026-11-01" }, "2026-09", checks, units), false, "재계약(이전 기록 있음)은 계속 포함");
assert.equal(selfCheckNotStarted({ id: "new", contractDate: null }, "2026-09", checks, units), false, "계약일자 없으면 포함");

console.log("OK: selfCheckStart checks passed");

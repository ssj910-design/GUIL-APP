// 회귀 방지용 최소 self-check — `node lib/inspectionOverdue.check.mjs`
import assert from "node:assert/strict";
import { overdueDaysOf, needsInspectionAlert, appliedStatusOf } from "./inspectionOverdue.js";

const today = "2026-10-29";

assert.equal(overdueDaysOf("2026-09-29", today), 30, "딱 30일 지나면 대상");
assert.equal(overdueDaysOf("2026-09-30", today), null, "29일은 아직 아님");
assert.equal(overdueDaysOf(null, today), null, "유효기간 없으면 대상 아님");

const u = (end, applied) => ({ inspectionEnd: end, inspectionAppliedAt: applied });
assert.equal(needsInspectionAlert(u("2026-01-20", null), today), true, "체크 안 했으면 알림");
assert.equal(needsInspectionAlert(u("2026-10-20", null), today), false, "아직 한 달 안 지났으면 알림 없음");
assert.equal(needsInspectionAlert(u("2026-01-20", "2026-10-20"), today), false, "체크한 지 9일이면 알림 없음");
assert.equal(needsInspectionAlert(u("2026-01-20", "2026-09-20"), today), true, "체크 후 30일 넘으면 다시 알림");

assert.equal(appliedStatusOf(u("2026-01-20", null), today).label, "미확인");
assert.equal(appliedStatusOf(u("2026-01-20", "2026-10-20"), today).label, "신청함");
assert.equal(appliedStatusOf(u("2026-01-20", "2026-09-20"), today).label, "신청 후 39일 경과");

console.log("OK: inspectionOverdue checks passed");

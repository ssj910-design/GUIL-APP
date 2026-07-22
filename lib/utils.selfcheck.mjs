// 회귀 방지용 최소 self-check — `node lib/utils.selfcheck.mjs`
// elevator_no가 "1호기"/"1-1"처럼 제각각이라 화면 라벨로 정규화해 같은 호기로 묶는지 확인한다.
import assert from "node:assert";
import { unitHistory, recentFailuresBySite } from "./utils.js";

const F = (id, siteId, elevatorNo, createdAt) => ({ id, siteId, elevatorNo, createdAt });
const fs = [
  F("a", "s1", "1호기", "2026-07-21T05:00:00Z"),
  F("b", "s1", "1-1",   "2026-07-20T05:00:00Z"), // 같은 1호기 (정규화되면 매칭)
  F("c", "s1", "1-1",   "2026-07-19T05:00:00Z"),
  F("d", "s1", "2호기", "2026-07-18T05:00:00Z"), // 다른 호기
  F("e", "s2", "1호기", "2026-07-18T05:00:00Z"), // 다른 현장
  F("f", "s1", "",      "2026-07-18T05:00:00Z"), // 호기 불명
];

// self=a(1호기): b,c(1-1)만 같은 호기로 잡히고 최신순, 자기 자신/다른 호기/다른 현장/불명은 제외
assert.deepStrictEqual(unitHistory(fs, fs[0]).map((x) => x.id), ["b", "c"], "1호기≡1-1 정규화 매칭 + 최신순 + self 제외");
// self=f(불명): 1호기로 잘못 묶이지 않는다
assert.deepStrictEqual(unitHistory(fs, fs[5]).map((x) => x.id), [], "호기 불명은 1호기와 안 묶임");
// recentFailuresBySite: 정규화로 1호기 3건(a,b,c)이 임계(3) 충족 → s1 등장
const rc = recentFailuresBySite(fs, 3650, 3);
assert.ok(rc.has("s1") && rc.get("s1").length >= 3, "정규화로 1호기 3건이 재발 임계 충족");

console.log("utils self-check 통과");

// 회귀 방지용 최소 self-check — `node lib/siteSearch.check.mjs`
// 전화번호를 하이픈 빼고 쳐도(또는 하이픈을 넣고 쳐도) 현장이 검색되는지.
import assert from "node:assert/strict";
import { siteMatchesQuery, siteMatchReasons } from "./utils.js";

const site = { id: "s1", name: "자곡복합문화센터", address: "서울 강남구", phone: "6712-0590", emergencyPhone: "012-2562-2370" };
const units = [
  { id: "u1", siteId: "s1", seq: 1, unitNo: "1호기", isActive: true, emergencyPhone: "012-2562-2370" },
  { id: "u2", siteId: "s1", seq: 2, unitNo: "2호기", isActive: true, emergencyPhone: "012-2562-2369" },
];
const managers = [{ id: "m1", siteId: "s1", name: "이재용", phone: "010-7381-7785" }];
const opts = { units, siteManagers: managers };
const hit = (q) => siteMatchesQuery(site, q, opts);

assert.equal(hit("01225622370"), true, "하이픈 빼고 쳐도 비상통화장치로 검색");
assert.equal(hit("012-2562-2370"), true, "하이픈 그대로 쳐도 검색");
assert.equal(hit("25622370"), true, "뒷자리만 쳐도 검색");
assert.equal(hit("01073817785"), true, "담당자 전화번호도 하이픈 없이 검색");
assert.equal(hit("67120590"), true, "현장 대표번호도 하이픈 없이 검색");
assert.equal(hit("01225622369"), true, "호기별 번호(2호기)로도 검색");
assert.equal(hit("01099998888"), false, "없는 번호는 안 잡힘");
assert.equal(hit("자곡"), true, "현장명 검색은 그대로");
// "20"은 "6712-0590"에 글자 그대로는 없고 숫자만 뽑아야 걸리는 값 — 숫자 2개뿐이면 번호 검색을 안 해야 한다(오탐 방지).
assert.equal(hit("20"), false, "숫자 2개뿐이면 번호 검색 안 함(오탐 방지)");

assert.ok(siteMatchReasons(site, "01225622370", opts).includes("비상통화장치"), "매칭 이유도 같은 기준");

console.log("OK: siteSearch checks passed");

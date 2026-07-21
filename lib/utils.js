
export function siteUnits(site) {
  const n = site.unitCount || 1;
  return Array.from({ length: n }, (_, i) => `${i + 1}호기`);
}


// 전화번호 입력용 — 숫자만 남기고 자동 하이픈 (02 유선 / 휴대폰·지방 유선 모두)
export function formatPhone(v) {
  const d = v.replace(/\D/g, "").slice(0, 11);
  if (d.startsWith("02")) {
    if (d.length <= 2) return d;
    if (d.length <= 5) return `${d.slice(0, 2)}-${d.slice(2)}`;
    if (d.length <= 9) return `${d.slice(0, 2)}-${d.slice(2, 5)}-${d.slice(5)}`;
    return `${d.slice(0, 2)}-${d.slice(2, 6)}-${d.slice(6, 10)}`;
  }
  if (d.length <= 3) return d;
  if (d.length <= 7) return `${d.slice(0, 3)}-${d.slice(3)}`;
  if (d.length <= 10) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
}

export function addDays(dateStr, days) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}


// 고장 1건이 지금 어느 단계인지: 대기(미확인) → 출동중 → 도착(결과입력 대기) → 완료
export function failureStage(f) {
  if (f.status === "완료") return "done";
  if (f.arrivalTime) return "arrived";
  if (f.dispatchedAt) return "dispatched";
  return "pending";
}


// errorCode는 "고장구분 (고장상세내역)" 형태로 저장돼 있어, 화면 표시용으로 다시 나눠줍니다.
export function parseErrorCode(errorCode) {
  const m = /^(.+?)(?:\s\((.+)\))?$/.exec(errorCode ?? "");
  return { faultType: m?.[1] ?? errorCode ?? "", faultDetail: m?.[2] ?? "" };
}

// ---------- v2 호기(units) 헬퍼 ----------

// 호기 라벨을 순번으로: '1-2' → 2, '3호기' → 3, 그 외 → null
export function labelToSeq(label) {
  if (typeof label !== "string") return null;
  let m = /^1-(\d+)$/.exec(label);
  if (m) return Number(m[1]);
  m = /^(\d+)호기$/.exec(label);
  if (m) return Number(m[1]);
  return null;
}

// 호기 라벨 표시 정규화 — 레거시 "1-N"이든 신규 "N호기"든 항상 "N호기"로 통일해서 보여준다.
export function formatUnitLabel(label) {
  const seq = labelToSeq(label);
  return seq ? `${seq}호기` : label;
}

// 현장의 호기 목록. units 테이블에 실데이터가 있으면 그걸 쓰고(마이그레이션 후),
// 없으면 기존 방식(unit_count로 합성)으로 fallback (마이그레이션 전).
// legacyLabel은 옛 기록(elevator_no 텍스트)과 매칭할 때 쓴다.
export function siteUnitList(site, units) {
  const real = (units ?? [])
    .filter((u) => u.siteId === site.id && u.isActive !== false)
    .sort((a, b) => a.seq - b.seq)
    .map((u) => ({ ...u, legacyLabel: `1-${u.seq}` }));
  if (real.length) return real;
  return siteUnits(site).map((label, i) => ({
    id: null,
    siteId: site.id,
    seq: i + 1,
    unitNo: label,
    legacyLabel: label,
    unitType: "엘리베이터",
    model: site.elevatorModel,
    installDate: null,
    govNo: (site.govElevatorNos ?? [])[i] ?? null,
    isActive: true,
  }));
}

// 이름 → 프로필 id ('관리자' 기록은 '관리자(신석주)' 프로필로 병합 — supabase/MIGRATION.md 결정)
export function profileIdByName(profiles, name) {
  if (!name) return null;
  const target = name === "관리자" ? "관리자(신석주)" : name;
  return (profiles ?? []).find((p) => p.name === target)?.id ?? null;
}

// 현장 + 호기 라벨 → units.id (마이그레이션 전에는 null)
export function unitIdFor(units, siteId, label) {
  const seq = labelToSeq(label);
  if (!seq) return null;
  return (units ?? []).find((u) => u.siteId === siteId && u.seq === seq)?.id ?? null;
}


const WEEKDAYS_KO = ["일", "월", "화", "수", "목", "금", "토"];

// "2026-07-31" → "7. 31. (금)"
export function formatShortDate(dateStr) {
  if (!dateStr) return "";
  const d = new Date(`${dateStr}T00:00:00`);
  return `${d.getMonth() + 1}. ${d.getDate()}. (${WEEKDAYS_KO[d.getDay()]})`;
}

// "2026-07-31" → "2026. 7. 31. (금)"
export function formatFullDate(dateStr) {
  if (!dateStr) return "";
  const d = new Date(`${dateStr}T00:00:00`);
  return `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()}. (${WEEKDAYS_KO[d.getDay()]})`;
}

// "메인보드 2개" → { name: "메인보드", qty: "2개" } — 매칭 안 되면 name에 원문 전체를 그대로 담는다.
export function parsePartQty(str) {
  if (!str) return { name: "", qty: "" };
  const m = /^(.+?)\s+(\d+)\s*개$/.exec(str.trim());
  return m ? { name: m[1], qty: `${m[2]}개` } : { name: str.trim(), qty: "" };
}

// "2026-07-20" → "26-07-20(월)"
export function formatYyMmDd(dateStr) {
  if (!dateStr) return "";
  const d = new Date(`${dateStr}T00:00:00`);
  const yy = String(d.getFullYear()).slice(2);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}(${WEEKDAYS_KO[d.getDay()]})`;
}

// "2026-07-18" → "7월 18일"
export function formatMonthDay(dateStr) {
  if (!dateStr) return "";
  const d = new Date(`${dateStr}T00:00:00`);
  return `${d.getMonth() + 1}월 ${d.getDate()}일`;
}

// "서울특별시 영등포구 여의대방로 21길 7" → "영등포구 여의대방로 21길 7" (앞 시/도 단어 제거)
export function stripCityPrefix(address) {
  if (!address) return "";
  const parts = address.trim().split(/\s+/);
  if (parts.length > 1 && /(시|도)$/.test(parts[0])) {
    return parts.slice(1).join(" ");
  }
  return address;
}

// 국가승강기정보센터 API의 "20260716" 형식 날짜를 "2026-07-16"으로.
export function govDateToDashed(yyyymmdd) {
  if (!yyyymmdd || yyyymmdd.length !== 8) return null;
  return `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}`;
}

// 검사예정일(수기입력) 항목에 연결된 호기를 찾는다.
// unit_id가 채워져 있으면 그걸 쓰고, 없으면(옛 데이터 등) 같은 현장에서 호기 라벨이
// 일치하는 걸 찾고, 그마저 안 되면(단일 호기 현장) 그 현장의 첫 호기로 대체한다.
export function findUnitForInspection(inspection, units) {
  if (inspection.unitId) {
    return (units ?? []).find((u) => u.id === inspection.unitId) ?? null;
  }
  const siteUnits = (units ?? []).filter((u) => u.siteId === inspection.siteId && u.isActive !== false);
  return siteUnits.find((u) => u.unitNo === inspection.elevatorNo) ?? siteUnits[0] ?? null;
}

// 정렬된 검사 목록에서 같은 현장(siteId)의 호기들이 연달아 보이도록 재배열한다.
// 전체 순서는 유지한다 — 그룹의 위치는 그 현장의 가장 먼저 나온(가장 급한) 항목이 정한다.
export function groupBySite(list) {
  const groups = new Map();
  const order = [];
  for (const item of list) {
    if (!groups.has(item.siteId)) {
      groups.set(item.siteId, []);
      order.push(item.siteId);
    }
    groups.get(item.siteId).push(item);
  }
  return order.flatMap((siteId) => groups.get(siteId));
}

// units의 검사유효기간 캐시(DB)로 검사 목록을 만든다 — 대량 화면용.
// 실시간 공단 API는 호기 상세(단건)에서만 호출한다 (876대 전수 호출 방지).
export function unitsToInspections(units, sites) {
  return (units ?? [])
    // 조건부합격·불합격은 최종 승인 전이라 유효기간(inspectionEnd)이 아직 안 잡혀있는 경우가 있다
    // (대흥빌딩 확인됨) — inspectionEnd가 없어도 판정결과가 있으면 포함한다.
    .filter((u) => (u.inspectionEnd || u.inspectionResult) && u.isActive !== false)
    .map((u) => {
      const s = (sites ?? []).find((x) => x.id === u.siteId);
      return {
        id: `unit-${u.id}`,
        unitId: u.id,
        siteId: u.siteId,
        siteName: s?.name ?? "-",
        elevatorNo: u.unitNo,
        dueDate: u.inspectionEnd,
        startDate: u.inspectionStart,
        result: u.inspectionResult === "합격" ? "pass"
          : u.inspectionResult === "조건부합격" ? "conditional"
          : u.inspectionResult === "불합격" ? "fail" : null,
        org: "한국승강기안전공단",
        type: "정기검사",
        notes: "",
        govElevatorNo: u.govNo,
      };
    });
}


// 두 좌표 사이 직선거리(km) — 하버사인. 실제 주행거리는 아니지만
// "누가 더 가까운가"를 정렬하는 데는 충분하고, 티맵 경로 API를 배정할 때마다
// 기사 수만큼 부르는 것보다 훨씬 싸다.
export function distanceKm(a, b) {
  if (!a || !b || a.lat == null || b.lat == null) return null;
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}


// 최근 30일간 현장별 고장 목록 — 집중관리현장 판단·표시(건수·해당 호기)용. 처리완료 여부와
// 무관하게 전부 포함한다 (기사가 처리완료해도 30일 내 누적 3회면 계속 집중관리 대상이어야 함).
// 기준은 호기 단위다 — 한 현장에 호기가 여러 대면 그걸 합산해 3회를 채우는 게 아니라,
// 그중 한 호기가 단독으로 임계치 이상이어야 한다. 그래서 호기별로 먼저 묶고, 임계치를
// 넘긴 호기의 기록만 현장 목록에 담는다(그 호기가 몇 대든 합쳐서 담김 — 표시용).
export function recentFailuresBySite(failures, days = 30, threshold = 3) {
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  const perUnit = new Map(); // `${siteId}|${elevatorNo}` -> failure[]
  for (const f of failures) {
    if (!f.createdAt || new Date(f.createdAt).getTime() < cutoff) continue;
    const key = `${f.siteId}|${f.elevatorNo ?? ""}`;
    const arr = perUnit.get(key);
    if (arr) arr.push(f);
    else perUnit.set(key, [f]);
  }
  const bySite = new Map();
  for (const [key, arr] of perUnit) {
    if (arr.length < threshold) continue;
    const siteId = key.slice(0, key.indexOf("|"));
    const existing = bySite.get(siteId);
    if (existing) existing.push(...arr);
    else bySite.set(siteId, [...arr]);
  }
  return bySite;
}

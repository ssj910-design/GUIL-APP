
export function siteUnits(site) {
  const n = site.unitCount || 1;
  return Array.from({ length: n }, (_, i) => `1-${i + 1}`);
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

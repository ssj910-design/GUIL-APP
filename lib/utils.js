
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

// units의 검사유효기간 캐시(DB)로 검사 목록을 만든다 — 대량 화면용.
// 실시간 공단 API는 호기 상세(단건)에서만 호출한다 (876대 전수 호출 방지).
export function unitsToInspections(units, sites) {
  return (units ?? [])
    .filter((u) => u.inspectionEnd && u.isActive !== false)
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

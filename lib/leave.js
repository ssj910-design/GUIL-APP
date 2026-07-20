// 연차(유급휴가) 자동 계산 — 근로기준법 60조 기준.
//
//  · 1년 미만: 1개월 개근마다 1일 (최대 11일)
//  · 1년 이상(출근율 80% 이상): 15일
//  · 3년 이상 근속: 최초 1년을 초과하는 매 2년마다 1일 가산 → 15 + floor((근속연수 - 1) / 2)
//  · 상한 25일
//
// 출근율 80% 미달·중도 입퇴사 정산 같은 예외는 자동으로 판단할 수 없으므로
// 관리자가 '부여 일수'에 직접 값을 넣어 덮어쓴다(수동값 우선).

// 기준일(asOf) 시점의 만 근속연수. 입사기념일이 지나지 않았으면 1년 덜 센다.
export function yearsOfService(hireDate, asOf) {
  const h = new Date(`${hireDate}T00:00:00`);
  const a = new Date(`${asOf}T00:00:00`);
  let years = a.getFullYear() - h.getFullYear();
  const beforeAnniv = a.getMonth() < h.getMonth() || (a.getMonth() === h.getMonth() && a.getDate() < h.getDate());
  if (beforeAnniv) years--;
  return years;
}

export function monthsOfService(hireDate, asOf) {
  const h = new Date(`${hireDate}T00:00:00`);
  const a = new Date(`${asOf}T00:00:00`);
  let months = (a.getFullYear() - h.getFullYear()) * 12 + (a.getMonth() - h.getMonth());
  if (a.getDate() < h.getDate()) months--; // 개근 한 달을 못 채웠으면 제외
  return months;
}

/** 기준일 시점에 발생한 연차 일수. 입사일이 없으면 null(=계산 불가). */
export function annualLeaveDays(hireDate, asOf) {
  if (!hireDate) return null;
  const years = yearsOfService(hireDate, asOf);
  if (years < 0) return 0; // 아직 입사 전
  if (years < 1) return Math.max(0, Math.min(11, monthsOfService(hireDate, asOf)));
  return Math.min(25, 15 + Math.floor((years - 1) / 2));
}

// --- 자체 점검 (node lib/leave.js) ---
if (typeof process !== "undefined" && process.argv?.[1]?.endsWith("leave.js")) {
  const eq = (got, want, label) => {
    if (got !== want) throw new Error(`${label}: ${got} !== ${want}`);
    console.log(`ok ${label} = ${got}`);
  };
  eq(annualLeaveDays("2026-01-01", "2026-07-20"), 6, "6개월차");       // 1개월당 1일
  eq(annualLeaveDays("2025-01-01", "2026-07-20"), 15, "1년 초과");
  eq(annualLeaveDays("2023-05-01", "2026-07-20"), 16, "3년 근속");      // 캡처 예시
  eq(annualLeaveDays("2018-07-01", "2026-07-20"), 18, "8년 근속");      // 15 + floor(7/2)=3
  eq(annualLeaveDays("2005-01-01", "2026-07-20"), 25, "21년 이상 상한");
  eq(annualLeaveDays("2025-08-01", "2026-07-20"), 11, "11개월 상한 확인");
  eq(annualLeaveDays(null, "2026-07-20"), null, "입사일 없음");
  console.log("연차 계산 자체 점검 통과");
}

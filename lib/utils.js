
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

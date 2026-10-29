// 검사유효기간 경과 관리 — 관리자웹 화면(InspectionsAdmin)과 주간 알림 크론
// (app/api/cron/check-inspection-overdue)이 같은 기준을 쓰도록 판정 규칙만 모아둔다.

export const OVERDUE_DAYS = 30;        // 유효기간이 이만큼 지나면 관리 대상
export const REAPPLY_AFTER_DAYS = 30;  // "검사 신청함" 체크 후 이만큼 지나도 그대로면 다시 알린다

export function daysSince(dateStr, todayStr) {
  if (!dateStr) return null;
  return Math.floor((new Date(`${todayStr}T00:00:00Z`) - new Date(`${dateStr}T00:00:00Z`)) / 86400000);
}

// 유효기간이 OVERDUE_DAYS 넘게 지났는지 — 지났으면 경과일, 아니면 null.
export function overdueDaysOf(inspectionEnd, todayStr) {
  const d = daysSince(inspectionEnd, todayStr);
  return d != null && d >= OVERDUE_DAYS ? d : null;
}

// 알림을 보낼 대상인지 — 체크 안 했거나, 체크한 지 REAPPLY_AFTER_DAYS 넘었는데 아직 유효기간이 그대로면 보낸다.
export function needsInspectionAlert(unit, todayStr) {
  if (!overdueDaysOf(unit?.inspectionEnd ?? unit?.inspection_end, todayStr)) return false;
  const applied = unit?.inspectionAppliedAt ?? unit?.inspection_applied_at;
  if (!applied) return true;
  const since = daysSince(applied, todayStr);
  return since != null && since >= REAPPLY_AFTER_DAYS;
}

// 화면 표시용 상태 — "미확인" | "신청함" | "신청 후 N일 경과"
export function appliedStatusOf(unit, todayStr) {
  const applied = unit?.inspectionAppliedAt ?? unit?.inspection_applied_at;
  if (!applied) return { label: "미확인", tone: "red", stale: false };
  const since = daysSince(applied, todayStr) ?? 0;
  if (since >= REAPPLY_AFTER_DAYS) return { label: `신청 후 ${since}일 경과`, tone: "amber", stale: true };
  return { label: "신청함", tone: "green", stale: false };
}

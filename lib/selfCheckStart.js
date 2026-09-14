// 계약 시작 전 신규 현장은 자체점검 대상이 아니다 — 계약일자(contract_date)가 속한 달부터 시작한다.
// 단 재계약은 "새 계약일자"를 기존 계약종료일 다음날(미래)로 적어서, 계약일자만 보면 계속 운영
// 중인 기존 현장이 빠진다. 그래서 이전 달 자체점검 기록이 하나도 없는 현장(=처음 계약)만 뺀다.
// DB 쪽 generate_self_checks(마이그레이션 143)도 같은 기준이다.
export function selfCheckNotStarted(site, ym, selfChecks, units) {
  if (!site?.contractDate || site.contractDate.slice(0, 7) <= ym) return false;
  const unitIds = new Set(units.filter((u) => u.siteId === site.id).map((u) => u.id));
  return !selfChecks.some((c) => c.ym < ym && unitIds.has(c.unitId));
}

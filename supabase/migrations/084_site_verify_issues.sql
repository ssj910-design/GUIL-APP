-- 084: 검증 문제 목록 저장 (2026-07-30)
-- 엑셀 검증에서 잡힌 노랑/빨강 문제들을 현장에 저장 — 현장 상세에서 "무엇이 문제였는지" 보고
-- 바로 통과 처리할 수 있게 한다 (검증 모달을 다시 열 필요 없음).
alter table public.sites add column if not exists verify_issues jsonb;

-- 018: 계약 종료일 — 만료 30일 전 알림·재계약 흐름용.
-- 계약 시작은 기존 contract_date 사용. 실행: 2026-07-17 (prod + 리허설)
alter table sites add column if not exists contract_end date;

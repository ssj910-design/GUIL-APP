-- 098: 현장 "비고(사무직 참고사항)" 추가 — 관리자웹 전용, 기존 비고(현장직 참고사항=notes)와 별개 (2026-08-03)

alter table public.sites add column if not exists office_notes text;

-- 검증
select column_name from information_schema.columns
where table_schema = 'public' and table_name = 'sites'
  and column_name = 'office_notes';

-- 101: 현장 "관리주체" 추가 — 관리자웹 현장정보, 주소 옆에 표시·수정 (2026-08-04)

alter table public.sites add column if not exists management_body text;

-- 검증
select column_name from information_schema.columns
where table_schema = 'public' and table_name = 'sites'
  and column_name = 'management_body';

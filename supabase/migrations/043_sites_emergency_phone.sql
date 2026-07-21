-- 043: 현장 비상통화장치 정보 (2026-07-21)
-- 현장정보 화면에 전화번호/팩스/이메일과 함께 표시할 비상통화장치 번호·연결방식.
alter table public.sites add column if not exists emergency_phone text; -- 비상통화장치 번호(통신사)
alter table public.sites add column if not exists emergency_type text;  -- 방식: 국선 | 무선

-- 검증
select column_name from information_schema.columns
where table_schema = 'public' and table_name = 'sites'
  and column_name in ('emergency_phone', 'emergency_type')
order by column_name;

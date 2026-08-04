-- 099: 호기(units)별 계약구분 — 한 현장 안에서 1호기 FM/2호기 POG처럼 섞인 경우 대응 (2026-08-03)

alter table public.units add column if not exists contract_type text;

-- 검증
select column_name from information_schema.columns
where table_schema = 'public' and table_name = 'units'
  and column_name = 'contract_type';

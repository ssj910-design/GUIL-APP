-- 050 (DRAFT, 미실행): 지급대장 수기입력 항목
-- 지급목록은 상비부품(restock_requests)만 자동 연동하고, 그 외 지급 품목은
-- 관리자가 직접 입력한다. 배열 원소 형태: {label, date, note}
alter table public.profiles add column if not exists manual_ledger_items jsonb default '[]'::jsonb;

-- 검증
select column_name from information_schema.columns
where table_schema = 'public' and table_name = 'profiles' and column_name = 'manual_ledger_items';

-- 049 (DRAFT, 미실행): 인사관리 지급대장 PDF 첨부
-- 근로계약서(contract_url)와 같은 방식 — photos 버킷에 올린 지급대장 PDF의 URL만 저장.
alter table public.profiles add column if not exists ledger_url text; -- 지급대장 사본(PDF) URL

-- 검증
select column_name from information_schema.columns
where table_schema = 'public' and table_name = 'profiles' and column_name = 'ledger_url';

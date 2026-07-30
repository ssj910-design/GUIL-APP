-- 079: 현장 사업자등록증 다중 첨부 (2026-07-30)
-- 계약서(contract_urls)와 동일한 방식 — 여러 장 첨부, 팝업에서 좌우로 넘겨봄.
alter table public.sites add column if not exists business_reg_urls text[];

-- 검증
select column_name from information_schema.columns
where table_schema = 'public' and table_name = 'sites'
  and column_name = 'business_reg_urls';

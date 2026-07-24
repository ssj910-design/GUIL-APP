-- 056: 현장 계약서 다중 첨부 (2026-07-24)
-- 계약서를 여러 장(페이지) 첨부하고 팝업에서 좌우로 넘겨볼 수 있어야 해서
-- 단일 URL(055의 contract_url)을 배열로 바꾼다. contract_url은 아직 아무 현장도
-- 값이 없어(전부 null) 데이터 이전 없이 새 컬럼만 추가하면 된다. 기존 컬럼은 미사용으로 남긴다.
alter table public.sites add column if not exists contract_urls text[];

-- 검증
select column_name from information_schema.columns
where table_schema = 'public' and table_name = 'sites'
  and column_name = 'contract_urls';

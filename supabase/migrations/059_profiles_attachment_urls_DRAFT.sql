-- 059: 인사관리 근로계약서·지급대장 다중 첨부 (2026-07-24)
-- 현장정보 계약서와 동일하게 클릭 없이 바로 보이는 팝업 뷰어 + 캐러셀을 쓰려면
-- 단일 URL(048/049의 contract_url/ledger_url)이 아니라 배열이 필요하다.
-- 기존 단일 컬럼은 실사용 데이터가 있을 수 있어 남겨두고, 새 배열 컬럼만 추가한다.
alter table public.profiles add column if not exists contract_urls text[];
alter table public.profiles add column if not exists ledger_urls text[];

-- 기존 단일 URL이 있으면 배열의 첫 항목으로 옮겨준다 (이미 첨부해둔 사람이 있을 수 있어서).
update public.profiles set contract_urls = array[contract_url]
  where contract_url is not null and (contract_urls is null or array_length(contract_urls, 1) is null);
update public.profiles set ledger_urls = array[ledger_url]
  where ledger_url is not null and (ledger_urls is null or array_length(ledger_urls, 1) is null);

-- 검증
select name, contract_url, contract_urls, ledger_url, ledger_urls from public.profiles
where contract_url is not null or ledger_url is not null;

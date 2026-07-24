-- 055: 현장 계약서 첨부 + 계약종료 상세 기록 (2026-07-24)
-- 계약서(contract_url)는 profiles.contract_url(근로계약서)과 같은 방식 — photos 버킷에 올린
-- 파일 URL만 저장. 계약종료는 기존에 is_active만 껐는데, 언제·무슨 근거로·왜 종료했는지
-- 남기지 않아 추적이 안 됐다 — 종료일자/근거/사유 3개 컬럼을 추가한다.
alter table public.sites add column if not exists contract_url text;
alter table public.sites add column if not exists terminated_date date;
alter table public.sites add column if not exists termination_basis text;   -- 예: 중지공문 / 구두통보 / 기타
alter table public.sites add column if not exists termination_reason text;

-- 검증
select column_name from information_schema.columns
where table_schema = 'public' and table_name = 'sites'
  and column_name in ('contract_url', 'terminated_date', 'termination_basis', 'termination_reason')
order by column_name;

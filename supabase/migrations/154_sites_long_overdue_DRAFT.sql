-- 154: 현장 "장기미수" 수기 체크 — 관리자가 체크, 기사 앱 고장접수·현장상세·자재신청에 경고 표시

alter table public.sites add column if not exists long_overdue boolean not null default false;
alter table public.sites add column if not exists long_overdue_note text;

-- 검증
select column_name from information_schema.columns
where table_schema = 'public' and table_name = 'sites'
  and column_name in ('long_overdue', 'long_overdue_note');

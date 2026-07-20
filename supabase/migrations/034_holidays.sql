-- 034: 공휴일 자동 동기화 (2026-07-20)
-- 공휴일을 JSON 파일로 들고 있으면 매년 누군가 손으로 고쳐야 하고, 임시공휴일(선거일 등)이
-- 생기면 반영이 늦는다. 한국천문연구원 특일정보 API(data.go.kr B090041)에서 받아 이 테이블에 쌓고,
-- Vercel Cron이 주기적으로 갱신한다. API 키가 없거나 실패하면 lib/holidays.json으로 폴백한다.
create table if not exists public.holidays (
  holiday_date date primary key,
  name text not null,
  year int generated always as (extract(year from holiday_date)::int) stored,
  synced_at timestamptz not null default now()
);

create index if not exists holidays_year_idx on public.holidays (year);

select count(*) as holidays from public.holidays;

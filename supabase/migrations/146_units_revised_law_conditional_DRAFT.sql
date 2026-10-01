-- 146: units.revised_law_conditional — 조건부합격 중 "개정법 조건부"로 따로 관리할 호기 표시 (2026-09-30)
-- 공단 판정(조건부합격)은 그대로 두고, 관리자가 검사관리에서 수동으로 분류한다.
-- 조건부합격이 아니게 되면(다음 검사 합격 등) sync-inspection-cache 크론이 자동으로 꺼준다.

alter table public.units add column if not exists revised_law_conditional boolean not null default false;

-- 검증
select count(*) filter (where revised_law_conditional) as 개정법조건부 from public.units;

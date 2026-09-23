-- 144: duty_schedules.auto_profile_id — 근무표 생성 때 "순번이 뽑은 사람"을 따로 남긴다 (2026-09-23)
-- 배경: 다음 달 순번 이어받기를 "지난달 마지막 칸의 실제 담당자"로 판단했는데, 기사끼리 교환·넘기기·
-- 대신서기를 하거나 관리자가 수동으로 바꾸면 그 칸의 담당자(profile_id)가 실제로 바뀐다. 그래서
-- 원래 순번과 다른 사람이 기준이 돼 다음 달 시작 순번이 어긋났다(9/27 주말 유재성 → 10/3 간기연).
-- profile_id(실제 근무자)는 그대로 두고, 순번 계산은 이 컬럼(원래 순번 배정자)만 본다.

alter table public.duty_schedules add column if not exists auto_profile_id uuid references public.profiles(id);

-- 검증
select count(*) as 전체, count(auto_profile_id) as 순번기록있음 from public.duty_schedules;

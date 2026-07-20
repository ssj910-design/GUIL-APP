-- 032: 입사일자 (2026-07-20)
-- 연차 자동 계산의 기준. 계산식은 lib/leave.js 참고
-- (1년 미만 = 개근 개월당 1일 최대 11일 / 1년 이상 15일 / 3년부터 2년마다 +1일, 상한 25일)
alter table public.profiles add column if not exists hire_date date;

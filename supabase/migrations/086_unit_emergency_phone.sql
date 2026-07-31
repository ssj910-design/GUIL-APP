-- 086: 호기별 비상통화장치 번호 (2026-07-31)
-- 비상통화장치는 승강기(호기)마다 달려 있어 번호도 호기별로 다르다
-- (예: 강변타운아파트 1호기 012-2652-5959 / 2호기 012-2654-0202 / 3호기 012-2654-0307).
-- 기존 sites.emergency_phone은 현장 대표번호로 남기고, 호기별 번호를 units에 둔다.
alter table public.units add column if not exists emergency_phone text;

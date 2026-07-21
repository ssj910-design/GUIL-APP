-- 040: 위치 공유 온오프 (2026-07-21)
-- 출근 체크 시 현위치 1회 기록을 본인이 끌 수 있게 한다(프라이버시). 끄면 출근해도 위치를
-- 저장하지 않고, 고장 배정의 '가까운 기사' 정렬에서 빠진다. 상시 추적은 원래 안 한다.
alter table public.profiles add column if not exists share_location boolean not null default true;

-- 044: 퇴근 위치 (2026-07-21)
-- 퇴근/당직 마감을 누른 곳의 좌표를 기록한다(출근 위치 attendances.lat/lng와 별개).
-- 관리자가 출근부에서 '어디서 퇴근했나'를 지도로 확인할 수 있게. 위치 공유 ON인 사람만.
alter table public.attendances add column if not exists out_lat double precision;
alter table public.attendances add column if not exists out_lng double precision;

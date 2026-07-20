-- 035: 출근 체크 시 현위치 1회 기록 (2026-07-20)
-- GPS를 상시 켜두면 배터리가 남아나지 않는다. 그래서 하루 한 번, 출근 버튼을 누르는
-- 그 순간에만 좌표를 받아 저장한다. 이 좌표로 고장 배정 시 '가까운 기사'를 정렬한다.
-- 위치 권한을 거부해도 출근 체크 자체는 정상 동작한다(좌표만 null).
alter table public.attendances add column if not exists lat double precision;
alter table public.attendances add column if not exists lng double precision;
alter table public.attendances add column if not exists located_at timestamptz;

-- 현장 좌표 캐시 — 주소를 매번 지오코딩하면 티맵 호출 한도를 넘긴다. 한 번 변환해 저장한다.
alter table public.sites add column if not exists lat double precision;
alter table public.sites add column if not exists lng double precision;
alter table public.sites add column if not exists geocoded_at timestamptz;

select
  (select count(*) from public.sites where lat is not null) as 좌표있는현장,
  (select count(*) from public.sites) as 전체현장;

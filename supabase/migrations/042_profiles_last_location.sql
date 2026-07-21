-- 042: 기사 마지막 확인 위치 (2026-07-21)
-- 배정의 '가까운 기사'는 아침 출근 위치만으로는 오후에 부정확하다(강남서 출근했어도
-- 오후엔 분당 현장). 그래서 위치를 이벤트마다 최신화한다:
--   출근      → GPS 좌표 (아침 출발지, 위치 공유 켠 사람만)
--   현장 도착 → 그 현장 좌표 (GPS 불필요, 도착 = 그 현장에 있음)
--   처리완료  → 그 현장 좌표
--   점검완료  → 그 현장 좌표
-- 현장 좌표는 업무 기록이라 위치 공유를 꺼도 갱신한다(GPS만 프라이버시 대상).
-- 배정 정렬은 attendances.lat 대신 이 last_lat/lng를 쓴다.
alter table public.profiles add column if not exists last_lat double precision;
alter table public.profiles add column if not exists last_lng double precision;
alter table public.profiles add column if not exists last_loc_at timestamptz;
alter table public.profiles add column if not exists last_loc_label text;  -- '출근' 또는 현장명

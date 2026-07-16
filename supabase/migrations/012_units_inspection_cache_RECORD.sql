-- ============================================================
-- 012. [기록] units에 검사유효기간 캐시 — 대량 실시간 API 호출 제거
--
-- 배경: 실데이터 임포트(876대) 후 홈/검사관리 화면이 호기 전수에
-- 공단 API를 호출(1회 로드에 876콜) → 일일 트래픽 한도 초과·502.
-- 검사유효기간을 units에 저장하고 대량 화면은 DB를 읽는다.
-- 실시간 API는 호기 상세(단건)에서만 사용. 초기값은 공단 엑셀에서 백필.
-- inspection_result는 파일에 없어 null 시작 — 상세 조회 시점에 갱신 가능.
-- ============================================================
alter table public.units add column if not exists inspection_start date;
alter table public.units add column if not exists inspection_end date;
alter table public.units add column if not exists inspection_result text;

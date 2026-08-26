-- 같은 현장 여러 호기를 한 번에 견적요청하면 지금까지 호기 수만큼 quote_requests 행이
-- 각각 생겼다(자재신청과 같은 패턴). 견적은 이제 현장 1건으로 합치고, 그 요청이 다루는
-- 호기 전체 목록은 elevator_nos에 따로 담아 화면(요청 인박스·할일 제목·완료보고서)에서
-- "1호기, 2호기"처럼 같이 보여준다. 기존 단수 elevator_no/unit_id는 그대로 두고 대표
-- 호기(첫 번째 선택 호기)를 계속 담아, FK·집계 등 기존 코드는 변경 없이 그대로 동작한다.
-- 자재지급완료(할일 생성)·비용청구까지 같은 목록을 그대로 들고 가도록 todos·billings에도
-- 같은 컬럼을 추가한다.

alter table public.quote_requests add column if not exists elevator_nos text[];
alter table public.todos add column if not exists elevator_nos text[];
alter table public.billings add column if not exists elevator_nos text[];

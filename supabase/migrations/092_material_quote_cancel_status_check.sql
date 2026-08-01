-- 091에서 추가한 자재·견적 취소 기능이 실제로 막혀 있었다 (2026-08-01)
-- material_requests.status에 걸린 체크 제약(material_requests_status_check)이
-- 기존 값(승인대기/지급완료/반려)만 허용해서 '취소'로 업데이트하면
-- "violates check constraint" 에러가 났다. quote_requests도 같은 패턴이라
-- 같이 손본다(요청접수/견적발행/승인/자재지급완료).

alter table material_requests drop constraint if exists material_requests_status_check;
alter table material_requests add constraint material_requests_status_check
  check (status in ('승인대기', '지급완료', '반려', '취소'));

alter table quote_requests drop constraint if exists quote_requests_status_check;
alter table quote_requests add constraint quote_requests_status_check
  check (status in ('요청접수', '견적발행', '승인', '자재지급완료', '취소'));

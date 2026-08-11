-- 109: quote_requests.status "견적발행" → "작성" 개념 변경 (2026-08-11)
-- 안전한 순서: 제약은 신·구 값을 둘 다 허용하도록 먼저 넓히고, 기존 행을 새 값으로
-- 옮긴다. 배포된 앱 코드가 새 값("작성")만 쓰게 바뀌어도, 혹시 캐시된 이전 버전
-- 코드가 잠깐 "견적발행"을 계속 쓰더라도 제약 위반으로 깨지지 않는다.
-- 구 값을 제약에서 완전히 빼는 건 새 앱 코드가 실제로 안정적으로 도는 걸 확인한
-- 뒤 별도 후속 마이그레이션(110)으로 처리한다.

alter table public.quote_requests drop constraint if exists quote_requests_status_check;
alter table public.quote_requests add constraint quote_requests_status_check
  check (status in ('요청접수', '견적발행', '작성', '승인', '자재지급완료', '취소'));

update public.quote_requests set status = '작성' where status = '견적발행';

-- 검증
select status, count(*) from public.quote_requests group by status;

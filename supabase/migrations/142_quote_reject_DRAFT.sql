-- 142: 관리자 견적 반려/취소 (2026-09-14)
-- 관리자가 견적 요청을 반려하거나, 승인·자재지급완료 뒤 고객이 취소한 견적을 취소 처리한다.
-- 기사가 스스로 취소하는 '취소'(기사 화면에서 사라짐)와 달리 '반려'는 기사 화면에 사유와 함께
-- 남는다. 승인 후 취소인지는 approved_date 유무로 구분한다(상태값은 둘 다 '반려').
-- '견적발행'은 109에서 '작성'으로 옮겼지만, 제약에서 뺐는지 확인이 안 돼 그대로 허용해 둔다.

alter table public.quote_requests drop constraint if exists quote_requests_status_check;
alter table public.quote_requests add constraint quote_requests_status_check
  check (status in ('요청접수', '견적발행', '작성', '승인', '자재지급완료', '취소', '반려'));

alter table public.quote_requests add column if not exists reject_reason text;
alter table public.quote_requests add column if not exists rejected_at timestamptz;
alter table public.quote_requests add column if not exists rejected_by text;

-- 검증
select status, count(*) from public.quote_requests group by status;

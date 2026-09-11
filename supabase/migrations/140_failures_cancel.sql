-- 140_failures_cancel.sql  (2026-09-11 운영 DB에 실행 완료)
-- 고장 접수 취소 — 중복·오접수·고객 철회 건을 삭제하지 않고 "취소" 상태로 남긴다(이력 보존).
-- 화면·집계는 앱이 불러올 때 status='취소'를 빼서 자동으로 제외된다(ElevatorFieldApp/AdminApp 로더).
-- 자재·견적 취소(091·092)와 같은 모양.

alter table public.failures add column if not exists cancelled_at    timestamptz;
alter table public.failures add column if not exists cancelled_by    text;   -- 취소한 사람 이름(표시용)
alter table public.failures add column if not exists cancelled_by_id uuid references public.profiles(id);
alter table public.failures add column if not exists cancel_reason   text;   -- 중복 접수 / 잘못 접수 / 고객 철회 / 기타(직접 입력)

-- 기존 status 허용값(미처리·진행중·완료)에 '취소' 추가 — 이게 없으면 취소 저장이 거부된다.
alter table public.failures drop constraint failures_status_check;
alter table public.failures add constraint failures_status_check
  check (status in ('미처리', '진행중', '완료', '취소'));

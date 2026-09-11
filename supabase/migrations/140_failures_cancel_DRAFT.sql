-- 140_failures_cancel_DRAFT.sql
-- 고장 접수 취소 — 중복·오접수·고객 철회 건을 삭제하지 않고 "취소" 상태로 남긴다(이력 보존).
-- 화면·집계는 앱이 불러올 때 status='취소'를 빼서 자동으로 제외된다(ElevatorFieldApp/AdminApp 로더).
-- 컬럼이 생기기 전에는 앱이 취소 버튼 자체를 숨긴다(failures.cancelled_at 유무로 판단).
-- 자재·견적 취소(091·092)와 같은 모양.

alter table public.failures add column if not exists cancelled_at    timestamptz;
alter table public.failures add column if not exists cancelled_by    text;   -- 취소한 사람 이름(표시용)
alter table public.failures add column if not exists cancelled_by_id uuid references public.profiles(id);
alter table public.failures add column if not exists cancel_reason   text;   -- 중복 접수 / 잘못 접수 / 고객 철회 / 기타(직접 입력)

-- ⚠ 실행 전 확인: failures.status에 CHECK 제약이 있으면 '취소'를 허용 목록에 추가해야 한다
-- (자재·견적은 092에서 그렇게 했다). 마이그레이션 기록엔 제약이 없지만 초기 스키마에 있을 수 있다.
--   select conname, pg_get_constraintdef(oid)
--   from pg_constraint where conrelid = 'public.failures'::regclass and contype = 'c';
-- 결과에 status 제약이 있으면 예:
--   alter table public.failures drop constraint <제약이름>;
--   alter table public.failures add constraint <제약이름>
--     check (status in ('미처리', '진행중', '완료', '취소'));

-- ============================================================
-- 060. [초안] error_code_requests — 에러코드 등록요청 큐
-- 기사가 고장처리결과 입력 중 코드집(error_codes)에 없는 에러코드를 발견하면
-- 여기로 등록요청을 보내고, 관리자가 에러코드집 화면에서 검토 후 승인(→error_codes
-- 반영)/반려한다. 기사가 error_codes에 직접 쓰지 못하게 하는 게 이 테이블의 목적.
-- ⚠️ 팀 상의 후 Supabase SQL Editor에서 직접 실행할 것 — Claude가 자동 실행하지 않는다.
-- ============================================================
create table if not exists public.error_code_requests (
  id              uuid primary key default gen_random_uuid(),
  model           text not null,
  code            text not null,
  meaning         text,                 -- 기사가 아는 의미(선택) — 관리자가 승인 시 그대로 반영 가능
  common_cause    text,
  standard_action text,
  failure_id      text references public.failures(id) on delete set null,  -- 어느 고장건에서 올라왔는지(선택)
  site_name       text,                 -- 요청 당시 현장명(조회 편의용 스냅샷)
  elevator_no     text,
  requester_id    uuid references public.profiles(id),
  requester_name  text,                 -- 요청자 이름 스냅샷(프로필 삭제돼도 기록 유지)
  status          text not null default '대기' check (status in ('대기', '승인', '반려')),
  reject_reason   text,
  reviewed_at     timestamptz,
  created_at      timestamptz not null default now()
);

-- 검증: 유니크 아님(같은 코드로 여러 번 요청 가능, 승인 시 error_codes의 (model,code) 유니크가 중복을 막음)
select conname from pg_constraint where conrelid = 'public.error_code_requests'::regclass;

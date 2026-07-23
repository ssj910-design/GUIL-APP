-- ============================================================
-- 051. [초안] error_codes — 승강기 기종별 에러코드집
-- 기사가 고장처리결과에 입력하는 에러코드를 기종별로 등록해두고,
-- 과거 처리이력(failures.unit_id → units.model 조인)과 함께 조회하기 위한 테이블.
-- ⚠️ 팀 상의 후 Supabase SQL Editor에서 직접 실행할 것 — Claude가 자동 실행하지 않는다.
-- ============================================================
create table if not exists public.error_codes (
  id              uuid primary key default gen_random_uuid(),
  model           text not null,        -- units.model과 문자열 완전일치로 매칭 (예: "OTIS Gen2")
  code            text not null,        -- 예: "E-32"
  meaning         text,                 -- 코드 의미 (관리자 입력, 비어있을 수 있음)
  common_cause    text,                 -- 흔한 원인 (선택)
  standard_action text,                 -- 표준 조치법 (선택)
  created_at      timestamptz not null default now(),
  unique (model, code)
);

-- 검증: 유니크 제약이 걸렸는지 확인
select conname from pg_constraint where conrelid = 'public.error_codes'::regclass and contype = 'u';

-- ============================================================
-- 040. [기록] 검사이력 부적합상세 캐시 테이블 신설
--
-- 배경: 현장정보 > 승강기정보 > 검사이력 화면이 느린 원인은 회차마다
-- 국가승강기정보센터 부적합내역조회 API를 순차 호출하기 때문이다.
-- 과거 회차의 부적합내역(fail_cd로 조회)은 한번 확정되면 절대 바뀌지
-- 않는 데이터라 캐시하기 딱 좋다 — fail_cd 기준으로 한 번 받아두면
-- 그 다음부터는(같은 호기든 다른 호기든) DB에서 바로 내려준다.
--
-- Supabase 대시보드 SQL Editor에서 실행 완료 (2026-07-21).
-- ============================================================

create table if not exists public.inspection_fail_cache (
  fail_cd    text primary key,     -- 국가승강기정보센터 부적합내역조회코드
  items      jsonb not null default '[]'::jsonb,
  reason     text,                 -- items가 비어있는 이유 (no_items_for_fail_code 등)
  cached_at  timestamptz not null default now()
);

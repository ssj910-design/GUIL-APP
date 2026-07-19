-- ============================================================
-- 020. [기록] 자체점검 승강기민원24 제출용 컬럼·테이블 추가
--
-- 배경: 정기점검(자체점검) 결과를 국가승강기정보센터(승강기민원24)의
-- RegistInspectionService에 실제로 제출하려면, 지금 self_checks에는
-- 없는 두 가지가 필요하다.
--   1) 호기 1대·점검월 1건마다 ~200개 점검항목(SEL_CHK_ITEM_CD)의 결과를
--      담아야 하는데, 매번 전부 입력하지 않고 "기본 양호(A) + 예외만
--      입력" 방식으로 하기로 함(기사 UX 결정) — 예외 항목만
--      self_check_items에 저장하고, 제출 시점에 코드표 기준으로
--      나머지를 전부 A로 채워 RESULT_LIST를 완성한다.
--   2) 제출 이력(성공/실패, 공단 응답코드, 우리가 부여한
--      COMPANY_UNIQUE_NO — 삭제 요청 시 이 값으로 대상을 찾음)을
--      self_checks에 남겨야 한다.
--
-- Supabase 대시보드 SQL Editor에서 실행 완료 (2026-07-19).
-- ============================================================

alter table public.self_checks add column if not exists gov_company_unique_no text;
alter table public.self_checks add column if not exists gov_submitted_at timestamptz;
alter table public.self_checks add column if not exists gov_result_code text;
alter table public.self_checks add column if not exists gov_result_msg text;

create table if not exists public.self_check_items (
  id            uuid primary key default gen_random_uuid(),
  self_check_id uuid not null references public.self_checks(id) on delete cascade,
  item_cd       text not null,   -- SEL_CHK_ITEM_CD (예: '91000100')
  result        text not null,   -- A 양호 | B 주의관찰 | C 긴급수리 | D 제외 | E 항목없음
  remark        text,
  unique (self_check_id, item_cd)
);

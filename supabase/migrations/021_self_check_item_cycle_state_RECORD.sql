-- ============================================================
-- 021. [기록] 자체점검 항목별 점검주기 상태(호기별) 테이블 신설
--
-- 배경: 실제 제출된 리포트(report.xls 등, 5개월치 실데이터)로 확인한 결과,
-- 자체점검 184개 항목 각각에 1/3/6개월 점검주기가 있고, 이번 달이 그
-- 주기에 해당하지 않으면 결과를 D(제외)로 채워 제출해야 한다(전부
-- 채우지 않으면 004 오류, 예외만 보내면 이것도 004 오류 — 실제로는
-- 매달 184개 항목 전체를 채워 보내되 대부분 자동 계산되는 구조).
--
-- 그런데 "이번 달이 그 항목의 점검월인지"를 계산하려면 호기마다
-- "마지막으로 실제 점검한 달"을 알아야 하고, 이건 전사 공통 캘린더
-- 규칙이 아니라 호기마다 기준월이 다르다(리포트로 실증 확인).
-- 기존 이력이 없어 최초 판단은 기사가 수기로 해야 하고("이번 달에
-- 점검하셨나요?"), 그 이후로는 이 표에 쌓인 기록으로 자동 계산한다.
--
-- Supabase 대시보드 SQL Editor에서 실행 완료 (2026-07-19).
-- ============================================================

create table if not exists public.self_check_item_states (
  id            uuid primary key default gen_random_uuid(),
  unit_id       uuid not null references public.units(id) on delete cascade,
  item_cd       text not null,       -- SEL_CHK_ITEM_CD
  applicable    boolean not null default true,  -- false = 이 호기엔 해당 없음(E) — 영구
  last_done_ym  text,                -- 마지막으로 실제 점검(A/B/C)한 년월 '2026-07', null=미확정(최초 확인 필요)
  updated_at    timestamptz not null default now(),
  unique (unit_id, item_cd)
);

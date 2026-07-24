-- 054: 고장접수 시 비고 (2026-07-24)
-- 신고내용과 별개로, 접수 시점에만 남기는 참고용 비고. 기본값은 현장정보(sites.notes)를
-- 그대로 채워 보여주되 필수 입력은 아니다. 처리결과(process_note)와는 다른 컬럼 —
-- 처리결과 화면에는 노출하지 않는다.
alter table public.failures add column if not exists report_note text;

-- 검증
select column_name from information_schema.columns
where table_schema = 'public' and table_name = 'failures'
  and column_name = 'report_note';

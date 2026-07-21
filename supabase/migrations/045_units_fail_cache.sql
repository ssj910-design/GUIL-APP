-- 045: 호기별 부적합 상세 일일 캐시 (2026-07-21)
-- 검사관리 조건부·불합격 탭이 페이지 열 때마다 국가승강기정보센터를 라이브로 불러서
-- 느렸던 문제 — 매일 도는 sync-inspection-cache 크론이 조건부합격/불합격 호기의
-- 부적합 상세까지 같이 캐싱해두고, 화면은 이 컬럼만 읽는다(외부 API 호출 없음).
alter table public.units add column if not exists fail_items jsonb;       -- [{standardArticle, standardTitle1, failDesc, failDescInspector}]
alter table public.units add column if not exists fail_reason text;       -- items가 비어있을 때 이유(no_record 등)
alter table public.units add column if not exists fail_checked_at timestamptz; -- 마지막으로 위 값을 갱신한 시각

-- 검증
select column_name from information_schema.columns
where table_schema = 'public' and table_name = 'units'
  and column_name in ('fail_items', 'fail_reason', 'fail_checked_at')
order by column_name;

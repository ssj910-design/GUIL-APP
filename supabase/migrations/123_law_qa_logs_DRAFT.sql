-- 123: 검사기준 Q&A 사용 로그 (2026-08-14)
--
-- 목적 두 가지
--  1) **진입점 비교** — 챗봇을 헤더·플로팅·하단탭 3곳에 두고 어디서 실제로 쓰는지 본다.
--     클릭 수가 아니라 "질문까지 이어진" 것만 세야 의미가 있어서 질문 시점에 기록한다.
--  2) **질문 목록** — 어떤 걸 자주 묻는지가 곧 챗봇 개선 재료(예시 질문·문서 보강 우선순위).
--
-- 누가 물었는지는 안 남긴다 — 통계 목적이라 익명이면 충분하고, "내 질문이 기록된다"는
-- 부담 없이 편하게 묻게 하는 편이 낫다.
create table if not exists law_qa_logs (
  id bigint generated always as identity primary key,
  question text not null,
  entry_point text,                 -- 'header' | 'fab' | 'tab' (어디서 열었나)
  keywords text[],                  -- AI가 뽑은 검색어 (검색 실패 원인 분석용)
  source_count int,                 -- 찾은 근거 수 (0이면 "답 못 함")
  created_at timestamptz not null default now()
);

create index if not exists law_qa_logs_created_idx on law_qa_logs (created_at desc);

-- 통계 예시:
--   진입점별  select entry_point, count(*) from law_qa_logs group by 1 order by 2 desc;
--   못 답한 질문  select question from law_qa_logs where source_count = 0 order by created_at desc;

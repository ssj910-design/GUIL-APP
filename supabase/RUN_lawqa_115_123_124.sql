-- =====================================================================
-- 검사기준 Q&A 챗봇 켜기 — 마이그레이션 115·123·124 합본
--
-- 사용법: 이 파일 **내용 전체를 복사**해서 Supabase → SQL Editor에 붙여넣고 Run.
--        (파일 경로를 붙여넣으면 syntax error가 난다 — 내용을 넣어야 한다)
--
-- 전부 새 테이블/인덱스/함수라 기존 데이터는 건드리지 않는다.
-- 여러 번 실행해도 안전하다 (if not exists / or replace).
-- 원본: supabase/migrations/115·123·124_*.sql
-- =====================================================================


-- ─────────────────────────────────────────────────────────────────────
-- 115_knowledge_search_DRAFT.sql
-- ─────────────────────────────────────────────────────────────────────
-- 115: 법령·검사기준 챗봇용 지식 검색 (2026-08-14)
--
-- 017에서 만들어 둔 knowledge_chunks를 실제로 쓰기 시작한다. 임베딩(벡터)은 아직 안 쓰고
-- **키워드 검색**부터 — 검사기준 질문은 용어가 명확해서("정기검사 주기", "승강장문 이탈방지")
-- 키워드만으로도 상당히 맞고, API 키 발급 없이 오늘 바로 쓸 수 있다.
-- 나중에 임베딩을 붙이면 같은 테이블에 embedding만 채우고 하이브리드로 확장하면 된다.
--
-- 한국어 주의: PostgreSQL 기본 전문검색(to_tsvector)은 조사가 붙은 한국어를 제대로 못 자른다
-- ("정기검사를" ≠ "정기검사"). 그래서 부분 문자열(ILIKE)로 찾되, pg_trgm GIN 인덱스로 속도를 낸다.

create extension if not exists pg_trgm with schema extensions;

-- ILIKE '%...%' 를 인덱스로 처리하기 위한 트라이그램 인덱스
create index if not exists knowledge_chunks_content_trgm
  on knowledge_chunks using gin (content extensions.gin_trgm_ops);

-- 자주 쓰는 필터(문서 종류·시행일)를 metadata에서 바로 거르기 위한 인덱스
create index if not exists knowledge_chunks_metadata_idx
  on knowledge_chunks using gin (metadata);

-- 키워드 검색 — 모든 키워드를 포함하는 청크를 점수순으로.
--   점수 = 키워드 등장 횟수 합 + 조항 라벨에 키워드가 있으면 가산(조문 제목이 곧 주제라서)
--   최신 문서 우선(effective_date 내림차순)은 동점일 때만 적용해 "최신이라 무조건 위"가 되지 않게 한다.
create or replace function search_knowledge(
  keywords text[],
  match_count int default 8,
  filter_types text[] default null
)
returns table (
  id bigint, content text, metadata jsonb, score numeric
)
language sql stable as $$
  with hit as (
    select k.id, k.content, k.metadata,
      (
        -- 본문 등장 횟수 (대소문자 무시)
        (select coalesce(sum((length(lower(k.content)) - length(replace(lower(k.content), lower(w), ''))) / nullif(length(w), 0)), 0)
           from unnest(keywords) w)
        -- 조항 라벨/문서명에 걸리면 가산점
        + (select count(*) * 3 from unnest(keywords) w
             where coalesce(k.metadata->>'clause', '') ilike '%' || w || '%'
                or coalesce(k.metadata->>'title', '') ilike '%' || w || '%')
      )::numeric as score
    from knowledge_chunks k
    where k.source_type = 'law'
      and (filter_types is null or (k.metadata->>'docType') = any(filter_types))
      and (select bool_and(k.content ilike '%' || w || '%') from unnest(keywords) w)
  )
  select hit.id, hit.content, hit.metadata, hit.score
  from hit
  where hit.score > 0
  order by hit.score desc, (hit.metadata->>'effectiveDate') desc nulls last
  limit match_count;
$$;

-- 적재는 scripts/rag/load.mjs 가 service_role 키로 수행한다 (RLS 우회 필요).
-- 재적재 시: delete from knowledge_chunks where source_type = 'law';

-- ─────────────────────────────────────────────────────────────────────
-- 123_law_qa_logs_DRAFT.sql
-- ─────────────────────────────────────────────────────────────────────
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

-- RLS — 105·106에서 전 테이블에 켠 것과 같은 기준. 안 켜면 새 테이블만 구멍이 된다.
-- 기록은 서버(service_role)가 하고, 읽기는 콘솔 통계 화면(로그인 사용자)이 한다.
alter table law_qa_logs enable row level security;
drop policy if exists law_qa_logs_rw on law_qa_logs;
create policy law_qa_logs_rw on law_qa_logs for all to authenticated using (true) with check (true);

-- 통계 예시:
--   진입점별  select entry_point, count(*) from law_qa_logs group by 1 order by 2 desc;
--   못 답한 질문  select question from law_qa_logs where source_count = 0 order by created_at desc;

-- ─────────────────────────────────────────────────────────────────────
-- 124_ui_events_DRAFT.sql
-- ─────────────────────────────────────────────────────────────────────
-- 124: 화면 사용 로그 (2026-08-14)
--
-- 목적: "어느 화면을 실제로 쓰나"를 데이터로 보고 UI를 정리하기 위해. 지금은 감으로만
-- 판단하고 있어서 탭이 11개까지 늘었다 — 안 쓰는 화면을 알아야 줄일 수 있다.
--
-- ⚠️ **개인 단위로 추적하지 않는다.** profile_id 컬럼을 일부러 두지 않았다.
-- "누가 몇 번 눌렀나"는 UI 개선에 필요 없고, 그건 분석이 아니라 감시다.
-- (위치정보 수집을 중단한 것과 같은 기준 — docs/QA-RULES.md 9장)
create table if not exists ui_events (
  id bigint generated always as identity primary key,
  screen text not null,             -- 'home' | 'failure' | 'lawqa' … (탭 id)
  action text not null default 'view',  -- 'view'(화면 진입) | 그 외 주요 동작
  role text,                        -- 'engineer' | 'admin' (개인이 아닌 역할 단위 — 화면 구성 판단용)
  meta jsonb,
  created_at timestamptz not null default now()
);

create index if not exists ui_events_created_idx on ui_events (created_at desc);
create index if not exists ui_events_screen_idx on ui_events (screen, created_at desc);

alter table ui_events enable row level security;
-- 로그인한 사람은 남길 수 있고(쓰기), 읽기도 허용 — 통계 화면이 앱에서 직접 조회한다.
-- (다른 테이블과 같은 정책 범위 — 마이그 106)
drop policy if exists ui_events_rw on ui_events;
create policy ui_events_rw on ui_events for all to authenticated using (true) with check (true);

-- 통계 예시:
--   화면별  select screen, count(*) from ui_events where action='view' and created_at > now() - interval '14 days' group by 1 order by 2 desc;
--   역할별  select role, screen, count(*) from ui_events group by 1,2 order by 3 desc;

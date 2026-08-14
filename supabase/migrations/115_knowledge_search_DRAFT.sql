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

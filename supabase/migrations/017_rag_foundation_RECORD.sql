-- 017: RAG 초석 — pgvector + 지식 청크 테이블 + 유사도 검색 함수.
-- 아직 임베딩을 만들지는 않는다(모델 미확정). 앱 코드는 이 테이블을 전혀 참조하지 않으므로 무해.
-- 모델 확정 시: alter table knowledge_chunks alter column embedding type vector(N);
--             + create index ... using hnsw (embedding vector_cosine_ops);
-- 실행: 2026-07-17 (prod; 리허설은 pgvector 미설치면 스킵)

create extension if not exists vector with schema extensions;

create table if not exists knowledge_chunks (
  id bigint generated always as identity primary key,
  source_type text not null,        -- 'failure' | 'billing' | 'feed' | 'selfcheck' | 'manual' | 'doc'
  source_id text,                   -- 원본 행 id (원본 갱신 시 재임베딩 대상 식별)
  content text not null,            -- 검색 대상 텍스트 청크
  embedding extensions.vector,      -- 차원은 임베딩 모델 확정 후 고정
  metadata jsonb,                   -- { site_id, unit_id, date, ... } 필터용
  created_at timestamptz not null default now()
);

create index if not exists knowledge_chunks_source_idx on knowledge_chunks (source_type, source_id);
-- 벡터 인덱스(hnsw)는 차원 고정 + 데이터 적재 후에 (초기 수천 건은 풀스캔으로 충분)

-- PostgREST rpc로 호출할 유사도 검색 (cosine distance)
create or replace function match_knowledge(
  query_embedding extensions.vector,
  match_count int default 5,
  filter_source text default null
)
returns table (id bigint, source_type text, source_id text, content text, metadata jsonb, similarity float)
language sql stable as $$
  select k.id, k.source_type, k.source_id, k.content, k.metadata,
         1 - (k.embedding <=> query_embedding) as similarity
  from knowledge_chunks k
  where k.embedding is not null
    and (filter_source is null or k.source_type = filter_source)
  order by k.embedding <=> query_embedding
  limit match_count;
$$;

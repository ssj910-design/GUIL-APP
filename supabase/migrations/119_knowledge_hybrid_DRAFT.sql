-- 119: 하이브리드 검색 (키워드 + 의미) — 2026-08-18
--
-- 왜: 지금은 글자가 겹쳐야 찾는다. "도어대기타임"과 "대기시간"이 같은 뜻인 걸 모르니,
-- 검색어를 한 번 잘못 뽑으면 그대로 0건이 된다(운영 첫날 실제로 났다).
-- 임베딩은 의미가 가까우면 찾아주므로 그 실패 유형이 크게 준다.
--
-- 그런데 **벡터만 쓰면 안 된다.** 법령 질문은 "제54조", "10초", "150N"처럼 정확히 일치해야
-- 하는 말이 많은데 벡터는 그런 걸 잘 못 집는다. 그래서 둘을 합친다.
--
-- 합치는 방법은 RRF(Reciprocal Rank Fusion): 각 방식의 **순위**만 가지고 1/(60+순위)를 더한다.
-- 점수 체계가 다른 둘(키워드 점수 vs 코사인 거리)을 정규화 없이 섞을 수 있고, 튜닝할
-- 상수가 사실상 없다는 게 장점이다. 한쪽에서만 상위권이어도 살아남는다.

-- 1) 차원 고정 + 인덱스 — text-embedding-3-small = 1536차원
alter table knowledge_chunks alter column embedding type extensions.vector(1536);

-- HNSW: 근사 최근접 탐색. 5천 건 규모에선 없어도 되지만, 문서가 늘어도 그대로 간다.
create index if not exists knowledge_chunks_embedding_idx
  on knowledge_chunks using hnsw (embedding extensions.vector_cosine_ops);

-- 2) 하이브리드 검색
--    키워드 후보 30 + 벡터 후보 30을 뽑아 RRF로 합치고 상위 match_count를 준다.
create or replace function search_knowledge_hybrid(
  keywords text[],
  query_embedding extensions.vector(1536),
  match_count int default 8
)
returns table (
  id bigint, content text, metadata jsonb, score numeric
)
language sql stable as $$
  with kw as (
    -- 116과 같은 점수식(매칭 개수 우선). 여기서는 순위만 쓰므로 점수 크기는 중요하지 않다.
    select k.id,
      row_number() over (order by (
        (select count(*) * 10 from unnest(keywords) w where k.content ilike '%' || w || '%')
        + (select count(*) * 3 from unnest(keywords) w
             where coalesce(k.metadata->>'clause', '') ilike '%' || w || '%'
                or coalesce(k.metadata->>'title', '') ilike '%' || w || '%')
      ) desc) as rk
    from knowledge_chunks k
    where k.source_type = 'law'
      and (select bool_or(k.content ilike '%' || w || '%') from unnest(keywords) w)
    limit 30
  ),
  vec as (
    select k.id, row_number() over (order by k.embedding <=> query_embedding) as rv
    from knowledge_chunks k
    where k.source_type = 'law' and k.embedding is not null
    order by k.embedding <=> query_embedding
    limit 30
  )
  select k.id, k.content, k.metadata,
         (coalesce(1.0 / (60 + kw.rk), 0) + coalesce(1.0 / (60 + vec.rv), 0))::numeric as score
  from knowledge_chunks k
  left join kw on kw.id = k.id
  left join vec on vec.id = k.id
  where kw.id is not null or vec.id is not null
  order by score desc, (k.metadata->>'effectiveDate') desc nulls last
  limit match_count;
$$;

-- 임베딩이 아직 없으면(embedding is null) vec 후보가 비어 키워드 결과만 나온다 —
-- 즉 적재 전에 실행해도 지금과 똑같이 동작하고, 적재하는 만큼 좋아진다.

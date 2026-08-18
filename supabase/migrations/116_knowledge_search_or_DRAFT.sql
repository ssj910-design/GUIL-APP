-- 116: 지식 검색을 AND → OR+랭킹으로 (2026-08-18)
--
-- 115의 search_knowledge는 **모든 키워드를 포함**하는 청크만 찾았다(bool_and).
-- 키워드 하나만 빗나가도 0건이 되는 게 문제였다:
--   "자체점검 결과 제출 기한" → ["자체점검","제출","기한"] → 0건
--   정답은 시행령 제29조인데, 원문은 "제출"이 아니라 "통보"·"입력기한"이라 AND가 깨진다.
--
-- 그래서 **하나라도 걸리면 후보로 삼고(bool_or) 점수로 줄 세운다.**
-- 점수 = 매칭된 키워드 수 × 10  (많이 걸릴수록 크게 → 전부 걸린 것이 자연히 맨 위, AND 우선 효과)
--        + 본문 등장 횟수        (같은 개수면 자주 나오는 쪽)
--        + 조항/문서명 가산 × 3   (조문 제목이 곧 주제라서)
--
-- 함수 시그니처는 그대로라 앱 수정은 필요 없다. or replace 라 여러 번 실행해도 안전하다.

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
        -- 몇 개의 키워드가 걸렸나 (가장 큰 가중치 — 전부 걸린 청크가 위로 온다)
        (select count(*) * 10 from unnest(keywords) w where k.content ilike '%' || w || '%')
        -- 본문 등장 횟수 (대소문자 무시)
        + (select coalesce(sum((length(lower(k.content)) - length(replace(lower(k.content), lower(w), ''))) / nullif(length(w), 0)), 0)
             from unnest(keywords) w)
        -- 조항 라벨/문서명에 걸리면 가산점
        + (select count(*) * 3 from unnest(keywords) w
             where coalesce(k.metadata->>'clause', '') ilike '%' || w || '%'
                or coalesce(k.metadata->>'title', '') ilike '%' || w || '%')
      )::numeric as score
    from knowledge_chunks k
    where k.source_type = 'law'
      and (filter_types is null or (k.metadata->>'docType') = any(filter_types))
      -- 하나라도 걸리면 후보 (115는 bool_and 였다)
      and (select bool_or(k.content ilike '%' || w || '%') from unnest(keywords) w)
  )
  select hit.id, hit.content, hit.metadata, hit.score
  from hit
  where hit.score > 0
  order by hit.score desc, (hit.metadata->>'effectiveDate') desc nulls last
  limit match_count;
$$;

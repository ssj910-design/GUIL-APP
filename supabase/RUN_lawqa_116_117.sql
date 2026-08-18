-- =====================================================================
-- 검사기준 챗봇 개선 — 마이그 116(검색 방식) + 117(답변 평가) 합본
--
-- 사용법: 이 내용 전체를 복사해서 Supabase → SQL Editor에 붙여넣고 Run.
-- 데이터는 안 건드린다. 116은 함수 교체(or replace), 117은 컬럼 추가(if not exists).
-- 여러 번 실행해도 안전하다.
-- =====================================================================

-- ─────────────────────────────────────────────────────────────────────
-- 116_knowledge_search_or_DRAFT.sql
-- ─────────────────────────────────────────────────────────────────────
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

-- ─────────────────────────────────────────────────────────────────────
-- 117_law_qa_rating_DRAFT.sql
-- ─────────────────────────────────────────────────────────────────────
-- 117: 챗봇 답변 평가 (2026-08-18)
--
-- 왜 필요한가: 지금은 "근거를 몇 건 찾았나"로만 성공을 판단하는데, 근거를 1건 찾고도
-- 엉뚱하게 답하는 경우가 실제로 있었다. 법령 답변은 틀리면 기사가 잘못된 기준으로
-- 검사하게 되므로, **사람이 틀렸다고 눌러준 신호**가 유일하게 믿을 수 있는 품질 지표다.
--
-- 싫어요가 붙은 질문은 (1) 문서 보강 (2) 검색어 규칙 수정 (3) 추천 질문에서 제외
-- 의 재료가 된다.
--
-- 누가 눌렀는지는 안 남긴다 — 123과 같은 기준(익명이면 충분하다).

alter table law_qa_logs add column if not exists rating smallint;   -- 1=좋아요, -1=싫어요, null=평가 안 함
alter table law_qa_logs add column if not exists rated_at timestamptz;

comment on column law_qa_logs.rating is '1=좋아요, -1=싫어요, null=미평가';

-- 통계 예시:
--   싫어요 목록  select question, keywords, source_count from law_qa_logs where rating = -1 order by created_at desc;
--   만족도       select rating, count(*) from law_qa_logs where rating is not null group by 1;

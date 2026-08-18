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

-- 120: 챗봇 토큰 사용량 기록 (2026-08-18)
--
-- 왜: "이거 쓰면 돈이 얼마나 나가나"를 콘솔에서 봐야 한다. 질문 1건에 API를 3번 부른다
-- (검색어 추출 → 질문 임베딩 → 답변 생성). 감으로 추정하지 말고 실제 사용량을 남긴다.
--
-- **비용(원)이 아니라 토큰을 저장하는 이유**: 단가는 바뀐다. 토큰을 남겨두면 단가가 바뀌어도
-- 과거 기록을 다시 계산할 수 있지만, 원화로 굳혀 저장하면 되돌릴 수 없다.
--
-- 형태: {"in": 프롬프트토큰, "out": 생성토큰, "embed": 임베딩토큰}

alter table law_qa_logs add column if not exists tokens jsonb;

comment on column law_qa_logs.tokens is '{"in":.., "out":.., "embed":..} — 단가는 화면에서 곱한다(단가 변동 대비)';

-- 통계 예시 (gpt-4.1-mini 기준 단가는 화면 상수와 맞출 것):
--   select sum((tokens->>'in')::int) as in_tok, sum((tokens->>'out')::int) as out_tok,
--          sum((tokens->>'embed')::int) as embed_tok
--   from law_qa_logs where created_at > now() - interval '30 days';

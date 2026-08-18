-- 118: 챗봇 로그에 답변·근거 보관 (2026-08-18)
--
-- 왜: 지금은 질문·검색어·근거 건수만 남는다. 싫어요가 붙어도 **무슨 답을 했길래 틀렸는지**를
-- 볼 수 없어서 고칠 수가 없다. 실제로 "장애인용 도어대기타임" 실패를 파악할 때
-- 로그만으로는 부족해서 원문을 직접 뒤져야 했다.
--
-- 답변과 "어떤 조항을 근거로 삼았는지"까지 남기면 진단이 로그 안에서 끝난다:
--   근거가 엉뚱함 → 검색 문제 (검색어 규칙·랭킹)
--   근거는 맞는데 답이 틀림 → 답변 프롬프트 문제
-- 이 둘은 고치는 곳이 달라서 구분이 중요하다.
--
-- sources는 전문이 아니라 식별용 요약만 넣는다(조항·문서명). 원문은 knowledge_chunks에 있다.

alter table law_qa_logs add column if not exists answer text;
alter table law_qa_logs add column if not exists sources jsonb;   -- [{clause, title}, ...]

comment on column law_qa_logs.answer is '실제로 보여준 답변 — 싫어요 진단에 필요';
comment on column law_qa_logs.sources is '근거로 삼은 조항 요약 [{clause,title}] — 검색 문제인지 답변 문제인지 가른다';

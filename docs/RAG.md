# RAG 초석 설계 (2026-07-17)

AI 기능(우리방 빠른답변 추천, 기술 Q&A, 유사 고장 검색)의 공통 기반.
**지금은 그릇만 만들어둔 상태** — 017 마이그레이션(pgvector + knowledge_chunks + match_knowledge)이 전부이고, 앱 코드는 아직 아무것도 참조하지 않는다.

## 목표 기능 (우선순위 순)

1. **우리방 빠른답변 AI 추천** — 답장 누르면 대화 맥락 + 회사 데이터 기반 답변 후보 2~3개 제안 (빠른답변 1·2안은 보류, 3안 확정)
2. **유사 고장 검색** — "이 호기 문닫힘 이상, 예전에 어떻게 고쳤지?" → 같은 호기/기종의 과거 고장·부품교체 이력 검색
3. **기술 Q&A 봇** — 자체점검 항목·법규·사내 노하우 질의응답 (SaaS 유료 기능 후보)

## 데이터 소스 → 청크 전략

| source_type | 원본 | 청크 내용 (한 건 = 한 문서) |
|---|---|---|
| failure | failures (처리완료 건) | "현장·호기·종류 / 증상 / 처리 결과 / 소요시간" 한 단락 |
| billing | billings | "현장·호기 / 교체 부품 / 비용 / 날짜" |
| feed | feed_posts | 대화는 날짜 단위로 묶어 1청크 (단문 개별 임베딩은 낭비) |
| selfcheck | self_checks 특이사항 | 특이사항 있는 건만 |
| manual | 수동 등록 | 사내 노하우·매뉴얼 발췌 (관리자 콘솔에서 입력, 추후) |

metadata에 `{site_id, unit_id, kind, date}` 저장 → 벡터 검색 전에 SQL 필터(같은 호기/기종 우선).

## 파이프라인 (구현 시)

- **적재**: Vercel Cron(일 1회) → 신규/변경 행 청크 생성 → 임베딩 API → knowledge_chunks upsert (source_type+source_id 기준)
- **질의**: 질문 임베딩 → `match_knowledge(embedding, 5, filter)` rpc → 상위 청크를 프롬프트에 넣어 LLM 호출
- **생성 모델**: Claude Haiku 4.5 (추천 답변·요약, 저비용) / 복잡한 Q&A만 Sonnet
- **임베딩 모델 후보** (확정 시 컬럼 차원 고정 + hnsw 인덱스):
  - voyage-3.5-lite (Anthropic 권장 생태계, 1024차원, 한국어 양호) ← 1순위
  - OpenAI text-embedding-3-small (1536차원, 무난)
- 확정 절차: `alter table knowledge_chunks alter column embedding type vector(N);` → 재적재 → `create index ... using hnsw (embedding vector_cosine_ops);`

## 비용 감각 (구일 단독 기준)

고장 1,000건 + 청구 500건 임베딩 ≈ 수십만 토큰 = **몇백 원 수준**. 빠른답변 1회 = Haiku 호출 1번 ≈ 1~2원. 부담 없음 — 키 발급만 하면 됨 (Anthropic API 키 + Voyage 키).

## 멀티테넌트 (Phase 2에서)

- knowledge_chunks에 `tenant_id` 추가 + RLS — 업체 간 지식 격리 필수
- 단, "전 업체 공통 지식"(법규·점검코드)은 tenant_id null로 공유

## 하지 않기로 한 것

- 실시간 임베딩 (쓰기마다 API 호출) — 일 배치면 충분
- 별도 벡터 DB (Pinecone 등) — Supabase pgvector로 충분, 규모 문제 없음


## 검사기준 Q&A — 진입점 3곳 비교 실험 (2026-08-14 ~ )

기술 Q&A 봇(위 3순위)의 첫 구현. 공단 법령자료 현행본 45개 → 청크 5,036개(조항 라벨 94%),
키워드 검색(pg_trgm) + Haiku 답변, 근거(조항·시행일·원문링크) 필수 표시.

**어디에 둘지 정하려고 3곳에 동시에 뒀다** — 클릭이 아니라 **질문까지 이어진 진입점**을 센다
(`law_qa_logs.entry_point`, 마이그 123). 눌러만 보고 안 쓰면 의미가 없어서다.

| 진입점 | 값 | 형태 |
|---|---|---|
| 헤더 아이콘(마이페이지 왼쪽) | `header` | 시트 — 하던 화면을 안 잃음 |
| 플로팅(게시판 위, 관리자면 가운데) | `fab` | 시트 |
| 하단 탭 "검사기준" | `tab` | 탭 전환 |

**정리 시점**: 실사용 2~4주 뒤 로그를 보고 **1곳만 남긴다**(나머지 제거).
```sql
select entry_point, count(*) from law_qa_logs group by 1 order by 2 desc;
select question from law_qa_logs where source_count = 0 order by created_at desc; -- 못 답한 질문
```
못 답한 질문 목록은 예시 질문·문서 보강의 재료로 쓴다.
